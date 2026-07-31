import { z } from 'zod'

/** 当前由 Skills 管理模块支持的平台。 */
export const skillPlatformIdSchema = z.enum(['codex', 'claude', 'cursor'])

/** 当前由 Skills 管理模块支持的平台。 */
export type SkillPlatformId = z.infer<typeof skillPlatformIdSchema>

/** 用户额外选择的本地扫描目录。 */
export interface SkillCustomScanRoot {
  /** 基于绝对路径生成的稳定标识。 */
  id: string
  /** 用于界面展示的目录名称。 */
  name: string
  /** 本机绝对路径。 */
  path: string
}

/** 扫描到的 Skill 位置类型。 */
export const skillLocationKindSchema = z.enum(['directory', 'symlink'])

/** Skill 元数据。 */
export interface SkillMetadata {
  /** SKILL.md 中声明的名称。 */
  name?: string
  /** SKILL.md 中声明的描述。 */
  description?: string
  /** 元数据是否可供接管。 */
  valid: boolean
  /** 无法接管时的原因。 */
  error?: string
}

/** 文件系统中发现的一个 Skill 副本。 */
export interface SkillLocation {
  /** 当前扫描中的稳定位置标识。 */
  id: string
  /** 副本所在来源，askx 表示内部统一源，custom 表示用户选择的额外目录。 */
  platform: SkillPlatformId | 'askx' | 'custom'
  /** 额外扫描目录标识，仅 custom 来源存在。 */
  customRootId?: string
  /** 目录名称。 */
  name: string
  /** 副本绝对路径。 */
  path: string
  /** 目录或软链。 */
  kind: z.infer<typeof skillLocationKindSchema>
  /** 软链原始目标。 */
  target?: string
  /** 业务内容指纹。 */
  contentHash?: string
  /** SKILL.md 元数据。 */
  metadata: SkillMetadata
  /** 软链是否失效。 */
  broken: boolean
}

/** 同名 Skill 的聚合状态。 */
export type SkillGroupStatus = 'unique' | 'identical' | 'conflict' | 'invalid' | 'broken'

/** 用户首次扫描时可选择的默认动作。 */
export type SkillRecommendedAction = 'adopt' | 'merge' | 'keep'

/** 按名称聚合后的逻辑 Skill。 */
export interface SkillGroup {
  /** 当前扫描中的稳定分组标识。 */
  id: string
  /** Skill 目录名称。 */
  name: string
  /** 所有平台或额外目录中的来源副本。 */
  locations: SkillLocation[]
  /** 去重后的内容指纹。 */
  hashes: string[]
  /** 分组状态。 */
  status: SkillGroupStatus
  /** 页面初始选择的推荐动作。 */
  recommendedAction: SkillRecommendedAction
}

/** 平台预检测结果。 */
export interface SkillPlatformStatus {
  /** 平台标识。 */
  id: SkillPlatformId
  /** 平台展示名称。 */
  name: string
  /** Skill 根目录。 */
  skillsDir: string
  /** Agent 是否安装。 */
  installed: boolean
  /** Skill 根目录是否存在。 */
  skillsDirExists: boolean
  /** 探测到的版本。 */
  version?: string
  /** 当前版本是否允许创建软链。 */
  linkSupported: boolean
  /** 可解释的检测说明。 */
  notes: string[]
}

/** 完整的首次扫描报告。 */
export interface SkillsScanReport {
  /** 扫描时间。 */
  scannedAt: string
  /** 本次扫描的平台。 */
  platforms: SkillPlatformId[]
  /** 平台检测状态。 */
  platformStatuses: SkillPlatformStatus[]
  /** 用户额外选择并成功读取的扫描目录。 */
  customRoots: SkillCustomScanRoot[]
  /** 扫描到的位置。 */
  locations: SkillLocation[]
  /** 聚合后的 Skill。 */
  groups: SkillGroup[]
  /** 检测结果指纹。 */
  fingerprint: string
}

/** 一个受 AskX 管理的平台绑定。 */
export interface ManagedSkillBinding {
  /** Agent 平台。 */
  platform: SkillPlatformId
  /** AskX 创建的软链路径。 */
  path: string
  /** 软链预期指向的统一源。 */
  target: string
}

/** 一个受 AskX 管理的逻辑 Skill。 */
export interface ManagedSkillRecord {
  /** 不随目录重命名变化的标识。 */
  id: string
  /** Skill 目录名称。 */
  name: string
  /** 统一源绝对路径。 */
  canonicalPath: string
  /** 当前统一源内容指纹。 */
  contentHash: string
  /** AskX 实际创建的平台绑定。 */
  bindings: ManagedSkillBinding[]
  /** 最近更新时间。 */
  updatedAt: string
}

/** 一个受管 Skill 的只读健康状态。 */
export interface ManagedSkillHealth {
  /** 对应受管 Skill 标识。 */
  skillId: string
  /** 统一源内容是否发生漂移。 */
  drifted: boolean
  /** 当前失效或被替换的平台绑定数量。 */
  brokenBindings: number
  /** 可向用户解释的异常信息。 */
  issues: string[]
}

/** 最近一次完成的扫描信息。 */
export interface SkillsLastScan {
  /** 扫描完成时间。 */
  scannedAt: string
  /** 检测结果指纹。 */
  fingerprint: string
  /** 本次扫描的平台。 */
  platforms: SkillPlatformId[]
}

/** Skills 持久化管理清单。 */
export interface SkillsManifest {
  /** 数据格式版本。 */
  version: 1
  /** 并发写入版本。 */
  revision: number
  /** 首次初始化完成时间。 */
  initializedAt: string
  /** 最近一次完成的扫描。 */
  lastScan: SkillsLastScan
  /** AskX 已接管的 Skill。 */
  skills: ManagedSkillRecord[]
}

/** 用户对扫描分组作出的处理决策。 */
export type SkillDecision =
  | { kind: 'adopt'; sourceLocationId: string; platforms: SkillPlatformId[] }
  | { kind: 'merge'; sourceLocationId: string; platforms: SkillPlatformId[] }
  | { kind: 'replace'; sourceLocationId: string; targetLocationIds: string[] }
  | { kind: 'rename-and-adopt'; sourceLocationId: string; newName: string; platforms: SkillPlatformId[] }
  | { kind: 'keep'; groupId: string }
  | { kind: 'archive'; locationIds: string[] }

/** 保留现状操作。 */
export interface SkillKeepOperation {
  /** 操作类型。 */
  kind: 'keep'
}

/** 将未受管内容移入备份区。 */
export interface SkillArchiveOperation {
  /** 操作类型。 */
  kind: 'archive'
  /** 要移动的原始路径。 */
  path: string
}

/** 复制统一源操作。 */
export interface SkillCopyCanonicalOperation {
  /** 操作类型。 */
  kind: 'copy-canonical'
  /** 只读复制来源。 */
  sourcePath: string
  /** AskX 统一源目标。 */
  targetPath: string
}

/** 建立平台受管链接操作。 */
export interface SkillBindPlatformOperation {
  /** 操作类型。 */
  kind: 'bind-platform'
  /** 目标平台。 */
  platform: SkillPlatformId
}

/** 选择覆盖统一版本的来源。 */
export interface SkillSelectSourceOperation {
  /** 操作类型。 */
  kind: 'select-source'
  /** 选中的来源路径。 */
  sourcePath: string
}

/** 备份并覆盖一个平台副本。 */
export interface SkillReplaceOperation {
  /** 操作类型。 */
  kind: 'replace'
  /** 要备份并覆盖的路径。 */
  path: string
}

/** 以新名称写入统一源。 */
export interface SkillWriteRenamedOperation {
  /** 操作类型。 */
  kind: 'write-renamed'
  /** 新的 kebab-case 名称。 */
  name: string
}

/** 可在 CLI 与 Web 中分别本地化展示的计划操作。 */
export type SkillPlanOperation =
  | SkillKeepOperation
  | SkillArchiveOperation
  | SkillCopyCanonicalOperation
  | SkillBindPlatformOperation
  | SkillSelectSourceOperation
  | SkillReplaceOperation
  | SkillWriteRenamedOperation

/** 单个 Skill 计划单元。 */
export interface SkillPlanUnit {
  /** 单元标识。 */
  id: string
  /** 展示名称。 */
  skillName: string
  /** 用户决策。 */
  decision: SkillDecision
  /** 预计执行的可解释操作。 */
  operations: SkillPlanOperation[]
  /** 计划阶段警告。 */
  warnings: string[]
}

/** 首次接管的批量计划。 */
export interface SkillsBatchPlan {
  /** 计划标识。 */
  id: string
  /** 计划生成时间。 */
  createdAt: string
  /** 扫描结果指纹。 */
  detectionFingerprint: string
  /** 共享设置版本。 */
  settingsRevision: number
  /** manifest 版本，未初始化时为零。 */
  manifestRevision: number
  /** 本次管理平台。 */
  platforms: SkillPlatformId[]
  /** 计划绑定的额外只读扫描目录。 */
  customRoots: string[]
  /** 每个 Skill 的事务单元。 */
  units: SkillPlanUnit[]
  /** 整个批次的稳定授权指纹。 */
  hash: string
}

/** 一个已移动到备份区的路径。 */
export interface SkillBackupMove {
  /** 原始位置。 */
  originalPath: string
  /** 备份位置。 */
  backupPath: string
}

/** 单个 Skill 事务的执行结果。 */
export interface SkillTransactionResult {
  /** 事务回执标识。 */
  receiptId: string
  /** Skill 展示名称。 */
  skillName: string
  /** 执行状态。 */
  status: 'applied' | 'failed' | 'rolled-back' | 'skipped'
  /** 新建的统一源。 */
  canonicalPath?: string
  /** 新建的平台链接。 */
  createdLinks: string[]
  /** 原路径与备份路径。 */
  backups: SkillBackupMove[]
  /** 错误或提示。 */
  warnings: string[]
}

/** 一次批量操作的回执。 */
export interface SkillsBatchReceipt {
  /** 批次回执标识。 */
  id: string
  /** 对应计划指纹。 */
  planHash: string
  /** 应用完成时间。 */
  appliedAt: string
  /** manifest 最新版本。 */
  manifestRevision: number
  /** 各 Skill 独立结果。 */
  results: SkillTransactionResult[]
}

/** Skills 页面启动信息。 */
export interface SkillsBootstrap {
  /** 是否已经完成首次初始化。 */
  initialized: boolean
  /** 当前 manifest 版本。 */
  manifestRevision: number
  /** AskX 统一 Skill 源目录。 */
  canonicalSkillsDir: string
  /** 平台预检测结果。 */
  platforms: SkillPlatformStatus[]
  /** 已接管的 Skill。 */
  managedSkills: ManagedSkillRecord[]
  /** 已接管 Skill 的实时只读健康状态。 */
  managedHealth: ManagedSkillHealth[]
}

/** Zod 使用的事务结果 schema。 */
export const skillTransactionResultSchema = z.object({
  receiptId: z.string().uuid(),
  skillName: z.string().min(1),
  status: z.enum(['applied', 'failed', 'rolled-back', 'skipped']),
  canonicalPath: z.string().min(1).optional(),
  createdLinks: z.array(z.string()),
  backups: z.array(z.object({ originalPath: z.string(), backupPath: z.string() })),
  warnings: z.array(z.string()),
})

/** Zod 使用的受管绑定 schema。 */
export const managedSkillBindingSchema = z.object({
  platform: skillPlatformIdSchema,
  path: z.string().min(1),
  target: z.string().min(1),
})

/** Zod 使用的受管 Skill schema。 */
export const managedSkillRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  canonicalPath: z.string().min(1),
  contentHash: z.string().min(1),
  bindings: z.array(managedSkillBindingSchema),
  updatedAt: z.string().datetime(),
})

/** Zod 使用的 manifest schema。 */
export const skillsManifestSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  initializedAt: z.string().datetime(),
  lastScan: z.object({
    scannedAt: z.string().datetime(),
    fingerprint: z.string().min(1),
    platforms: z.array(skillPlatformIdSchema).min(1),
  }),
  skills: z.array(managedSkillRecordSchema),
})

/** Zod 使用的用户决策 schema。 */
export const skillDecisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('adopt'), sourceLocationId: z.string().min(1), platforms: z.array(skillPlatformIdSchema).min(1) }),
  z.object({ kind: z.literal('merge'), sourceLocationId: z.string().min(1), platforms: z.array(skillPlatformIdSchema).min(1) }),
  z.object({ kind: z.literal('replace'), sourceLocationId: z.string().min(1), targetLocationIds: z.array(z.string().min(1)).min(1) }),
  z.object({ kind: z.literal('rename-and-adopt'), sourceLocationId: z.string().min(1), newName: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), platforms: z.array(skillPlatformIdSchema).min(1) }),
  z.object({ kind: z.literal('keep'), groupId: z.string().min(1) }),
  z.object({ kind: z.literal('archive'), locationIds: z.array(z.string().min(1)).min(1) }),
])

/** Zod 使用的计划操作 schema。 */
export const skillPlanOperationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('keep') }),
  z.object({ kind: z.literal('archive'), path: z.string().min(1) }),
  z.object({ kind: z.literal('copy-canonical'), sourcePath: z.string().min(1), targetPath: z.string().min(1) }),
  z.object({ kind: z.literal('bind-platform'), platform: skillPlatformIdSchema }),
  z.object({ kind: z.literal('select-source'), sourcePath: z.string().min(1) }),
  z.object({ kind: z.literal('replace'), path: z.string().min(1) }),
  z.object({ kind: z.literal('write-renamed'), name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) }),
])

/** Zod 使用的批量计划 schema。 */
export const skillsBatchPlanSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  detectionFingerprint: z.string().min(1),
  settingsRevision: z.number().int().nonnegative(),
  manifestRevision: z.number().int().nonnegative(),
  platforms: z.array(skillPlatformIdSchema).min(1),
  customRoots: z.array(z.string().min(1)).max(20),
  units: z.array(z.object({
    id: z.string().uuid(),
    skillName: z.string().min(1),
    decision: skillDecisionSchema,
    operations: z.array(skillPlanOperationSchema),
    warnings: z.array(z.string()),
  })),
  hash: z.string().min(1),
})
