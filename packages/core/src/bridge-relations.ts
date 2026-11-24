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
  /** 群资料或项目关联最近变更时间；旧记录可能尚未记录。 */
  updatedAt: z.string().datetime().nullable().optional(),
})

/** 边界只接受规范化绝对路径；真实路径核验由项目服务负责。 */
const projectPathSchema = z.string().refine(value => isAbsolute(value) && normalize(value) === value, 'Project path must be an absolute normalized path')

/** 群与项目关系的输入结构，兼容 v1 中缺失 active 的旧数据。 */
const projectGroupInputSchema = z.object({
  /** 群标识。 */
  chatId: bridgeGroupSchema.shape.chatId,
  /** 项目真实路径。 */
  projectPath: projectPathSchema,
  /** 当前项目标记；旧数据迁移时由关系 owner 补齐。 */
  active: z.boolean().optional(),
})

/** 规范化后的群与项目授权关系。 */
export const projectGroupSchema = projectGroupInputSchema.extend({
  /** 当前群唯一可写入的项目。 */
  active: z.boolean(),
})

/** 群与会话的显式共享关系。 */
export const threadGroupSchema = projectGroupSchema.omit({ active: true }).extend({
  /** Codex 会话标识。 */
  threadId: z.string().min(1).max(128),
})

/** v1 迁移时需要用户明确选择当前项目的冲突记录。 */
export const bridgeMigrationConflictSchema = z.object({
  /** 发生冲突的群标识。 */
  chatId: bridgeGroupSchema.shape.chatId,
  /** 等待用户选择的项目路径。 */
  projectPaths: z.array(projectPathSchema).min(2).max(100),
})

/** 关系输入的原始结构；提交前统一归一化 active 和迁移冲突。 */
const bridgeRelationsRawSchema = z.object({
  /** 已发现群组，包括尚未关联项目的群。 */
  groups: z.array(bridgeGroupSchema).max(2000),
  /** 项目与群的历史关系。 */
  projectGroups: z.array(projectGroupInputSchema).max(10000),
  /** 会话与群的历史关系。 */
  threadGroups: z.array(threadGroupSchema).max(10000),
  /** v1 多项目关系迁移冲突。 */
  migrationConflicts: z.array(bridgeMigrationConflictSchema).max(2000).optional(),
}).strict()

/** 规范化后的关系结构，供所有业务模块消费。 */
const bridgeRelationsNormalizedSchema = z.object({
  groups: z.array(bridgeGroupSchema).max(2000),
  projectGroups: z.array(projectGroupSchema).max(10000),
  threadGroups: z.array(threadGroupSchema).max(10000),
  migrationConflicts: z.array(bridgeMigrationConflictSchema).max(2000),
}).strict().superRefine((value, context) => {
  const groups = new Set(value.groups.map(group => group.chatId))
  if (groups.size !== value.groups.length) context.addIssue({ code: 'custom', message: 'Duplicate group' })
  const projects = new Set<string>()
  const activeProjects = new Map<string, number>()
  for (const link of value.projectGroups) {
    const key = JSON.stringify([link.chatId, link.projectPath])
    if (!groups.has(link.chatId) || projects.has(key)) context.addIssue({ code: 'custom', message: 'Unknown or duplicate project-group link' })
    projects.add(key)
    if (link.active) activeProjects.set(link.chatId, (activeProjects.get(link.chatId) || 0) + 1)
  }
  for (const [chatId, count] of activeProjects) {
    if (count > 1) context.addIssue({ code: 'custom', message: `A group can have only one active project: ${chatId}` })
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
  const conflictKeys = new Set<string>()
  for (const conflict of value.migrationConflicts) {
    if (!groups.has(conflict.chatId) || conflictKeys.has(conflict.chatId)) context.addIssue({ code: 'custom', message: 'Invalid migration conflict' })
    conflictKeys.add(conflict.chatId)
  }
})

/** 可提交的关系数据；active 对旧调用方保持可选，进入 owner 后会被归一化。 */
export type BridgeRelationsInput = z.input<typeof bridgeRelationsRawSchema>
/** 归一化后的关系数据。 */
export type BridgeRelationsData = z.output<typeof bridgeRelationsNormalizedSchema>

/** 将旧关系转换为唯一当前项目模型，不自动猜测多项目冲突。 */
function normalizeRelations(input: BridgeRelationsInput): BridgeRelationsData {
  const parsed = bridgeRelationsRawSchema.parse(input)
  const projectGroups = parsed.projectGroups.map(link => ({ ...link, active: link.active ?? false }))
  const migrationConflicts = [...(parsed.migrationConflicts || [])]
  /** 显式激活状态表示用户已作选择，不能再套用旧版推断。 */
  const explicitGroups = new Set(parsed.projectGroups.filter(link => link.active !== undefined).map(link => link.chatId))
  const grouped = new Map<string, typeof projectGroups>()
  for (const link of projectGroups) grouped.set(link.chatId, [...(grouped.get(link.chatId) || []), link])
  for (const [chatId, links] of grouped) {
    if (explicitGroups.has(chatId)) continue
    if (links.length === 1) links[0]!.active = true
    if (links.length > 1 && !migrationConflicts.some(conflict => conflict.chatId === chatId)) {
      migrationConflicts.push({ chatId, projectPaths: links.map(link => link.projectPath) })
    }
  }
  return bridgeRelationsNormalizedSchema.parse({
    groups: parsed.groups,
    projectGroups,
    threadGroups: parsed.threadGroups,
    migrationConflicts,
  })
}

/** 对外提供的关系解析器；所有入口共享同一份归一化结果。 */
export const bridgeRelationsInputSchema = bridgeRelationsRawSchema.transform(value => normalizeRelations(value))

/** 按群汇总项目关联语义，忽略列表顺序和会话活动。 */
function groupProjectSignatures(data: BridgeRelationsData): Map<string, string> {
  /** 每个群的项目路径与激活状态。 */
  const links = new Map<string, string[]>()
  for (const link of data.projectGroups) {
    /** 群内无序关联集合。 */
    const values = links.get(link.chatId) ?? []
    values.push(JSON.stringify([link.projectPath, link.active]))
    links.set(link.chatId, values)
  }
  return new Map([...links].map(([chatId, values]) => [chatId, JSON.stringify(values.sort())]))
}

/** 带并发版本的关系快照。 */
export interface BridgeRelations extends BridgeRelationsData {
  /** 存储格式版本。 */
  version: 2
  /** 每次提交递增的版本。 */
  revision: number
}

/** 版本冲突时保留最新快照供调用方重载。 */
export class BridgeRelationsConflictError extends Error {
  /** 创建关系版本冲突。 */
  constructor(readonly current: BridgeRelations) { super('Bridge relations changed; reload before saving') }
}

/** 关系存储的唯一写入入口，提供跨进程锁、迁移和原子提交。 */
export class BridgeRelationsStore {
  /** 内部固定存储路径。 */
  readonly path: string
  /** 根据模块数据目录定位关系文件。 */
  constructor(private readonly directory: string) { this.path = join(directory, 'relations.json') }

  /** 读取快照；旧文件在内存中迁移，下一次提交写入 v2。 */
  async read(): Promise<BridgeRelations> {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Record<string, unknown>
      if (!Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0) throw new Error('Invalid bridge relations revision')
      if (raw.version !== 1 && raw.version !== 2) throw new Error('Invalid bridge relations version')
      const data = normalizeRelations({ groups: raw.groups, projectGroups: raw.projectGroups, threadGroups: raw.threadGroups, migrationConflicts: raw.migrationConflicts } as BridgeRelationsInput)
      return { version: 2, revision: Number(raw.revision), ...data }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 2, revision: 0, groups: [], projectGroups: [], threadGroups: [], migrationConflicts: [] }
      throw error
    }
  }

  /** 持锁核对版本后一次性替换关系，验证失败不改变已有数据。 */
  async replace(input: BridgeRelationsInput, expectedRevision: number): Promise<BridgeRelations> {
    const data = normalizeRelations(input)
    return this.withLock(async () => {
      /** 持锁读取的最新版本。 */
      const current = await this.read()
      if (current.revision !== expectedRevision) throw new BridgeRelationsConflictError(current)
      /** 时间由持锁提交入口写入，调用方不能覆盖或伪造。 */
      const updatedAt = new Date().toISOString()
      /** 上次确认的群资料和关联语义。 */
      const previousGroups = new Map(current.groups.map(group => [group.chatId, group]))
      const previousLinks = groupProjectSignatures(current)
      /** 本次归一化后的关联语义。 */
      const nextLinks = groupProjectSignatures(data)
      /** 仅资料或项目授权实际变化的群更新时间。 */
      const groups = data.groups.map(group => {
        /** 对应群的已保存记录。 */
        const previous = previousGroups.get(group.chatId)
        /** 新发现、重命名或关联变化均属于管理资料更新。 */
        const changed = !previous || previous.name !== group.name || previousLinks.get(group.chatId) !== nextLinks.get(group.chatId)
        return { ...group, updatedAt: changed ? updatedAt : previous.updatedAt ?? null }
      })
      /** 本次关系事务的唯一提交快照。 */
      const next: BridgeRelations = { version: 2, revision: current.revision + 1, ...data, groups }
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
