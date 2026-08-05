import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stableHash, type UserConsent } from '@askx/core'
import { z } from 'zod'
import { ASKX_SKILL_MANAGER_NAME } from './skill-manager-metadata.js'
import type { SkillManagementOverview } from './skill-management-manager.js'

const LOCK_MAX_AGE_MS = 30_000
const LOCK_RETRY_MS = 40
const LOCK_RETRIES = 75

/** Registry 同步目标状态。 */
export const skillRegistryTargetStatusSchema = z.enum(['linked', 'copied', 'stale', 'conflict', 'failed'])

/** Registry 同步目标。 */
export const skillRegistryTargetSchema = z.object({
  kind: z.enum(['canonical', 'platform', 'folder']),
  path: z.string().min(1),
  status: skillRegistryTargetStatusSchema,
  version: z.string().optional(),
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  synced_at: z.string().datetime().optional(),
})

/** Registry 中的一个 Skill。 */
export const askxSkillRegistryEntrySchema = z.object({
  current_name: z.string().min(1),
  aliases: z.array(z.string()),
  version: z.string(),
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  usage_count: z.number().int().nonnegative(),
  last_used_at: z.string().datetime().optional(),
  targets: z.record(skillRegistryTargetSchema),
})

/** AskX Skill Manager registry schema。 */
export const askxSkillRegistrySchema = z.object({
  schema: z.literal(2),
  revision: z.number().int().nonnegative(),
  updated_at: z.string().datetime(),
  skills: z.record(askxSkillRegistryEntrySchema),
})

/** AskX Skill Manager registry。 */
export type AskxSkillRegistry = z.infer<typeof askxSkillRegistrySchema>

/** Registry 中的一个 Skill。 */
export type AskxSkillRegistryEntry = z.infer<typeof askxSkillRegistryEntrySchema>

/** usage 记录计划。 */
export interface SkillUsagePlan {
  /** 计划标识。 */
  id: string
  /** 计划创建时间。 */
  createdAt: string
  /** 要记录的稳定 Skill ID。 */
  skillId: string
  /** 页面展示名称。 */
  skillName: string
  /** 当前 registry revision。 */
  registryRevision: number
  /** 用户授权对应的稳定 hash。 */
  hash: string
}

/** usage 写入回执。 */
export interface SkillUsageReceipt {
  /** 回执标识。 */
  id: string
  /** 对应计划 hash。 */
  planHash: string
  /** 完成时间。 */
  appliedAt: string
  /** Skill ID。 */
  skillId: string
  /** 更新后的累计次数。 */
  usageCount: number
  /** 更新后的 registry revision。 */
  registryRevision: number
}

/** 完整统计中的一个排行项。 */
export interface SkillStatsItem {
  /** Skill ID。 */
  skillId: string
  /** 当前名称。 */
  name: string
  /** 当前版本。 */
  version: string
  /** 累计显式记录次数。 */
  usageCount: number
  /** 最近一次显式记录时间。 */
  lastUsedAt?: string
  /** 已登记目标数量。 */
  targetCount: number
  /** 非健康目标数量。 */
  issueCount: number
  /** 已登记平台和文件夹目标明细。 */
  targets: Array<{
    /** Registry 中的目标键。 */
    key: string
    /** 目标类型。 */
    kind: 'canonical' | 'platform' | 'folder'
    /** 目标绝对路径。 */
    path: string
    /** 最近一次验证状态。 */
    status: 'linked' | 'copied' | 'stale' | 'conflict' | 'failed'
    /** 已验证目标版本。 */
    version?: string
    /** 最近同步时间。 */
    syncedAt?: string
  }>
}

/** Web 与 CLI 共用的 Skill 统计报告。 */
export interface SkillStatsReport {
  /** Registry revision。 */
  revision: number
  /** 更新时间。 */
  updatedAt: string
  /** 当前可用且已登记统计的 Skill 数量。 */
  totalSkills: number
  /** 累计显式记录次数。 */
  totalUsage: number
  /** 已登记同步目标数量。 */
  totalTargets: number
  /** 冲突、过期或失败目标数量。 */
  issueTargets: number
  /** 按 usage 降序排列的明细。 */
  items: SkillStatsItem[]
  /** 各版本拥有的 Skill 数量。 */
  versions: Record<string, number>
  /** 各目标状态数量。 */
  targetStatuses: Record<string, number>
  /** Manifest、实际目录与 Registry 三方校验后的管理覆盖状态。 */
  management: SkillManagementOverview
}

/** 旧版 bobo registry 的最小兼容 schema。 */
const legacyRegistrySchema = z.object({
  schema: z.literal(1),
  updated_at: z.string(),
  skills: z.record(z.object({
    current_name: z.string(),
    aliases: z.array(z.string()).default([]),
    usage_count: z.number().int().nonnegative().default(0),
    last_used_at: z.string().optional(),
    platforms: z.record(z.string()).default({}),
  })),
})

/** usage 计划 schema。 */
export const skillUsagePlanSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  skillId: z.string().min(1),
  skillName: z.string().min(1),
  registryRevision: z.number().int().nonnegative(),
  hash: z.string().min(1),
})

/** Registry revision 冲突。 */
export class SkillRegistryConflictError extends Error {
  /**
   * 创建 registry 并发冲突错误。
   * @param current 当前 registry。
   */
  constructor(readonly current: AskxSkillRegistry | null) {
    super(`Skill registry changed at revision ${current?.revision ?? 0}`)
    this.name = 'SkillRegistryConflictError'
  }
}

/** AskX 默认 Skill 内 registry 的原子存储。 */
export class SkillManagerRegistryStore {
  /** Registry 文件路径。 */
  readonly path: string
  /** Registry 写锁路径。 */
  readonly #lockPath: string

  /**
   * 创建 registry 存储。
   * @param dataDir AskX 数据目录。
   */
  constructor(readonly dataDir: string) {
    const registryDir = join(dataDir, 'skills', ASKX_SKILL_MANAGER_NAME, 'registry')
    this.path = join(registryDir, 'skills.json')
    this.#lockPath = join(registryDir, 'skills.lock')
  }

  /** 读取 registry；系统 Skill 不存在时返回 null。 */
  async read(): Promise<AskxSkillRegistry | null> {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      const current = askxSkillRegistrySchema.safeParse(value)
      if (current.success) return current.data
      const legacy = legacyRegistrySchema.parse(value)
      const skills: Record<string, AskxSkillRegistryEntry> = {}
      for (const [skillId, entry] of Object.entries(legacy.skills)) {
        const targets = Object.fromEntries(Object.entries(entry.platforms).map(([platform, path]) => [
          `platform:${platform}`,
          { kind: 'platform' as const, path, status: 'copied' as const },
        ]))
        skills[skillId] = {
          current_name: entry.current_name,
          aliases: entry.aliases,
          version: '',
          content_sha256: '0'.repeat(64),
          usage_count: entry.usage_count,
          ...(entry.last_used_at ? { last_used_at: new Date(entry.last_used_at).toISOString() } : {}),
          targets,
        }
      }
      return askxSkillRegistrySchema.parse({ schema: 2, revision: 0, updated_at: new Date(legacy.updated_at).toISOString(), skills })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  /** 创建空 registry，不覆盖既有数据。 */
  async createEmpty(): Promise<AskxSkillRegistry> {
    const now = new Date().toISOString()
    return this.write({ schema: 2, revision: 0, updated_at: now, skills: {} }, 0)
  }

  /** 以 revision 校验和原子替换方式写入 registry。 */
  async write(next: AskxSkillRegistry, expectedRevision: number): Promise<AskxSkillRegistry> {
    await mkdir(join(this.dataDir, 'skills', ASKX_SKILL_MANAGER_NAME, 'registry'), { recursive: true, mode: 0o700 })
    const release = await this.#acquireLock()
    try {
      const current = await this.read()
      if ((current?.revision ?? 0) !== expectedRevision) throw new SkillRegistryConflictError(current)
      const parsed = askxSkillRegistrySchema.parse({ ...next, revision: expectedRevision + 1, updated_at: new Date().toISOString() })
      const temporaryPath = `${this.path}.${randomUUID()}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.path)
      return parsed
    } finally {
      await release()
    }
  }

  /** 生成一次显式 usage 记录计划。 */
  async planUsage(nameOrId: string): Promise<SkillUsagePlan> {
    const registry = await this.read()
    if (!registry) throw new Error('AskX Skill Manager 尚未安装或 registry 不可用。')
    const found = Object.entries(registry.skills).find(([skillId, entry]) => skillId === nameOrId || entry.current_name === nameOrId)
    if (!found) throw new Error(`找不到已纳入版本管理的 Skill：${nameOrId}`)
    const unsigned = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      skillId: found[0],
      skillName: found[1].current_name,
      registryRevision: registry.revision,
    }
    return skillUsagePlanSchema.parse({ ...unsigned, hash: stableHash(unsigned) })
  }

  /** 应用一次经过确认的 usage 记录计划。 */
  async applyUsage(inputPlan: SkillUsagePlan, consent: UserConsent): Promise<SkillUsageReceipt> {
    const plan = skillUsagePlanSchema.parse(inputPlan)
    const { hash, ...unsigned } = plan
    if (stableHash(unsigned) !== hash || consent.planHash !== hash) throw new Error('Skill usage 授权与当前计划不匹配。')
    const registry = await this.read()
    if (!registry || registry.revision !== plan.registryRevision) throw new SkillRegistryConflictError(registry)
    const entry = registry.skills[plan.skillId]
    if (!entry || entry.current_name !== plan.skillName) throw new Error('Skill registry 已经变化，请重新记录。')
    const appliedAt = new Date().toISOString()
    const saved = await this.write({
      ...registry,
      skills: {
        ...registry.skills,
        [plan.skillId]: { ...entry, usage_count: entry.usage_count + 1, last_used_at: appliedAt },
      },
    }, registry.revision)
    return { id: randomUUID(), planHash: plan.hash, appliedAt, skillId: plan.skillId, usageCount: saved.skills[plan.skillId]!.usage_count, registryRevision: saved.revision }
  }

  /**
   * 生成 Web 与 CLI 共用的统计报告。
   * @param management 当前 Skill 的版本管理覆盖状态。
   * @param availableSkillIds 当前仍存在于 manifest 的 Skill 身份；未传入时统计完整 Registry。
   * @returns 仅包含当前可用 Skill 的统计报告。
   */
  async stats(
    management: SkillManagementOverview = { managed: [], unmanaged: [] },
    availableSkillIds?: ReadonlySet<string>,
  ): Promise<SkillStatsReport> {
    const registry = await this.read()
    if (!registry) throw new Error('AskX Skill Manager 尚未安装或 registry 不可用。')
    const versions: Record<string, number> = {}
    const targetStatuses: Record<string, number> = {}
    const items = Object.entries(registry.skills)
      .filter(([skillId]) => !availableSkillIds || availableSkillIds.has(skillId))
      .map(([skillId, entry]) => {
      versions[entry.version || 'unknown'] = (versions[entry.version || 'unknown'] ?? 0) + 1
      const targets = Object.values(entry.targets)
      for (const target of targets) targetStatuses[target.status] = (targetStatuses[target.status] ?? 0) + 1
      return {
        skillId,
        name: entry.current_name,
        version: entry.version,
        usageCount: entry.usage_count,
        ...(entry.last_used_at ? { lastUsedAt: entry.last_used_at } : {}),
        targetCount: targets.length,
        issueCount: targets.filter((target) => ['stale', 'conflict', 'failed'].includes(target.status)).length,
        targets: Object.entries(entry.targets).map(([key, target]) => ({
          key,
          kind: target.kind,
          path: target.path,
          status: target.status,
          ...(target.version ? { version: target.version } : {}),
          ...(target.synced_at ? { syncedAt: target.synced_at } : {}),
        })),
      }
      }).sort((left, right) => right.usageCount - left.usageCount || left.name.localeCompare(right.name))
    return {
      revision: registry.revision,
      updatedAt: registry.updated_at,
      totalSkills: items.length,
      totalUsage: items.reduce((total, item) => total + item.usageCount, 0),
      totalTargets: items.reduce((total, item) => total + item.targetCount, 0),
      issueTargets: items.reduce((total, item) => total + item.issueCount, 0),
      items,
      versions,
      targetStatuses,
      management,
    }
  }

  /** 获取 registry 独占写锁。 */
  async #acquireLock(): Promise<() => Promise<void>> {
    for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
      try {
        const handle = await open(this.#lockPath, 'wx', 0o600)
        await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`)
        await handle.close()
        return async () => {
          try {
            await unlink(this.#lockPath)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        try {
          const lock = await stat(this.#lockPath)
          if (Date.now() - lock.mtimeMs > LOCK_MAX_AGE_MS) {
            await unlink(this.#lockPath)
            continue
          }
        } catch (lockError) {
          if ((lockError as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw lockError
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS))
      }
    }
    throw new Error('等待 Skill registry 写入锁超时。')
  }
}
