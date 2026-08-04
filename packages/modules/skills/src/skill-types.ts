import { z } from 'zod'

/** AskX 允许保存的自定义 Skill 文件夹数量上限。 */
export const MAX_CUSTOM_SKILL_DIRECTORIES = 3

/** 当前由 Skills 管理模块支持的平台。 */
export const skillPlatformIdSchema = z.enum(['codex', 'claude', 'cursor'])

/** 当前由 Skills 管理模块支持的平台。 */
export type SkillPlatformId = z.infer<typeof skillPlatformIdSchema>

/** Skills 批量计划的执行模式。 */
export const skillsBatchModeSchema = z.enum(['connect', 'sync'])

/** Skills 批量计划的执行模式。 */
export type SkillsBatchMode = z.infer<typeof skillsBatchModeSchema>

/** 用户额外选择的本地扫描目录。 */
export interface SkillCustomScanRoot {
  /** 基于绝对路径生成的稳定标识。 */
  id: string
  /** 用于界面展示的目录名称。 */
  name: string
  /** 本机绝对路径。 */
  path: string
}

/** 用户额外选择的本地扫描目录 schema。 */
export const skillCustomScanRootSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
})

/** 用户额外选择的软链使用目录。 */
export interface SkillCustomLinkRoot {
  /** 基于绝对路径生成的稳定标识。 */
  id: string
  /** 用于界面展示的目录名称。 */
  name: string
  /** 最终会被替换为统一源软链的绝对路径。 */
  path: string
}

/** 用户额外选择的软链使用目录 schema。 */
export const skillCustomLinkRootSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
})

/** 扫描到的 Skill 位置类型。 */
export const skillLocationKindSchema = z.enum(['directory', 'symlink'])

/** Skill 元数据。 */
export interface SkillMetadata {
  /** SKILL.md 中声明的名称。 */
  name?: string
  /** SKILL.md 中声明的描述。 */
  description?: string
  /** SKILL.md 中声明的版本号。 */
  version?: string
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
  /** 当前文件系统路径是否允许切换为根目录软链。 */
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

/** 一个受 AskX 管理的平台 Skills 根目录绑定。 */
export interface ManagedPlatformBinding {
  /** Agent 平台。 */
  platform: SkillPlatformId
  /** AskX 创建的根目录软链路径。 */
  path: string
  /** 根目录软链预期指向的统一源。 */
  target: string
  /** 首次接入前的平台 Skills 根目录及其备份位置。 */
  originalRootBackup?: SkillBackupMove | undefined
  /** 最近更新时间。 */
  updatedAt: string
  /** 软链被无损停用的时间；未停用时不存在。 */
  suspendedAt?: string | undefined
  /** 停用期间保留受管软链的隐藏路径。 */
  suspendedPath?: string | undefined
}

/** 一个受 AskX 管理的自定义目录软链绑定。 */
export interface ManagedCustomLinkBinding {
  /** 基于软链路径生成的稳定标识。 */
  id: string
  /** 用于界面展示的目录名称。 */
  name: string
  /** AskX 创建的目录软链路径。 */
  path: string
  /** 目录软链预期指向的统一源。 */
  target: string
  /** 首次接入前的目录及其备份位置。 */
  originalRootBackup?: SkillBackupMove | undefined
  /** 最近更新时间。 */
  updatedAt: string
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
  /** 最近更新时间。 */
  updatedAt: string
}

/** 受管 Skill 目录树中的节点。 */
export interface ManagedSkillTreeNode {
  /** 当前节点名称。 */
  name: string
  /** 相对于 Skill 根目录的 POSIX 路径。 */
  path: string
  /** 节点类型；软链接只展示但不会跟随读取。 */
  kind: 'directory' | 'file' | 'symlink'
  /** 普通文件的字节数。 */
  size?: number
  /** 普通文本文件是否允许在线编辑。 */
  editable: boolean
  /** 目录下按名称排序的子节点。 */
  children?: ManagedSkillTreeNode[]
}

/** 一个受管 Skill 的资源详情。 */
export interface ManagedSkillDetail {
  /** 受管 Skill 标识。 */
  id: string
  /** Skill 名称。 */
  name: string
  /** Skill 介绍。 */
  description?: string
  /** Skill 自身声明的版本号。 */
  version?: string
  /** 统一源绝对目录。 */
  canonicalPath: string
  /** 当前统一源内容指纹。 */
  contentHash: string
  /** 最近更新时间。 */
  updatedAt: string
  /** 目录中的普通文件数量。 */
  fileCount: number
  /** 不跟随软链接的目录结构。 */
  tree: ManagedSkillTreeNode[]
}

/** 从受管 Skill 中读取的文本文件。 */
export interface ManagedSkillFile {
  /** 所属受管 Skill 标识。 */
  skillId: string
  /** 相对于 Skill 根目录的 POSIX 路径。 */
  path: string
  /** UTF-8 文本内容。 */
  content: string
  /** 当前文件内容指纹。 */
  contentHash: string
  /** 文件字节数。 */
  size: number
  /** 根据扩展名推导的编辑语言。 */
  language: string
}

/** 更新受管 Skill 文件时需要确认的计划。 */
export interface SkillFileUpdatePlan {
  /** 计划标识。 */
  id: string
  /** 计划创建时间。 */
  createdAt: string
  /** 目标受管 Skill 标识。 */
  skillId: string
  /** 目标 Skill 名称。 */
  skillName: string
  /** 相对于 Skill 根目录的 POSIX 文件路径。 */
  path: string
  /** 计划基于的 manifest revision。 */
  manifestRevision: number
  /** 计划基于的完整 Skill 指纹。 */
  skillContentHash: string
  /** 计划基于的文件内容指纹。 */
  previousContentHash: string
  /** 用户确认后要写入的 UTF-8 文本。 */
  nextContent: string
  /** 下一份文件内容指纹。 */
  nextContentHash: string
  /** 用户授权所对应的稳定指纹。 */
  hash: string
}

/** 一次受管 Skill 文件更新的回执。 */
export interface SkillFileUpdateReceipt {
  /** 回执标识。 */
  id: string
  /** 对应计划指纹。 */
  planHash: string
  /** 更新完成时间。 */
  appliedAt: string
  /** 目标受管 Skill 标识。 */
  skillId: string
  /** 已更新的相对文件路径。 */
  path: string
  /** 更新后的文件内容指纹。 */
  contentHash: string
  /** 更新后的完整 Skill 指纹。 */
  skillContentHash: string
  /** 更新后的 manifest revision。 */
  manifestRevision: number
}

/** 一个受管 Skill 的只读健康状态。 */
export interface ManagedSkillHealth {
  /** 对应受管 Skill 标识。 */
  skillId: string
  /** 统一源内容是否发生漂移。 */
  drifted: boolean
  /** 可向用户解释的异常信息。 */
  issues: string[]
}

/** 平台 Skills 根目录绑定的只读健康状态。 */
export interface ManagedPlatformHealth {
  /** Agent 平台。 */
  platform: SkillPlatformId
  /** 平台当前的接入状态。 */
  status: 'connected' | 'suspended' | 'failed' | 'broken' | 'pending'
  /** 根目录软链当前是否有效。 */
  connected: boolean
  /** 可向用户解释的异常信息。 */
  issues: string[]
  /** 最近一次接入尝试时间。 */
  lastAttemptAt?: string | undefined
}

/** 平台根目录软链支持的状态操作。 */
export const platformLinkActionSchema = z.enum(['suspend', 'resume'])

/** 平台根目录软链支持的状态操作。 */
export type PlatformLinkAction = z.infer<typeof platformLinkActionSchema>

/** 平台软链计划中的原子移动操作。 */
export interface PlatformLinkMoveOperation {
  /** 操作类型。 */
  kind: 'move-path'
  /** 本次移动的是受管软链还是接入前的平台目录。 */
  role: 'managed-link' | 'original-root'
  /** 当前路径。 */
  source: string
  /** 原子移动后的路径。 */
  target: string
}

/** 一个平台软链停用或恢复计划。 */
export interface PlatformLinkPlan {
  /** 计划标识。 */
  id: string
  /** 计划生成时间。 */
  createdAt: string
  /** 目标平台。 */
  platform: SkillPlatformId
  /** 停用或恢复操作。 */
  action: PlatformLinkAction
  /** 平台正常使用的 Skills 根路径。 */
  path: string
  /** 平台软链预期指向的统一源。 */
  target: string
  /** 停用期间保存软链的隐藏路径。 */
  suspendedPath: string
  /** 接入前的平台 Skills 根目录及其备份位置。 */
  originalRootBackup?: SkillBackupMove | undefined
  /** 计划基于的 manifest 版本。 */
  manifestRevision: number
  /** 计划基于的文件系统状态指纹。 */
  detectionFingerprint: string
  /** 实际需要执行的原子操作；幂等请求时为空。 */
  operations: PlatformLinkMoveOperation[]
  /** 计划授权指纹。 */
  hash: string
}

/** 一个平台软链状态操作的回执。 */
export interface PlatformLinkReceipt {
  /** 回执标识。 */
  id: string
  /** 对应计划指纹。 */
  planHash: string
  /** 目标平台。 */
  platform: SkillPlatformId
  /** 已确认的状态操作。 */
  action: PlatformLinkAction
  /** 应用或幂等跳过状态。 */
  status: 'applied' | 'skipped'
  /** 操作完成时间。 */
  appliedAt: string
  /** 操作完成后的 manifest 版本。 */
  manifestRevision: number
  /** 平台正常使用的 Skills 根路径。 */
  path: string
  /** 平台软链预期指向的统一源。 */
  target: string
  /** 停用期间保存软链的隐藏路径。 */
  suspendedPath: string
  /** 接入前的平台 Skills 根目录及其备份位置。 */
  originalRootBackup?: SkillBackupMove | undefined
}

/** 移除一个自定义扫描来源的确认计划。 */
export interface SkillCustomRootRemovalPlan {
  /** 计划标识。 */
  id: string
  /** 计划生成时间。 */
  createdAt: string
  /** 要从默认扫描来源中移除的目录。 */
  root: SkillCustomScanRoot
  /** 计划基于的 manifest 版本。 */
  manifestRevision: number
  /** 用户授权所对应的稳定指纹。 */
  hash: string
}

/** 移除一个自定义扫描来源后的回执。 */
export interface SkillCustomRootRemovalReceipt {
  /** 回执标识。 */
  id: string
  /** 对应计划指纹。 */
  planHash: string
  /** 操作完成时间。 */
  appliedAt: string
  /** 被移除的扫描来源。 */
  root: SkillCustomScanRoot
  /** 操作完成后的 manifest 版本。 */
  manifestRevision: number
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
  version: 2
  /** 并发写入版本。 */
  revision: number
  /** 首次初始化完成时间。 */
  initializedAt: string
  /** 最近一次完成的扫描。 */
  lastScan: SkillsLastScan
  /** AskX 已接管的 Skill。 */
  skills: ManagedSkillRecord[]
  /** 后续添加 Skill 时默认复用的自定义扫描来源。 */
  customRoots?: SkillCustomScanRoot[] | undefined
  /** AskX 创建的平台 Skills 根目录绑定。 */
  platformBindings: ManagedPlatformBinding[]
  /** AskX 创建的自定义目录软链绑定。 */
  customLinkBindings?: ManagedCustomLinkBinding[] | undefined
  /** 是否来自旧版逐 Skill 软链清单，等待重新接入平台根目录。 */
  migrationRequired?: boolean | undefined
}

/** 用户对扫描分组作出的处理决策。 */
export type SkillDecision =
  | { kind: 'adopt'; sourceLocationId: string }
  | { kind: 'merge'; sourceLocationId: string }
  | { kind: 'replace'; sourceLocationId: string; targetLocationIds: string[] }
  | { kind: 'rename-and-adopt'; sourceLocationId: string; newName: string }
  | { kind: 'keep'; groupId: string }
  | { kind: 'archive'; locationIds: string[] }

/** 保留现状操作。 */
export interface SkillKeepOperation {
  /** 操作类型。 */
  kind: 'keep'
}

/** 将一个 Skill 排除在统一源之外，并随平台根目录整体备份。 */
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
  /** 将被替换的平台 Skills 根路径。 */
  path: string
  /** 平台根路径最终指向的 AskX 统一目录。 */
  target: string
}

/** 建立自定义目录受管链接操作。 */
export interface SkillBindCustomRootOperation {
  /** 操作类型。 */
  kind: 'bind-custom-root'
  /** 基于目标路径生成的稳定标识。 */
  id: string
  /** 用于界面展示的目录名称。 */
  name: string
  /** 将被替换为软链的目录路径。 */
  path: string
  /** 目录最终指向的 AskX 统一目录。 */
  target: string
}

/** 选择覆盖统一版本的来源。 */
export interface SkillSelectSourceOperation {
  /** 操作类型。 */
  kind: 'select-source'
  /** 选中的来源路径。 */
  sourcePath: string
}

/** 选择统一源版本；原副本随平台根目录整体备份。 */
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
  | SkillBindCustomRootOperation
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
  /** connect 会接入平台根目录，sync 只更新 AskX 统一源。 */
  mode: SkillsBatchMode
  /** 本次管理平台。 */
  platforms: SkillPlatformId[]
  /** 本次只读扫描使用的额外来源目录。 */
  customRoots: string[]
  /** 每个 Skill 的事务单元。 */
  units: SkillPlanUnit[]
  /** 每个平台最终创建的根目录绑定操作。 */
  platformOperations: SkillBindPlatformOperation[]
  /** 每个自定义使用目录最终创建的根目录绑定操作。 */
  customLinkOperations: SkillBindCustomRootOperation[]
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
  /** 原路径与备份路径。 */
  backups: SkillBackupMove[]
  /** 错误或提示。 */
  warnings: string[]
}

/** 一个平台根目录绑定的执行结果。 */
export interface PlatformBindingResult {
  /** Agent 平台。 */
  platform: SkillPlatformId
  /** 平台 Skills 根路径。 */
  path: string
  /** AskX 统一 Skills 根路径。 */
  target: string
  /** 执行状态。 */
  status: 'applied' | 'failed' | 'rolled-back' | 'skipped'
  /** 原平台目录备份，原路径不存在时为空。 */
  backup?: SkillBackupMove
  /** 错误或提示。 */
  warnings: string[]
}

/** 一个自定义目录绑定的执行结果。 */
export interface CustomLinkBindingResult {
  /** 绑定稳定标识。 */
  id: string
  /** 用于界面展示的目录名称。 */
  name: string
  /** 自定义软链路径。 */
  path: string
  /** AskX 统一 Skills 根路径。 */
  target: string
  /** 执行状态。 */
  status: 'applied' | 'failed' | 'rolled-back' | 'skipped'
  /** 原目录备份，原路径不存在时为空。 */
  backup?: SkillBackupMove
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
  /** 平台根目录代理结果。 */
  platformResults: PlatformBindingResult[]
  /** 自定义目录代理结果。 */
  customLinkResults: CustomLinkBindingResult[]
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
  /** 已保存的自定义扫描来源。 */
  customRoots: SkillCustomScanRoot[]
  /** Manifest 登记的平台根目录绑定。 */
  platformBindings: ManagedPlatformBinding[]
  /** Manifest 登记的自定义目录软链绑定。 */
  customLinkBindings: ManagedCustomLinkBinding[]
  /** 平台根目录绑定的实时健康状态。 */
  platformHealth: ManagedPlatformHealth[]
}

/** Zod 使用的事务结果 schema。 */
export const skillTransactionResultSchema = z.object({
  receiptId: z.string().uuid(),
  skillName: z.string().min(1),
  status: z.enum(['applied', 'failed', 'rolled-back', 'skipped']),
  canonicalPath: z.string().min(1).optional(),
  backups: z.array(z.object({ originalPath: z.string(), backupPath: z.string() })),
  warnings: z.array(z.string()),
})

/** Zod 使用的平台根目录绑定 schema。 */
export const managedPlatformBindingSchema = z.object({
  platform: skillPlatformIdSchema,
  path: z.string().min(1),
  target: z.string().min(1),
  originalRootBackup: z.object({ originalPath: z.string().min(1), backupPath: z.string().min(1) }).optional(),
  updatedAt: z.string().datetime(),
  suspendedAt: z.string().datetime().optional(),
  suspendedPath: z.string().min(1).optional(),
}).refine(
  (binding) => Boolean(binding.suspendedAt) === Boolean(binding.suspendedPath),
  { message: '平台软链的停用时间和保留路径必须同时存在。' },
).refine(
  (binding) => !binding.originalRootBackup || binding.originalRootBackup.originalPath === binding.path,
  { message: '平台原目录备份必须对应当前平台路径。' },
)

/** Zod 使用的平台软链状态计划 schema。 */
export const platformLinkPlanSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  platform: skillPlatformIdSchema,
  action: platformLinkActionSchema,
  path: z.string().min(1),
  target: z.string().min(1),
  suspendedPath: z.string().min(1),
  originalRootBackup: z.object({ originalPath: z.string().min(1), backupPath: z.string().min(1) }).optional(),
  manifestRevision: z.number().int().nonnegative(),
  detectionFingerprint: z.string().min(1),
  operations: z.array(z.object({
    kind: z.literal('move-path'),
    role: z.enum(['managed-link', 'original-root']),
    source: z.string().min(1),
    target: z.string().min(1),
  })).max(2),
  hash: z.string().min(1),
}).refine(
  (plan) => !plan.originalRootBackup || plan.originalRootBackup.originalPath === plan.path,
  { message: '平台原目录备份必须对应计划中的平台路径。' },
)

/** Zod 使用的受管 Skill schema。 */
export const managedSkillRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  canonicalPath: z.string().min(1),
  contentHash: z.string().min(1),
  updatedAt: z.string().datetime(),
})

/** Zod 使用的自定义目录软链绑定 schema。 */
export const managedCustomLinkBindingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  target: z.string().min(1),
  originalRootBackup: z.object({ originalPath: z.string().min(1), backupPath: z.string().min(1) }).optional(),
  updatedAt: z.string().datetime(),
}).refine(
  (binding) => !binding.originalRootBackup || binding.originalRootBackup.originalPath === binding.path,
  { message: '自定义目录备份必须对应当前软链路径。' },
)

/** Zod 使用的自定义扫描来源移除计划 schema。 */
export const skillCustomRootRemovalPlanSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  root: skillCustomScanRootSchema,
  manifestRevision: z.number().int().nonnegative(),
  hash: z.string().min(1),
})

/** Zod 使用的受管 Skill 文件更新计划 schema。 */
export const skillFileUpdatePlanSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  skillId: z.string().uuid(),
  skillName: z.string().min(1),
  path: z.string().min(1),
  manifestRevision: z.number().int().nonnegative(),
  skillContentHash: z.string().min(1),
  previousContentHash: z.string().min(1),
  nextContent: z.string().max(524_288),
  nextContentHash: z.string().min(1),
  hash: z.string().min(1),
})

/** Zod 使用的 manifest schema。 */
export const skillsManifestSchema = z.object({
  version: z.literal(2),
  revision: z.number().int().nonnegative(),
  initializedAt: z.string().datetime(),
  lastScan: z.object({
    scannedAt: z.string().datetime(),
    fingerprint: z.string().min(1),
    platforms: z.array(skillPlatformIdSchema).min(1),
  }),
  skills: z.array(managedSkillRecordSchema),
  customRoots: z.array(skillCustomScanRootSchema).max(MAX_CUSTOM_SKILL_DIRECTORIES).default([]),
  platformBindings: z.array(managedPlatformBindingSchema),
  customLinkBindings: z.array(managedCustomLinkBindingSchema).max(MAX_CUSTOM_SKILL_DIRECTORIES).default([]),
  migrationRequired: z.boolean().optional(),
})

/** Zod 使用的用户决策 schema。 */
export const skillDecisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('adopt'), sourceLocationId: z.string().min(1) }),
  z.object({ kind: z.literal('merge'), sourceLocationId: z.string().min(1) }),
  z.object({ kind: z.literal('replace'), sourceLocationId: z.string().min(1), targetLocationIds: z.array(z.string().min(1)).min(1) }),
  z.object({ kind: z.literal('rename-and-adopt'), sourceLocationId: z.string().min(1), newName: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) }),
  z.object({ kind: z.literal('keep'), groupId: z.string().min(1) }),
  z.object({ kind: z.literal('archive'), locationIds: z.array(z.string().min(1)).min(1) }),
])

/** Zod 使用的计划操作 schema。 */
export const skillPlanOperationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('keep') }),
  z.object({ kind: z.literal('archive'), path: z.string().min(1) }),
  z.object({ kind: z.literal('copy-canonical'), sourcePath: z.string().min(1), targetPath: z.string().min(1) }),
  z.object({ kind: z.literal('bind-platform'), platform: skillPlatformIdSchema, path: z.string().min(1), target: z.string().min(1) }),
  z.object({ kind: z.literal('bind-custom-root'), id: z.string().min(1), name: z.string().min(1), path: z.string().min(1), target: z.string().min(1) }),
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
  mode: skillsBatchModeSchema,
  platforms: z.array(skillPlatformIdSchema).min(1),
  customRoots: z.array(z.string().min(1)).max(MAX_CUSTOM_SKILL_DIRECTORIES),
  units: z.array(z.object({
    id: z.string().uuid(),
    skillName: z.string().min(1),
    decision: skillDecisionSchema,
    operations: z.array(skillPlanOperationSchema),
    warnings: z.array(z.string()),
  })),
  platformOperations: z.array(z.object({
    kind: z.literal('bind-platform'),
    platform: skillPlatformIdSchema,
    path: z.string().min(1),
    target: z.string().min(1),
  })),
  customLinkOperations: z.array(z.object({
    kind: z.literal('bind-custom-root'),
    id: z.string().min(1),
    name: z.string().min(1),
    path: z.string().min(1),
    target: z.string().min(1),
  })).max(MAX_CUSTOM_SKILL_DIRECTORIES).default([]),
  hash: z.string().min(1),
})

/** Zod 使用的平台根目录绑定执行结果 schema。 */
export const platformBindingResultSchema = z.object({
  platform: skillPlatformIdSchema,
  path: z.string().min(1),
  target: z.string().min(1),
  status: z.enum(['applied', 'failed', 'rolled-back', 'skipped']),
  backup: z.object({ originalPath: z.string(), backupPath: z.string() }).optional(),
  warnings: z.array(z.string()),
})

/** Zod 使用的自定义目录绑定执行结果 schema。 */
export const customLinkBindingResultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  target: z.string().min(1),
  status: z.enum(['applied', 'failed', 'rolled-back', 'skipped']),
  backup: z.object({ originalPath: z.string(), backupPath: z.string() }).optional(),
  warnings: z.array(z.string()),
})
