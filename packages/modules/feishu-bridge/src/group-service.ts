import { Client, AppType, Domain } from '@larksuiteoapi/node-sdk'
import { BridgeRelationsStore, bridgeRelationsInputSchema, type BridgeRelations, type BridgeRelationsInput } from '@askx/core/bridge-relations'
import { resolveFeishuCredentials, feishuCredentialsSchema } from '@askx/core/bridge-credentials'
import type { BridgeFeishuConfig } from '@askx/core/config'
import { BridgeProjectService, normalizeProjectPath } from './project-service.js'
import type { BridgeRpcClient } from './thread-service.js'

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
/** 跨项目 API 与飞书 API 的关系编排，持久化只委托 Core。 */
export class BridgeGroupService {
  /** 注入同一项目 owner 和协议客户端，避免自行推断目录归属。 */
  constructor(private readonly store: BridgeRelationsStore, private readonly projects: BridgeProjectService, private readonly client: BridgeRpcClient) {}

  /** 返回包含空关联群的关系快照。 */
  read(): Promise<BridgeRelations> { return this.store.read() }

  /** 核验所有项目与会话真实归属后原子提交；快照过期由 Core 拒绝。 */
  async save(input: BridgeRelationsInput, revision: number): Promise<BridgeRelations> {
    const parsed = bridgeRelationsInputSchema.parse(input)
    const paths = new Set(parsed.projectGroups.map(link => link.projectPath))
    for (const path of paths) {
      const project = await this.projects.requireProject(path)
      if (project.path !== path) throw new Error('Use the canonical project path')
    }
    const checkedThreads = new Set<string>()
    for (const link of parsed.threadGroups) {
      if (checkedThreads.has(link.threadId)) continue
      const result = await this.client.request('thread/read', { threadId: link.threadId, includeTurns: false }) as { thread?: { id?: string, cwd?: string } }
      if (result.thread?.id !== link.threadId || !result.thread.cwd || await normalizeProjectPath(result.thread.cwd) !== link.projectPath) throw new Error('Thread does not belong to the selected project')
      checkedThreads.add(link.threadId)
    }
    return this.store.replace(parsed, revision)
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
    return this.store.replace({ groups: [...groups.values()], projectGroups: snapshot.projectGroups, threadGroups: snapshot.threadGroups }, snapshot.revision)
  }
}
