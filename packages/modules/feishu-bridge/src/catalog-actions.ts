import { bridgeThreadSourceKinds, isBridgeThreadSource } from '../runtime/codex_identity.mjs'
import { assertConsent, createActionPlan, stableHash, type ActionPlan, type DetectionReport, type UserConsent } from '@askx/core'
import type { BridgeRelations } from '@askx/core/bridge-relations'
import { BridgeProjectService, normalizeProjectPath } from './project-service.js'
import { BridgeThreadService, type BridgeRpcClient } from './thread-service.js'

/** 目录菜单支持的安全动作。 */
export interface BridgeCatalogActionInput {
  /** 动作类型；删除会话仅归档。 */
  action: 'rename-project' | 'remove-project' | 'rename-thread' | 'archive-thread'
  /** 项目真实目录。 */
  projectPath: string
  /** 会话动作的目标标识。 */
  threadId?: string | undefined
  /** 重命名后的名称。 */
  name?: string | undefined
}
/** Codex 项目写入前快照。 */
interface ProjectSnapshot {
  /** 项目标识。 */
  id: string
  /** 项目原名。 */
  name: string
  /** 完整根目录集合。 */
  roots: { path: string }[]
}
/** 会话写入前的可恢复字段。 */
interface ThreadSnapshot {
  /** 会话标识。 */
  id: string
  /** 原始名称；空名称不能伪装成显示标题。 */
  name: string | null
  /** 原始工作目录。 */
  cwd: string
}
/** 计划包含的检测快照。 */
export interface BridgeCatalogSnapshot {
  /** 已归一化的动作输入。 */
  input: BridgeCatalogActionInput
  /** 完整项目根目录快照。 */
  project: ProjectSnapshot
  /** 会话动作的元数据快照。 */
  thread: ThreadSnapshot | null
  /** 关联版本，防止确认后关系变化。 */
  relationsRevision: number
}
/** 菜单动作所需的唯一业务依赖。 */
export interface BridgeCatalogActionOptions {
  /** Codex 协议入口。 */
  rpc: BridgeRpcClient
  /** 项目身份 owner。 */
  projects: BridgeProjectService
  /** 服务必须运行、健康并处于工作窗口。 */
  canOperate: () => Promise<boolean>
  /** 关系快照只由 Core owner 提供。 */
  readRelations: () => Promise<BridgeRelations>
  /** 与 Web 和飞书执行共享的会话锁。 */
  acquireThreadLease: (threadId: string) => Promise<() => Promise<void>>
  /** 与关联保存共享互斥窗口，避免提交后出现悬空关联。 */
  guardCatalogChange: (callback: (relations: BridgeRelations) => Promise<void>) => Promise<void>
}

/** 目录菜单的检测、计划、授权、提交、验证与回滚 owner。 */
export class BridgeCatalogActions {
  /** 注入共享协议、关系与运行边界。 */
  constructor(private readonly options: BridgeCatalogActionOptions) {}

  /** 读取目标身份和关系，不修改用户数据。 */
  async detect(input: BridgeCatalogActionInput): Promise<DetectionReport<BridgeCatalogSnapshot>> {
    return this.capture(input, await this.options.readRelations())
  }

  /** 在指定关联快照下读取目标，持锁执行时不重新解析状态目录。 */
  private async capture(input: BridgeCatalogActionInput, relations: BridgeRelations): Promise<DetectionReport<BridgeCatalogSnapshot>> {
    await this.requireRunning()
    if (!['rename-project', 'remove-project', 'rename-thread', 'archive-thread'].includes(input.action)) throw new Error('Unsupported catalog action / 不支持的目录操作')
    /** 项目身份通过既有 owner 校验。 */
    const identity = await this.options.projects.requireProject(input.projectPath)
    /** 归一化后的动作输入。 */
    const normalized = { ...input, projectPath: identity.path, name: input.name?.trim() }
    if (input.action.startsWith('rename-') && !normalized.name) throw new Error('Name is required / 名称不能为空')
    if (input.action.endsWith('-thread') && !input.threadId) throw new Error('Thread ID is required / 缺少会话标识')
    /** 完整项目 root 快照，避免误删其他目录。 */
    const response = await this.options.rpc.request('project/read', { projectId: identity.projectId }) as { project: ProjectSnapshot }
    if (response.project.id !== identity.projectId) throw new Error('Project identity changed / 项目标识已变化')
    this.assertUnlinked(normalized, relations)
    /** 只保留此次动作可能恢复的项目字段。 */
    const project = { id: response.project.id, name: response.project.name, roots: response.project.roots }
    /** 会话动作需要保留原始名称而非派生标题。 */
    let thread: ThreadSnapshot | null = null
    if (input.action.endsWith('-thread')) {
      await new BridgeThreadService(this.options.rpc, identity.path).verifyThread(input.threadId!)
      /** 独立读取原始名称以便失败时恢复。 */
      const metadata = await this.options.rpc.request('thread/read', { threadId: input.threadId }) as { thread: ThreadSnapshot }
      if (metadata.thread.id !== input.threadId) throw new Error('Thread identity changed / 会话标识已变化')
      if (!isBridgeThreadSource(metadata.thread)) throw new Error('Only bridge App Server threads can be changed / 只能修改桥接 App Server 会话')
      thread = { id: metadata.thread.id, name: metadata.thread.name ?? null, cwd: metadata.thread.cwd }
    }
    /** 用于确认和执行时比较的检测内容。 */
    const data = { input: normalized, project, thread, relationsRevision: relations.revision }
    if (input.action === 'archive-thread' && await this.isArchived(data)) throw new Error('Thread is already archived / 会话已归档')
    return { moduleId: 'feishu-bridge', status: 'ok', observedAt: new Date().toISOString(), fingerprint: stableHash(data), issues: [], data }
  }

  /** 绑定目标快照与检测指纹。 */
  async plan(input: BridgeCatalogActionInput): Promise<ActionPlan<BridgeCatalogSnapshot>> {
    /** 最新只读检测结果。 */
    const detection = await this.detect(input)
    return createActionPlan({ moduleId: 'feishu-bridge', action: input.action, detectionFingerprint: detection.fingerprint, input: detection.data })
  }

  /** 核验确认及快照后提交，失败时按原字段回滚。 */
  async apply(plan: ActionPlan<BridgeCatalogSnapshot>, consent: UserConsent): Promise<void> {
    assertConsent(plan, consent)
    if (plan.moduleId !== 'feishu-bridge' || plan.action !== plan.input.input.action) throw new Error('Invalid catalog plan / 无效的目录操作计划')
    /** 会话写操作与执行任务共享互斥窗口。 */
    const release = plan.input.thread ? await this.options.acquireThreadLease(plan.input.thread.id) : async () => {}
    try {
      await this.options.guardCatalogChange(async relations => {
        /** 排队后重新验证目标、服务状态和关联版本。 */
        const current = await this.capture(plan.input.input, relations)
        if (current.fingerprint !== plan.detectionFingerprint) throw new Error('Catalog changed; refresh and confirm again / 目录或关联已变化，请刷新后重新确认')
        await this.requireRunning()
        try {
          await this.write(plan.input)
          await this.verify(plan.input)
        } catch (error) {
          try { await this.rollback(plan.input) } catch (rollbackError) {
            throw new Error(`Catalog action failed and recovery is incomplete / 目录操作失败且恢复未完成: ${String(rollbackError instanceof Error ? rollbackError.message : rollbackError)}`, { cause: error })
          }
          throw error
        }
      })
    } finally { await release() }
  }

  /** 所有用户写操作共享运行状态边界。 */
  private async requireRunning(): Promise<void> {
    if (!(await this.options.canOperate())) throw new Error('Bridge must be running, healthy and inside work time / 桥接服务必须运行、健康且处于工作时间内')
  }

  /** 删除关联目标必须由用户先明确解绑。 */
  private assertUnlinked(input: BridgeCatalogActionInput, relations: BridgeRelations): void {
    if (input.action === 'remove-project' && (relations.projectGroups.some(link => link.projectPath === input.projectPath) || relations.threadGroups.some(link => link.projectPath === input.projectPath))) throw new Error('Unlink this project from all groups first / 请先解除此项目的全部群关联')
    if (input.action === 'archive-thread' && relations.threadGroups.some(link => link.threadId === input.threadId)) throw new Error('Unlink this thread from all groups first / 请先解除此会话的全部群关联')
  }

  /** 仅剔除选中真实 root，保留其他 root 的原始记录。 */
  private async remainingRoots(snapshot: BridgeCatalogSnapshot): Promise<{ path: string }[]> {
    /** 此次删除后仍应保留的目录。 */
    const roots: { path: string }[] = []
    for (const root of snapshot.project.roots) {
      try { if (await normalizeProjectPath(root.path) === snapshot.input.projectPath) continue } catch { /* 其他失效 root 仍应保留登记。 */ }
      roots.push(root)
    }
    return roots
  }

  /** 执行协议层的最小字段写入，不接触文件或 Git。 */
  private async write(snapshot: BridgeCatalogSnapshot): Promise<void> {
    /** 已绑定到计划的输入。 */
    const input = snapshot.input
    if (input.action === 'rename-project') await this.options.rpc.request('project/update', { projectId: snapshot.project.id, name: input.name })
    else if (input.action === 'remove-project') {
      /** 多 root 仅取消当前 root；最后一个 root 才取消项目登记。 */
      const roots = await this.remainingRoots(snapshot)
      if (roots.length) await this.options.rpc.request('project/update', { projectId: snapshot.project.id, roots })
      else await this.options.rpc.request('project/delete', { projectId: snapshot.project.id })
    } else if (input.action === 'rename-thread') await this.options.rpc.request('thread/name/set', { threadId: input.threadId, name: input.name })
    else if (input.action === 'archive-thread') await this.options.rpc.request('thread/archive', { threadId: input.threadId })
    else throw new Error('Unsupported catalog action / 不支持的目录操作')
  }

  /** 按归档状态查询已核验来源的目标 ID。 */
  private async isArchived(snapshot: BridgeCatalogSnapshot): Promise<boolean> {
    /** 避免服务端游标循环。 */
    const visited = new Set<string>()
    /** 当前归档列表位置。 */
    let cursor: string | undefined
    do {
      /** 按共享候选来源查询，仅用于核验已确认身份的目标 ID。 */
      const page = await this.options.rpc.request('thread/list', { cwd: snapshot.input.projectPath, archived: true, useStateDbOnly: true, modelProviders: [], sourceKinds: bridgeThreadSourceKinds, cursor, limit: 100 }) as { data: { id: string }[]; nextCursor: string | null }
      if (page.data.some(thread => thread.id === snapshot.input.threadId)) return true
      cursor = page.nextCursor || undefined
      if (cursor && visited.has(cursor)) throw new Error('Repeated archive verification cursor / 归档验证游标重复')
      if (cursor) visited.add(cursor)
    } while (cursor)
    return false
  }

  /** 重读验证，不把成功响应视为已完成验证。 */
  private async verify(snapshot: BridgeCatalogSnapshot): Promise<void> {
    if (snapshot.input.action === 'remove-project') {
      /** 项目 owner 的真实目录列表是登记状态依据。 */
      const projects = await this.options.projects.listProjects()
      if (projects.some(project => project.path === snapshot.input.projectPath)) throw new Error('Project removal verification failed / 项目取消登记验证失败')
      /** 多 root 项目必须完整保留未选中的所有目录。 */
      const roots = await this.remainingRoots(snapshot)
      if (roots.length) {
        /** 直接比较协议根目录，包含尚未能读取的其他 root。 */
        const remaining = await this.options.rpc.request('project/read', { projectId: snapshot.project.id }) as { project: ProjectSnapshot }
        if (stableHash(remaining.project.roots) !== stableHash(roots)) throw new Error('Other project roots changed / 项目的其他目录发生变化')
      }
    } else if (snapshot.input.action === 'rename-project') {
      /** 项目名称必须与计划一致。 */
      const result = await this.options.rpc.request('project/read', { projectId: snapshot.project.id }) as { project: ProjectSnapshot }
      if (result.project.name !== snapshot.input.name) throw new Error('Project rename verification failed / 项目重命名验证失败')
    } else if (snapshot.input.action === 'rename-thread') {
      /** 会话名称采用原始协议字段验证。 */
      const result = await this.options.rpc.request('thread/read', { threadId: snapshot.input.threadId }) as { thread: ThreadSnapshot }
      if (result.thread.name !== snapshot.input.name) throw new Error('Thread rename verification failed / 会话重命名验证失败')
    } else if (!(await this.isArchived(snapshot))) throw new Error('Thread archive verification failed / 会话归档验证失败')
  }

  /** 恢复最小变更字段；不可恢复时明确失败而不伪报成功。 */
  private async rollback(snapshot: BridgeCatalogSnapshot): Promise<void> {
    /** 原始动作及确认目标。 */
    const input = snapshot.input
    if (input.action === 'rename-project' || input.action === 'remove-project') {
      if (input.action === 'remove-project' && !(await this.remainingRoots(snapshot)).length) {
        /** 请求失败不能证明删除已发生，先核验原登记是否仍完整。 */
        let existing: { project: ProjectSnapshot }
        try { existing = await this.options.rpc.request('project/read', { projectId: snapshot.project.id }) as { project: ProjectSnapshot } } catch (error) {
          throw new Error('Project removal could not be verified and its original ID cannot be restored / 项目取消登记未能核验，且无法恢复原 ID', { cause: error })
        }
        if (existing.project.id === snapshot.project.id && existing.project.name === snapshot.project.name && stableHash(existing.project.roots) === stableHash(snapshot.project.roots)) return
        throw new Error('Project changed during recovery; automatic restoration is unsafe / 恢复时项目已发生其他变化，无法安全自动恢复')
      }
      /** 回滚前确认没有外部覆盖，避免恢复时覆盖他人修改。 */
      const current = await this.options.rpc.request('project/read', { projectId: snapshot.project.id }) as { project: ProjectSnapshot }
      if (input.action === 'rename-project') {
        if (current.project.name === snapshot.project.name) return
        if (current.project.name !== input.name) throw new Error('Project changed during recovery / 恢复时项目已被其他操作修改')
        await this.options.rpc.request('project/update', { projectId: snapshot.project.id, name: snapshot.project.name })
      } else {
        if (stableHash(current.project.roots) === stableHash(snapshot.project.roots)) return
        /** 本次取消登记应留下的 root 集合。 */
        const expectedRoots = await this.remainingRoots(snapshot)
        if (!expectedRoots.length) throw new Error('Deleted project IDs cannot be restored / 已取消登记的项目无法恢复原 ID')
        if (stableHash(current.project.roots) !== stableHash(expectedRoots)) throw new Error('Project roots changed during recovery / 恢复时项目目录已被其他操作修改')
        await this.options.rpc.request('project/update', { projectId: snapshot.project.id, roots: snapshot.project.roots })
      }
      /** 回滚后再次验证原字段。 */
      const restored = await this.options.rpc.request('project/read', { projectId: snapshot.project.id }) as { project: ProjectSnapshot }
      if (input.action === 'rename-project' ? restored.project.name !== snapshot.project.name : stableHash(restored.project.roots) !== stableHash(snapshot.project.roots)) throw new Error('Project recovery verification failed / 项目恢复验证失败')
    } else if (input.action === 'rename-thread') {
      /** 原始名称只允许在本次写入仍可确认时恢复。 */
      const current = await this.options.rpc.request('thread/read', { threadId: input.threadId }) as { thread: ThreadSnapshot }
      if ((current.thread.name ?? null) === snapshot.thread?.name) return
      if (current.thread.name !== input.name) throw new Error('Thread changed during recovery / 恢复时会话已被其他操作修改')
      if (snapshot.thread?.name === null) throw new Error('The unnamed thread state cannot be restored by this protocol / 当前协议无法恢复会话的未命名状态')
      await this.options.rpc.request('thread/name/set', { threadId: input.threadId, name: snapshot.thread?.name })
      /** 回滚后的名称需要独立读取验证。 */
      const restored = await this.options.rpc.request('thread/read', { threadId: input.threadId }) as { thread: ThreadSnapshot }
      if (restored.thread.name !== snapshot.thread?.name) throw new Error('Thread recovery verification failed / 会话恢复验证失败')
    } else {
      try { await this.options.rpc.request('thread/unarchive', { threadId: input.threadId }) } catch (error) {
        if (await this.isArchived(snapshot)) throw error
      }
      if (await this.isArchived(snapshot)) throw new Error('Thread archive recovery verification failed / 会话归档恢复验证失败')
    }
  }
}
