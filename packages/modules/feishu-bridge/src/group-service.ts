import { Client, AppType, Domain } from '@larksuiteoapi/node-sdk'
import { BridgeRelationsConflictError, BridgeRelationsStore, bridgeRelationsInputSchema, type BridgeRelations, type BridgeRelationsInput } from '@askx/core/bridge-relations'
import { resolveFeishuCredentials, feishuCredentialsSchema } from '@askx/core/bridge-credentials'
import type { BridgeFeishuConfig } from '@askx/core/config'
import { BridgeProjectService, normalizeProjectPath } from './project-service.js'
import type { BridgeRpcClient, BridgeThreadSummary } from './thread-service.js'

/** 构造飞书客户端；密钥只存在于当前服务端调用。 */
export async function createBridgeFeishuClient(config: BridgeFeishuConfig, appSecret?: string): Promise<Client> {
  const credentials = config.source === 'custom' && appSecret
    ? feishuCredentialsSchema.parse({ appId: config.appId, appSecret })
    : await resolveFeishuCredentials(config)
  return new Client({ ...credentials, appType: AppType.SelfBuild, domain: Domain.Feishu, logger: { error() {}, warn() {}, info() {}, debug() {}, trace() {} } })
}
/** 测试草稿身份；不发送消息、不修改配置。 */
export async function testBridgeFeishuConnection(config: BridgeFeishuConfig, appSecret?: string): Promise<void> {
  try {
    const client = await createBridgeFeishuClient(config, appSecret)
    const response = await client.request({ url: '/open-apis/bot/v3/info', method: 'GET' })
    if (response.code !== 0 || !response.bot?.open_id) throw new Error('Unavailable')
  } catch { throw new Error('Feishu connection failed; check the application credentials and permissions') }
}
/** 可安全返回给调用方的关联校验失败原因。 */
export type BridgeAssociationValidationCode = 'project_unavailable' | 'project_path_mismatch' | 'thread_unavailable' | 'thread_project_mismatch'

/** 关联校验错误；不携带底层 RPC 或文件系统错误详情。 */
export class BridgeAssociationValidationError extends Error {
  /** 创建包含目标身份的安全校验错误。 */
  constructor(
    /** 稳定的失败原因。 */
    readonly code: BridgeAssociationValidationCode,
    /** 本次授权的项目路径。 */
    readonly projectPath: string,
    /** 涉及的会话标识。 */
    readonly threadId?: string,
  ) {
    super({
      project_unavailable: 'Project unavailable / 项目不可用',
      project_path_mismatch: 'Use the canonical project path / 请使用规范项目路径',
      thread_unavailable: 'Thread unavailable / 会话不可用',
      thread_project_mismatch: 'Thread does not belong to the selected project / 会话不属于所选项目',
    }[code])
  }
}

/** 跨项目 API 与飞书 API 的关系编排，持久化只委托 Core。 */
export class BridgeGroupService {
  /** 注入同一项目 owner 和协议客户端，避免自行推断目录归属。 */
  constructor(private readonly store: BridgeRelationsStore, private readonly projects: BridgeProjectService, private readonly client: BridgeRpcClient) {}

  /** 返回包含空关联群的关系快照。 */
  read(): Promise<BridgeRelations> { return this.store.read() }

  /** 为群组当前项目创建会话，关联提交成功后才允许调用方发送首轮。 */
  async createThread(chatId: string, projectPath: string, create: (path: string) => Promise<BridgeThreadSummary>): Promise<BridgeThreadSummary> {
    /** 创建前保留授权快照，期间的项目切换由关系版本冲突阻止。 */
    const snapshot = await this.store.read()
    if (!snapshot.projectGroups.some(link => link.chatId === chatId && link.projectPath === projectPath && link.active)) throw new Error('Project is read-only for this group / 当前项目已归档，只能查看')
    /** 未提交关联的会话不会接收用户消息或自动激活其他项目。 */
    const thread = await create(projectPath)
    await this.save({
      groups: snapshot.groups,
      projectGroups: snapshot.projectGroups,
      threadGroups: [...snapshot.threadGroups, { chatId, projectPath, threadId: thread.id }],
      migrationConflicts: snapshot.migrationConflicts,
    }, snapshot.revision)
    return thread
  }

  /** 只核验新增授权和重新激活的项目；历史关系保留或删除不依赖外部目标可用性。 */
  async save(input: BridgeRelationsInput, revision: number): Promise<BridgeRelations> {
    /** 先检查版本，避免过期草稿触发无关的远端核验。 */
    const snapshot = await this.store.read()
    if (snapshot.revision !== revision) throw new BridgeRelationsConflictError(snapshot)
    /** Core 边界归一化后的本次关系。 */
    const parsed = bridgeRelationsInputSchema.parse(input)
    /** 具体项目关系的原有激活状态。 */
    const previousProjects = new Map(snapshot.projectGroups.map(link => [JSON.stringify([link.chatId, link.projectPath]), link.active]))
    /** 原有具体会话共享授权。 */
    const previousThreads = new Set(snapshot.threadGroups.map(link => JSON.stringify([link.chatId, link.projectPath, link.threadId])))
    /** 新增共享关系即使复用历史会话也必须重新核验。 */
    const addedThreads = parsed.threadGroups.filter(link => !previousThreads.has(JSON.stringify([link.chatId, link.projectPath, link.threadId])))
    /** 本次需要核验的项目路径。 */
    const paths = new Set(parsed.projectGroups.filter(link => {
      const previous = previousProjects.get(JSON.stringify([link.chatId, link.projectPath]))
      return previous === undefined || (!previous && link.active)
    }).map(link => link.projectPath))
    for (const link of addedThreads) paths.add(link.projectPath)
    for (const path of paths) {
      /** 项目 owner 负责目录身份与注册状态校验。 */
      let project
      try { project = await this.projects.requireProject(path) }
      catch { throw new BridgeAssociationValidationError('project_unavailable', path) }
      if (project.path !== path) throw new BridgeAssociationValidationError('project_path_mismatch', path)
    }
    /** 同次新增的共享会话按身份去重读取。 */
    const checkedThreads = new Set<string>()
    for (const link of addedThreads) {
      if (checkedThreads.has(link.threadId)) continue
      /** 读取失败与归属不符分别返回稳定错误。 */
      let result: { thread?: { id?: string, cwd?: string } }
      try { result = await this.client.request('thread/read', { threadId: link.threadId, includeTurns: false }) as typeof result }
      catch { throw new BridgeAssociationValidationError('thread_unavailable', link.projectPath, link.threadId) }
      if (result?.thread?.id !== link.threadId || !result.thread.cwd) throw new BridgeAssociationValidationError('thread_unavailable', link.projectPath, link.threadId)
      /** 会话 cwd 需要解析为真实项目目录。 */
      let cwd: string
      try { cwd = await normalizeProjectPath(result.thread.cwd) }
      catch { throw new BridgeAssociationValidationError('thread_project_mismatch', link.projectPath, link.threadId) }
      if (cwd !== link.projectPath) throw new BridgeAssociationValidationError('thread_project_mismatch', link.projectPath, link.threadId)
      checkedThreads.add(link.threadId)
    }
    return this.store.replace(parsed, revision)
  }

  /**
   * 将群组的一个历史项目设为当前项目，并保留旧项目和旧会话关系。
   * @param chatId 飞书群标识。
   * @param projectPath 要激活的规范项目路径。
   * @param revision 客户端读取到的关系版本。
   * @returns 激活后的关系快照。
   */
  async activateProject(chatId: string, projectPath: string, revision: number): Promise<BridgeRelations> {
    return this.setProjectActive(chatId, projectPath, true, revision)
  }

  /**
   * 设置指定项目的激活状态，保留关联及历史会话。
   * @param chatId 飞书群标识。
   * @param projectPath 目标规范项目路径。
   * @param active 打开时互斥激活目标，关闭时仅停用目标。
   * @param revision 客户端读取到的关系版本。
   * @returns Core 确认提交后的关系快照。
   */
  async setProjectActive(chatId: string, projectPath: string, active: boolean, revision: number): Promise<BridgeRelations> {
    /** 当前已确认的关系快照；过期请求在准备草稿前拒绝。 */
    const snapshot = await this.store.read()
    if (snapshot.revision !== revision) throw new BridgeRelationsConflictError(snapshot)
    if (!snapshot.groups.some(group => group.chatId === chatId)) throw new Error('Unknown bridge group')
    if (!active && !snapshot.projectGroups.some(link => link.chatId === chatId && link.projectPath === projectPath)) throw new Error('Project is not linked to this group / 项目尚未关联此群')
    /** 打开沿用历史兼容行为，关闭只修改准确匹配的关联。 */
    const projectGroups = active
      ? snapshot.projectGroups
        .filter(link => !(link.chatId === chatId && link.projectPath === projectPath))
        .map(link => link.chatId === chatId ? { ...link, active: false } : link)
      : snapshot.projectGroups.map(link => link.chatId === chatId && link.projectPath === projectPath ? { ...link, active: false } : link)
    if (active) projectGroups.push({ chatId, projectPath, active: true })
    return this.save({
      groups: snapshot.groups,
      projectGroups,
      threadGroups: snapshot.threadGroups,
      migrationConflicts: active ? snapshot.migrationConflicts.filter(conflict => conflict.chatId !== chatId) : snapshot.migrationConflicts,
    }, revision)
  }

  /** 同步机器人有权访问的群，只刷新群名称，保留关联和已记录群。 */
  async sync(config: BridgeFeishuConfig): Promise<BridgeRelations> {
    const snapshot = await this.store.read()
    const groups = new Map(snapshot.groups.map(group => [group.chatId, group]))
    try {
      const client = await createBridgeFeishuClient(config)
      let cursor: string | undefined
      const cursors = new Set<string>()
      do {
        const result = await client.im.chat.list({ params: { page_size: 100, ...(cursor ? { page_token: cursor } : {}) } })
        if (result.code !== 0) throw new Error('Unavailable')
        for (const group of result.data?.items ?? []) {
          if (group.chat_id && group.name) groups.set(group.chat_id, { chatId: group.chat_id, name: group.name })
        }
        cursor = result.data?.has_more ? result.data.page_token : undefined
        if (cursor && cursors.has(cursor)) throw new Error('Repeated Feishu cursor')
        if (cursor) cursors.add(cursor)
      } while (cursor)
    } catch { throw new Error('Could not load Feishu groups; check bot permissions') }
    return this.store.replace({ groups: [...groups.values()], projectGroups: snapshot.projectGroups, threadGroups: snapshot.threadGroups, migrationConflicts: snapshot.migrationConflicts }, snapshot.revision)
  }
}
