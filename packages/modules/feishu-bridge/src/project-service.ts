import { realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import type { BridgeRpcClient } from './thread-service.js'

/** 以真实目录为身份的 Codex 项目。 */
export interface BridgeProject {
  /** 规范化的真实目录。 */
  path: string
  /** Codex 项目名称。 */
  name: string
  /** Codex opaque 项目标识。 */
  projectId: string
  /** 可选 Git 分支。 */
  branch?: string | null
  /** Codex 项目资料最近更新时间，协议缺失或非法时为空。 */
  updatedAt?: string | null
}

/** 校验并归一化现有项目目录，不创建目录或修改 Git。 */
export async function normalizeProjectPath(path: string): Promise<string> {
  if (!path || !isAbsolute(path)) throw new Error('Project path must be absolute / 项目路径必须为绝对路径')
  const resolved = await realpath(path)
  if (!(await stat(resolved)).isDirectory()) throw new Error('Project path must be a directory / 项目路径必须是目录')
  return resolved
}

/** Codex 项目目录身份与协议的唯一 owner。 */
export class BridgeProjectService {
  constructor(private readonly client: BridgeRpcClient) {}

  /** 读取全部项目，将多 root 展开并按真实路径去重。 */
  async listProjects(): Promise<BridgeProject[]> {
    const projects = new Map<string, BridgeProject>()
    let cursor: string | null = null
    do {
      const response = await this.client.request('project/list', { cursor, limit: 100 }) as { data?: unknown[]; nextCursor?: string | null }
      for (const value of response.data ?? []) {
        const project = value as { id: string; name: string; roots?: { path: string }[]; updatedAt?: number }
        /** App Server 的项目时间使用 Unix 秒，在协议边界转换一次。 */
        const updatedAt = typeof project.updatedAt === 'number' && Number.isFinite(project.updatedAt) ? new Date(project.updatedAt * 1000) : null
        for (const root of project.roots ?? []) {
          try {
            const path = await normalizeProjectPath(root.path)
            if (!projects.has(path)) projects.set(path, { path, name: project.name, projectId: project.id, updatedAt: updatedAt && Number.isFinite(updatedAt.getTime()) ? updatedAt.toISOString() : null })
          }
          catch { /* 已失效的本地目录不能作为会话工作区。 */ }
        }
      }
      cursor = response.nextCursor ?? null
    } while (cursor)
    return [...projects.values()]
  }

  /** 核验目录已经属于 Codex 项目。 */
  async requireProject(path: string): Promise<BridgeProject> {
    const normalized = await normalizeProjectPath(path)
    const project = (await this.listProjects()).find(item => item.path === normalized)
    if (!project) throw new Error('Unknown Codex project / 未找到 Codex 项目')
    const response = await this.client.request('project/read', { projectId: project.projectId }) as { project?: { roots?: { path: string }[] } }
    for (const root of response.project?.roots ?? []) {
      try { if (await normalizeProjectPath(root.path) === normalized) return project } catch { /* 忽略已失效的 root。 */ }
    }
    throw new Error('Codex project changed; reload projects / Codex 项目已变化，请刷新项目')
  }

  /** 将现有目录登记为 Codex 项目。 */
  async createProject(path: string, name?: string): Promise<BridgeProject> {
    const normalized = await normalizeProjectPath(path)
    const existing = (await this.listProjects()).find(item => item.path === normalized)
    if (existing) return existing
    await this.client.request('project/create', { name: name?.trim() || basename(normalized), roots: [{ path: normalized }], idempotencyKey: createHash('sha256').update(normalized).digest('hex') })
    return this.requireProject(normalized)
  }
}
