import type { BridgeRelations } from '@askx/core/bridge-relations'
import type { BridgeProject, BridgeProjectService } from './project-service.js'
import type { BridgeThreadSessionManager } from './thread-session.js'
import type { BridgeThreadSummary } from './thread-service.js'

/** Web 会话目录中的项目及其历史状态。 */
export interface BridgeSessionCatalogProject {
  /** Codex 项目。 */
  project: BridgeProject
  /** 是否为该群当前可写项目。 */
  active: boolean
  /** 项目是否仍在当前 Codex 项目目录中可用。 */
  available: boolean
  /** 该群绑定到项目的历史会话。 */
  sessions: BridgeThreadSummary[]
}

/** Web 会话目录中的群组。 */
export interface BridgeSessionCatalogGroup {
  /** 飞书群标识。 */
  chatId: string
  /** 群展示名称。 */
  name: string
  /** 当前项目，没有绑定时为 null。 */
  activeProject: BridgeProject | null
  /** 当前及历史项目，按关系顺序返回。 */
  projects: BridgeSessionCatalogProject[]
}

/** Web 会话目录响应。 */
export interface BridgeSessionCatalog {
  /** 关系存储并发版本。 */
  revision: number
  /** 群组目录。 */
  groups: BridgeSessionCatalogGroup[]
}

/** 以群组为根聚合项目和会话，不在 Web 层重复推导关系语义。 */
export class BridgeSessionCatalogService {
  constructor(private readonly projects: BridgeProjectService, private readonly sessions: BridgeThreadSessionManager) {}

  /**
   * 读取指定关系快照对应的会话目录。
   * @param relations 已经由 Core 归一化的关系快照。
   * @returns 群组、当前项目、历史项目和历史会话。
   */
  async build(relations: BridgeRelations): Promise<BridgeSessionCatalog> {
    const projectMap = new Map((await this.projects.listProjects()).map(project => [project.path, project]))
    const summaries = new Map<string, BridgeThreadSummary[]>()
    const paths = [...new Set(relations.projectGroups.map(link => link.projectPath))]
    await Promise.all(paths.filter(path => projectMap.has(path)).map(async path => {
      try {
        const result = await this.sessions.listThreads(undefined, 100, path)
        summaries.set(path, result.threads)
      }
      catch {
        // 失效项目只保留关系和会话占位，避免历史目录因一次读取失败而消失。
        summaries.set(path, [])
      }
    }))

    // 对分页外的已关联会话单独读取，避免目录只显示不可读标识。
    await Promise.all(relations.threadGroups.map(async link => {
      const listed = summaries.get(link.projectPath) ?? []
      if (listed.some(thread => thread.id === link.threadId)) return
      try {
        const history = await this.sessions.readThread(link.threadId, undefined, 1, link.projectPath)
        listed.push(history.thread)
        summaries.set(link.projectPath, listed)
      } catch { /* 失效会话继续使用关系占位。 */ }
    }))

    return {
      revision: relations.revision,
      groups: relations.groups.map(group => {
        const links = relations.projectGroups.filter(link => link.chatId === group.chatId)
        const activeLink = links.find(link => link.active)
        return {
          chatId: group.chatId,
          name: group.name,
          activeProject: activeLink ? projectMap.get(activeLink.projectPath) ?? null : null,
          projects: links.map(link => {
            const project = projectMap.get(link.projectPath) ?? {
              path: link.projectPath,
              name: link.projectPath.split('/').pop() || link.projectPath,
              projectId: '',
            }
            const linkedThreads = relations.threadGroups.filter(thread => thread.chatId === group.chatId && thread.projectPath === link.projectPath)
            const listed = new Map((summaries.get(link.projectPath) || []).map(thread => [thread.id, thread]))
            const sessions = linkedThreads.map(thread => listed.get(thread.threadId) ?? {
              id: thread.threadId,
              title: 'AskX Relay',
              cwd: link.projectPath,
              projectId: project.projectId || null,
              gitInfo: null,
              updatedAt: null,
              createdAt: null,
            })
            return { project, active: link.active, available: projectMap.has(link.projectPath), sessions }
          }),
        }
      }),
    }
  }
}
