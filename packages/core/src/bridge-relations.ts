import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, normalize } from 'node:path'
import { z } from 'zod'

/** 已发现的飞书群；发现不代表已经授权执行项目任务。 */
export const bridgeGroupSchema = z.object({
  /** 飞书群标识。 */
  chatId: z.string().regex(/^oc_[A-Za-z0-9]+$/),
  /** 飞书返回的群名称。 */
  name: z.string().min(1).max(256),
})
/** 边界只接受规范化绝对路径；真实路径核验由项目服务负责。 */
const projectPathSchema = z.string().refine(value => isAbsolute(value) && normalize(value) === value, 'Project path must be an absolute normalized path')
/** 群与项目的授权关系。 */
export const projectGroupSchema = z.object({
  /** 群标识。 */
  chatId: bridgeGroupSchema.shape.chatId,
  /** 项目真实路径。 */
  projectPath: projectPathSchema,
})
/** 群与会话的显式共享关系。 */
export const threadGroupSchema = projectGroupSchema.extend({
  /** Codex 会话标识。 */
  threadId: z.string().min(1).max(128),
})
/** 双向查询共用一份关系集合，不持久化反向副本。 */
export const bridgeRelationsInputSchema = z.object({
  /** 已发现群组，包括尚未关联项目的群。 */
  groups: z.array(bridgeGroupSchema).max(2000),
  /** 项目与群的多对多关系。 */
  projectGroups: z.array(projectGroupSchema).max(10000),
  /** 会话与群的多对多关系。 */
  threadGroups: z.array(threadGroupSchema).max(10000),
}).strict().superRefine((value, context) => {
  const groups = new Set(value.groups.map(group => group.chatId))
  if (groups.size !== value.groups.length) context.addIssue({ code: 'custom', message: 'Duplicate group' })
  const projects = new Set<string>()
  for (const link of value.projectGroups) {
    const key = JSON.stringify([link.chatId, link.projectPath])
    if (!groups.has(link.chatId) || projects.has(key)) context.addIssue({ code: 'custom', message: 'Unknown or duplicate project-group link' })
    projects.add(key)
  }
  const threads = new Set<string>()
  const threadPaths = new Map<string, string>()
  for (const link of value.threadGroups) {
    const key = JSON.stringify([link.chatId, link.threadId])
    if (!projects.has(JSON.stringify([link.chatId, link.projectPath])) || threads.has(key)) context.addIssue({ code: 'custom', message: 'Thread link requires its project-group link and must be unique' })
    const previous = threadPaths.get(link.threadId)
    if (previous && previous !== link.projectPath) context.addIssue({ code: 'custom', message: 'A shared thread must keep the same project path' })
    threads.add(key)
    threadPaths.set(link.threadId, link.projectPath)
  }
})
/** 可提交的关系数据。 */
export type BridgeRelationsInput = z.infer<typeof bridgeRelationsInputSchema>
/** 带并发版本的关系快照。 */
export interface BridgeRelations extends BridgeRelationsInput {
  /** 存储格式版本。 */
  version: 1
  /** 每次提交递增的版本。 */
  revision: number
}
/** 版本冲突时保留最新快照供调用方重载。 */
export class BridgeRelationsConflictError extends Error {
  /** 创建关系版本冲突。 */
  constructor(readonly current: BridgeRelations) { super('Bridge relations changed; reload before saving') }
}
/** 关系存储的唯一写入入口，提供跨进程锁和原子提交。 */
export class BridgeRelationsStore {
  /** 内部固定存储路径。 */
  readonly path: string
  /** 根据模块数据目录定位关系文件。 */
  constructor(private readonly directory: string) { this.path = join(directory, 'relations.json') }

  /** 读取快照；读取操作不会创建或迁移用户文件。 */
  async read(): Promise<BridgeRelations> {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Record<string, unknown>
      if (raw.version !== 1 || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0) throw new Error('Invalid bridge relations version')
      const data = bridgeRelationsInputSchema.parse({ groups: raw.groups, projectGroups: raw.projectGroups, threadGroups: raw.threadGroups })
      return { version: 1, revision: Number(raw.revision), ...data }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, revision: 0, groups: [], projectGroups: [], threadGroups: [] }
      throw error
    }
  }

  /** 持锁核对版本后一次性替换关系，验证失败不改变已有数据。 */
  async replace(input: BridgeRelationsInput, expectedRevision: number): Promise<BridgeRelations> {
    /** 提交前校验的标准关系结构。 */
    const data = bridgeRelationsInputSchema.parse(input)
    return this.withLock(async () => {
      /** 持锁读取的最新版本。 */
      const current = await this.read()
      if (current.revision !== expectedRevision) throw new BridgeRelationsConflictError(current)
      /** 本次关系事务的唯一提交快照。 */
      const next: BridgeRelations = { version: 1, revision: current.revision + 1, ...data }
      await this.writeSnapshot(next)
      return next
    })
  }

  /**
   * 将关联目标的变更与关系保存串行化；结束后使所有旧目标校验失效。
   * @param operation 持锁执行的目标变更，不得在回调内再次调用 replace。
   */
  async guardCatalogChange<T>(operation: (snapshot: BridgeRelations) => Promise<T>): Promise<T> {
    return this.withLock(async () => {
      /** 目标操作开始前的关系数据，操作本身不能修改这些关联。 */
      const snapshot = await this.read()
      try { return await operation(snapshot) }
      finally {
        // 外部目标可能在报错前已改变，失败也必须让等待中的旧校验重新执行。
        await this.writeSnapshot({ ...snapshot, revision: snapshot.revision + 1 })
      }
    })
  }

  /** 所有关系提交与目标变更共用的文件锁。 */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    /** 跨进程共用的锁文件。 */
    const lockPath = `${this.path}.lock`
    /** 当前调用是否取得锁。 */
    let locked = false
    /** 有界等待避免永久阻塞调用方。 */
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        /** 排他创建锁文件的句柄。 */
        const handle = await open(lockPath, 'wx', 0o600)
        await handle.close()
        locked = true
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        await new Promise(resolve => setTimeout(resolve, 30))
      }
    }
    if (!locked) throw new Error('Bridge relations are busy; retry later')
    try { return await operation() }
    finally { await unlink(lockPath) }
  }

  /** 持锁期间原子提交快照并回收本次临时文件。 */
  private async writeSnapshot(snapshot: BridgeRelations): Promise<void> {
    /** 每次写入独立的临时文件。 */
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 })
      await rename(temporary, this.path)
    } finally {
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
    }
  }
}
