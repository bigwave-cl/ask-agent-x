import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { cp, lstat, mkdir, readFile, readdir, readlink, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'
import { stableHash, type UserConsent } from '@askx/core'
import { z } from 'zod'
import type { SkillsManifestStore } from './manifest-store.js'
import { managedSkillRecordSchema, type ManagedSkillRecord, type SkillsManifest } from './skill-types.js'

/** 用户可管理的统一源备份目录名。 */
const CANONICAL_BACKUP_DIRECTORY = 'skills-source'
/** 备份中的统一源内容目录名。 */
const BACKUP_SOURCE_DIRECTORY = 'source'
/** 备份元数据文件名。 */
const BACKUP_METADATA_FILE = 'backup.json'
/** 年月日与当日次数组成的备份版本格式。 */
const BACKUP_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}-\d{2,}$/

/** 统一源支持的二次操作。 */
export const canonicalSourceActionSchema = z.enum(['clear', 'restore', 'delete-backup'])

/** 统一源支持的二次操作。 */
export type CanonicalSourceAction = z.infer<typeof canonicalSourceActionSchema>

/** 一份用户可管理的统一源备份。 */
export interface CanonicalSkillsBackup {
  /** 年月日与当日次数组成的稳定版本。 */
  version: string
  /** 本机备份目录。 */
  path: string
  /** 备份是否完整且可恢复。 */
  valid: boolean
  /** 备份创建时间。 */
  createdAt?: string | undefined
  /** 备份中的受管 Skill 数量。 */
  skillCount?: number | undefined
  /** 备份中的统一源根节点数量。 */
  entryCount?: number | undefined
  /** 备份内容指纹。 */
  sourceFingerprint?: string | undefined
  /** 无法恢复时的原因。 */
  issue?: string | undefined
}

/** 统一源二次操作的确认计划。 */
export interface CanonicalSourceMutationPlan {
  /** 计划标识。 */
  id: string
  /** 计划创建时间。 */
  createdAt: string
  /** 清空、恢复或永久删除备份。 */
  action: CanonicalSourceAction
  /** 计划基于的 manifest revision。 */
  manifestRevision: number
  /** 计划基于的文件系统状态指纹。 */
  detectionFingerprint: string
  /** 当前统一源根节点数量。 */
  currentEntryCount: number
  /** 当前 manifest 中的受管 Skill 数量。 */
  currentSkillCount: number
  /** 清空前是否会创建长期备份。 */
  backupRequired: boolean
  /** 将创建、恢复或永久删除的备份版本。 */
  backupVersion?: string | undefined
  /** 用户授权对应的稳定计划指纹。 */
  hash: string
}

/** 一次统一源二次操作的执行结果。 */
export interface CanonicalSourceMutationReceipt {
  /** 回执标识。 */
  id: string
  /** 对应计划指纹。 */
  planHash: string
  /** 已确认的操作。 */
  action: CanonicalSourceAction
  /** 实际应用或幂等跳过。 */
  status: 'applied' | 'skipped'
  /** 操作完成时间。 */
  appliedAt: string
  /** 操作完成后的 manifest revision。 */
  manifestRevision: number
  /** 清空前创建的长期备份。 */
  createdBackup?: CanonicalSkillsBackup | undefined
  /** 已恢复的备份版本。 */
  restoredBackupVersion?: string | undefined
  /** 已永久删除的备份版本。 */
  deletedBackupVersion?: string | undefined
}

/** 统一源备份文件内保存的完整元数据。 */
interface CanonicalBackupMetadata {
  /** 数据格式版本。 */
  version: 1
  /** 用户可见的备份版本。 */
  backupVersion: string
  /** 备份创建时间。 */
  createdAt: string
  /** 备份时的统一源内容指纹。 */
  sourceFingerprint: string
  /** 备份时的统一源根节点数量。 */
  entryCount: number
  /** 备份时 manifest 中的受管 Skill。 */
  skills: ManagedSkillRecord[]
}

/** 统一源目录的只读内容快照。 */
interface CanonicalSourceSnapshot {
  /** 路径是否存在。 */
  kind: 'missing' | 'directory'
  /** 不跟随软链接的完整内容指纹。 */
  fingerprint: string
  /** 统一源直接子节点数量。 */
  entryCount: number
}

/** 已读取的备份状态。 */
interface CanonicalBackupState {
  /** 用户可见摘要。 */
  summary: CanonicalSkillsBackup
  /** 校验成功后的恢复元数据。 */
  metadata?: CanonicalBackupMetadata | undefined
  /** 整个备份目录的检测指纹。 */
  backupFingerprint: string
}

/** 统一源管理器依赖。 */
export interface CanonicalSourceManagerContext {
  /** Skills manifest 存储。 */
  manifestStore: SkillsManifestStore
}

/** 备份元数据运行时校验。 */
const canonicalBackupMetadataSchema = z.object({
  version: z.literal(1),
  backupVersion: z.string().regex(BACKUP_VERSION_PATTERN),
  createdAt: z.string().datetime(),
  sourceFingerprint: z.string().min(1),
  entryCount: z.number().int().nonnegative(),
  skills: z.array(managedSkillRecordSchema),
})

/** 统一源二次操作计划运行时校验。 */
export const canonicalSourceMutationPlanSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  action: canonicalSourceActionSchema,
  manifestRevision: z.number().int().nonnegative(),
  detectionFingerprint: z.string().min(1),
  currentEntryCount: z.number().int().nonnegative(),
  currentSkillCount: z.number().int().nonnegative(),
  backupRequired: z.boolean(),
  backupVersion: z.string().regex(BACKUP_VERSION_PATTERN).optional(),
  hash: z.string().min(1),
}).superRefine((plan, context) => {
  if ((plan.action === 'restore' || plan.action === 'delete-backup' || plan.backupRequired) && !plan.backupVersion) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['backupVersion'], message: '该操作必须指定备份版本。' })
  }
  if (plan.action !== 'clear' && plan.backupRequired) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['backupRequired'], message: '只有清空操作会创建长期备份。' })
  }
})

/** 未签名的统一源计划。 */
type UnsignedCanonicalSourceMutationPlan = Omit<CanonicalSourceMutationPlan, 'hash'>

/** 获取统一源绝对路径。 */
function resolveCanonicalRoot(context: CanonicalSourceManagerContext): string {
  return join(context.manifestStore.dataDir, 'skills')
}

/** 获取用户可管理的长期备份根路径。 */
function resolveBackupRoot(context: CanonicalSourceManagerContext): string {
  return join(context.manifestStore.dataDir, 'backups', CANONICAL_BACKUP_DIRECTORY)
}

/** 将本机路径转换为稳定的 POSIX 相对路径。 */
function toPortablePath(path: string): string {
  return path.split(sep).join('/')
}

/** 判断路径是否存在。 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/** 校验备份版本并解析其受管路径。 */
function resolveBackupPath(context: CanonicalSourceManagerContext, version: string): string {
  if (!BACKUP_VERSION_PATTERN.test(version) || basename(version) !== version) throw new Error('统一源备份版本无效。')
  const root = resolve(resolveBackupRoot(context))
  const candidate = resolve(root, version)
  if (relative(root, candidate).startsWith('..')) throw new Error('统一源备份路径超出管理范围。')
  return candidate
}

/** 递归写入目录内容指纹，但绝不跟随软链接。 */
async function updateDirectoryHash(hash: ReturnType<typeof createHash>, root: string, directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name)
    const portablePath = toPortablePath(relative(root, absolutePath))
    const entryStat = await lstat(absolutePath)
    if (entryStat.isSymbolicLink()) {
      hash.update(`L\0${portablePath}\0${await readlink(absolutePath)}\0`)
      continue
    }
    if (entryStat.isDirectory()) {
      hash.update(`D\0${portablePath}\0`)
      await updateDirectoryHash(hash, root, absolutePath)
      continue
    }
    if (entryStat.isFile()) {
      hash.update(`F\0${portablePath}\0${entryStat.size}\0`)
      for await (const chunk of createReadStream(absolutePath)) hash.update(chunk as Buffer)
      hash.update('\0')
      continue
    }
    hash.update(`O\0${portablePath}\0${entryStat.mode}\0`)
  }
}

/** 读取统一源或备份目录的稳定快照。 */
async function inspectDirectory(path: string): Promise<CanonicalSourceSnapshot> {
  try {
    const rootStat = await lstat(path)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error(`受管目录不是可替换的真实目录：${path}`)
    const entries = await readdir(path)
    const hash = createHash('sha256')
    hash.update('directory\0')
    await updateDirectoryHash(hash, path, path)
    return { kind: 'directory', fingerprint: hash.digest('hex'), entryCount: entries.length }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { kind: 'missing', fingerprint: stableHash({ kind: 'missing' }), entryCount: 0 }
    }
    throw error
  }
}

/** 将日期格式化为备份版本的年月日部分。 */
function formatBackupDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 获取当天尚未占用的下一备份次数。 */
async function createNextBackupVersion(context: CanonicalSourceManagerContext, date: Date): Promise<string> {
  const datePrefix = `${formatBackupDate(date)}-`
  let versions: string[] = []
  try {
    versions = (await readdir(resolveBackupRoot(context), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(datePrefix) && BACKUP_VERSION_PATTERN.test(entry.name))
      .map((entry) => entry.name)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const sequence = versions.reduce((current, version) => Math.max(current, Number(version.slice(datePrefix.length)) || 0), 0) + 1
  return `${datePrefix}${String(sequence).padStart(2, '0')}`
}

/** 读取并按需完整校验一份长期备份。 */
async function readBackupState(context: CanonicalSourceManagerContext, version: string, verifyContent = true): Promise<CanonicalBackupState> {
  const backupPath = resolveBackupPath(context, version)
  try {
    const backupStat = await lstat(backupPath)
    if (!backupStat.isDirectory() || backupStat.isSymbolicLink()) throw new Error('备份路径不是 AskX 创建的真实目录。')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`统一源备份不存在：${version}`)
    throw error
  }
  const baseSummary: CanonicalSkillsBackup = { version, path: backupPath, valid: false }
  try {
    const metadata = canonicalBackupMetadataSchema.parse(JSON.parse(await readFile(join(backupPath, BACKUP_METADATA_FILE), 'utf8'))) as CanonicalBackupMetadata
    if (metadata.backupVersion !== version) throw new Error('备份版本与目录名称不一致。')
    const sourcePath = join(backupPath, BACKUP_SOURCE_DIRECTORY)
    if (verifyContent) {
      const sourceSnapshot = await inspectDirectory(sourcePath)
      if (sourceSnapshot.kind !== 'directory' || sourceSnapshot.fingerprint !== metadata.sourceFingerprint || sourceSnapshot.entryCount !== metadata.entryCount) {
        throw new Error('备份内容与创建时指纹不一致。')
      }
    } else {
      const sourceStat = await lstat(sourcePath)
      if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error('备份内容目录无效。')
    }
    return {
      summary: {
        ...baseSummary,
        valid: true,
        createdAt: metadata.createdAt,
        skillCount: metadata.skills.length,
        entryCount: metadata.entryCount,
        sourceFingerprint: metadata.sourceFingerprint,
      },
      metadata,
      backupFingerprint: verifyContent ? (await inspectDirectory(backupPath)).fingerprint : stableHash(metadata),
    }
  } catch (error) {
    return {
      summary: { ...baseSummary, issue: error instanceof Error ? error.message : '备份无法校验。' },
      backupFingerprint: verifyContent ? (await inspectDirectory(backupPath)).fingerprint : stableHash({ version, invalid: true }),
    }
  }
}

/** 列出用户可恢复或永久删除的统一源备份。 */
export async function listCanonicalSkillsBackups(context: CanonicalSourceManagerContext): Promise<CanonicalSkillsBackup[]> {
  let versions: string[] = []
  try {
    versions = (await readdir(resolveBackupRoot(context), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && BACKUP_VERSION_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return Promise.all(versions.map(async (version) => (await readBackupState(context, version, false)).summary))
}

/** 创建操作相关的最新文件系统检测指纹。 */
async function createDetectionState(context: CanonicalSourceManagerContext, manifest: SkillsManifest, action: CanonicalSourceAction, backupVersion?: string): Promise<{ fingerprint: string, source: CanonicalSourceSnapshot }> {
  const source = await inspectDirectory(resolveCanonicalRoot(context))
  if (action === 'clear') return { source, fingerprint: stableHash({ action, source, manifestSkills: manifest.skills }) }
  if (!backupVersion) throw new Error('该操作缺少统一源备份版本。')
  const backup = await readBackupState(context, backupVersion)
  return {
    source,
    fingerprint: stableHash({ action, backupVersion, backupFingerprint: backup.backupFingerprint, source: action === 'restore' ? source : undefined }),
  }
}

/** 为清空、恢复或永久删除备份生成确认计划。 */
export async function createCanonicalSourceMutationPlan(context: CanonicalSourceManagerContext, action: CanonicalSourceAction, backupVersion?: string, now = new Date()): Promise<CanonicalSourceMutationPlan> {
  const manifest = await context.manifestStore.read()
  if (!manifest?.initializedAt) throw new Error('Skills 管理尚未初始化。')
  let selectedBackupVersion = backupVersion
  if (action === 'restore') {
    if (!selectedBackupVersion) throw new Error('请选择要恢复的统一源备份。')
    const backup = await readBackupState(context, selectedBackupVersion)
    if (!backup.summary.valid) throw new Error(backup.summary.issue ?? '统一源备份已经损坏，不能恢复。')
  }
  if (action === 'delete-backup' && !selectedBackupVersion) throw new Error('请选择要永久删除的统一源备份。')
  const detection = await createDetectionState(context, manifest, action, selectedBackupVersion)
  const hasSystemSkill = manifest.skills.some((skill) => skill.kind === 'system')
  const userEntryCount = Math.max(0, detection.source.entryCount - (hasSystemSkill ? 1 : 0))
  const backupRequired = action === 'clear' && userEntryCount > 0
  if (backupRequired) selectedBackupVersion = await createNextBackupVersion(context, now)
  const unsigned: UnsignedCanonicalSourceMutationPlan = {
    id: randomUUID(),
    createdAt: now.toISOString(),
    action,
    manifestRevision: manifest.revision,
    detectionFingerprint: detection.fingerprint,
    currentEntryCount: detection.source.entryCount,
    currentSkillCount: manifest.skills.length,
    backupRequired,
    ...(selectedBackupVersion ? { backupVersion: selectedBackupVersion } : {}),
  }
  return canonicalSourceMutationPlanSchema.parse({ ...unsigned, hash: stableHash(unsigned) })
}

/** 原子创建一份清空前的长期备份。 */
async function createPersistentBackup(context: CanonicalSourceManagerContext, plan: CanonicalSourceMutationPlan, manifest: SkillsManifest, source: CanonicalSourceSnapshot): Promise<CanonicalSkillsBackup> {
  if (!plan.backupVersion) throw new Error('清空计划缺少备份版本。')
  const finalPath = resolveBackupPath(context, plan.backupVersion)
  if (await pathExists(finalPath)) throw new Error('计划中的备份版本已被占用，请重新操作。')
  const backupRoot = resolveBackupRoot(context)
  const temporaryPath = join(backupRoot, `.creating-${plan.id}`)
  await mkdir(backupRoot, { recursive: true, mode: 0o700 })
  await rm(temporaryPath, { recursive: true, force: true })
  try {
    await cp(resolveCanonicalRoot(context), join(temporaryPath, BACKUP_SOURCE_DIRECTORY), {
      recursive: true,
      dereference: false,
      preserveTimestamps: true,
      errorOnExist: true,
    })
    const copied = await inspectDirectory(join(temporaryPath, BACKUP_SOURCE_DIRECTORY))
    if (copied.fingerprint !== source.fingerprint || copied.entryCount !== source.entryCount) throw new Error('清空前备份校验失败。')
    const metadata: CanonicalBackupMetadata = {
      version: 1,
      backupVersion: plan.backupVersion,
      createdAt: plan.createdAt,
      sourceFingerprint: source.fingerprint,
      entryCount: source.entryCount,
      skills: manifest.skills,
    }
    await writeFile(join(temporaryPath, BACKUP_METADATA_FILE), `${JSON.stringify(metadata, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, finalPath)
    const created = await readBackupState(context, plan.backupVersion)
    if (!created.summary.valid) throw new Error(created.summary.issue ?? '清空前备份校验失败。')
    return created.summary
  } catch (error) {
    await rm(temporaryPath, { recursive: true, force: true }).catch(() => undefined)
    await rm(finalPath, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

/** 在失败时恢复统一源目录的原始状态。 */
async function rollbackCanonicalRoot(canonicalRoot: string, originalPath: string, replacementApplied: boolean, originalMoved: boolean): Promise<void> {
  if (replacementApplied) await rm(canonicalRoot, { recursive: true, force: true })
  if (originalMoved) await rename(originalPath, canonicalRoot)
}

/** 应用经过确认的统一源清空计划。 */
async function applyClearPlan(context: CanonicalSourceManagerContext, plan: CanonicalSourceMutationPlan, manifest: SkillsManifest, source: CanonicalSourceSnapshot): Promise<CanonicalSourceMutationReceipt> {
  const appliedAt = new Date().toISOString()
  const systemSkill = manifest.skills.find((skill) => skill.kind === 'system')
  if (!systemSkill) throw new Error('默认 AskX Skill Manager 缺失，请先修复后再清空。')
  const userSkillCount = manifest.skills.filter((skill) => skill.kind !== 'system').length
  if (source.entryCount === 1 && userSkillCount === 0) {
    return { id: randomUUID(), planHash: plan.hash, action: plan.action, status: 'skipped', appliedAt, manifestRevision: manifest.revision }
  }
  let createdBackup: CanonicalSkillsBackup | undefined
  if (plan.backupRequired) createdBackup = await createPersistentBackup(context, plan, manifest, source)
  const canonicalRoot = resolveCanonicalRoot(context)
  const transactionRoot = join(context.manifestStore.dataDir, 'transactions', `canonical-clear-${plan.id}`)
  const originalPath = join(transactionRoot, 'original-source')
  const replacementPath = join(transactionRoot, 'empty-source')
  let originalMoved = false
  let replacementApplied = false
  let savedManifest: SkillsManifest | undefined
  try {
    await mkdir(replacementPath, { recursive: true, mode: 0o700 })
    await cp(systemSkill.canonicalPath, join(replacementPath, systemSkill.name), {
      recursive: true,
      dereference: false,
      preserveTimestamps: true,
      errorOnExist: true,
    })
    if (source.kind === 'directory') {
      await rename(canonicalRoot, originalPath)
      originalMoved = true
    }
    await rename(replacementPath, canonicalRoot)
    replacementApplied = true
    savedManifest = await context.manifestStore.write({ ...manifest, skills: [systemSkill] }, manifest.revision)
    const verified = await inspectDirectory(canonicalRoot)
    if (verified.kind !== 'directory' || verified.entryCount !== 1) throw new Error('统一源清空后验证失败。')
    await rm(transactionRoot, { recursive: true, force: true }).catch(() => undefined)
    return {
      id: randomUUID(),
      planHash: plan.hash,
      action: plan.action,
      status: 'applied',
      appliedAt,
      manifestRevision: savedManifest?.revision ?? manifest.revision,
      ...(createdBackup ? { createdBackup } : {}),
    }
  } catch (error) {
    const rollbackErrors: unknown[] = []
    try {
      await rollbackCanonicalRoot(canonicalRoot, originalPath, replacementApplied, originalMoved)
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }
    if (savedManifest) {
      try {
        await context.manifestStore.write(manifest, savedManifest.revision)
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    if (createdBackup) await rm(createdBackup.path, { recursive: true, force: true }).catch((rollbackError) => rollbackErrors.push(rollbackError))
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], '统一源清空失败且自动恢复不完整。')
    throw error
  }
}

/** 应用经过确认的统一源备份恢复计划。 */
async function applyRestorePlan(context: CanonicalSourceManagerContext, plan: CanonicalSourceMutationPlan, manifest: SkillsManifest, source: CanonicalSourceSnapshot): Promise<CanonicalSourceMutationReceipt> {
  if (!plan.backupVersion) throw new Error('恢复计划缺少备份版本。')
  const backup = await readBackupState(context, plan.backupVersion)
  if (!backup.summary.valid || !backup.metadata) throw new Error(backup.summary.issue ?? '统一源备份已经损坏，不能恢复。')
  const canonicalRoot = resolveCanonicalRoot(context)
  const transactionRoot = join(context.manifestStore.dataDir, 'transactions', `canonical-restore-${plan.id}`)
  const originalPath = join(transactionRoot, 'original-source')
  const replacementPath = join(transactionRoot, 'restored-source')
  let originalMoved = false
  let replacementApplied = false
  let savedManifest: SkillsManifest | undefined
  try {
    await mkdir(transactionRoot, { recursive: true, mode: 0o700 })
    await cp(join(backup.summary.path, BACKUP_SOURCE_DIRECTORY), replacementPath, {
      recursive: true,
      dereference: false,
      preserveTimestamps: true,
      errorOnExist: true,
    })
    const staged = await inspectDirectory(replacementPath)
    if (staged.fingerprint !== backup.metadata.sourceFingerprint || staged.entryCount !== backup.metadata.entryCount) throw new Error('恢复内容写入暂存区后校验失败。')
    if (source.kind === 'directory') {
      await rename(canonicalRoot, originalPath)
      originalMoved = true
    }
    await rename(replacementPath, canonicalRoot)
    replacementApplied = true
    const restoredSkills = backup.metadata.skills.map((skill) => ({ ...skill, canonicalPath: join(canonicalRoot, skill.name) }))
    savedManifest = await context.manifestStore.write({ ...manifest, skills: restoredSkills }, manifest.revision)
    const verified = await inspectDirectory(canonicalRoot)
    if (verified.fingerprint !== backup.metadata.sourceFingerprint || verified.entryCount !== backup.metadata.entryCount) throw new Error('统一源恢复后验证失败。')
    await rm(transactionRoot, { recursive: true, force: true }).catch(() => undefined)
    return {
      id: randomUUID(),
      planHash: plan.hash,
      action: plan.action,
      status: 'applied',
      appliedAt: new Date().toISOString(),
      manifestRevision: savedManifest.revision,
      restoredBackupVersion: plan.backupVersion,
    }
  } catch (error) {
    const rollbackErrors: unknown[] = []
    try {
      await rollbackCanonicalRoot(canonicalRoot, originalPath, replacementApplied, originalMoved)
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }
    if (savedManifest) {
      try {
        await context.manifestStore.write(manifest, savedManifest.revision)
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], '统一源恢复失败且自动回滚不完整。')
    throw error
  }
}

/** 应用经过确认的备份永久删除计划。 */
async function applyDeleteBackupPlan(context: CanonicalSourceManagerContext, plan: CanonicalSourceMutationPlan, manifest: SkillsManifest): Promise<CanonicalSourceMutationReceipt> {
  if (!plan.backupVersion) throw new Error('删除计划缺少备份版本。')
  const backupPath = resolveBackupPath(context, plan.backupVersion)
  const transactionRoot = join(context.manifestStore.dataDir, 'transactions', `canonical-backup-delete-${plan.id}`)
  const trashPath = join(transactionRoot, plan.backupVersion)
  await mkdir(transactionRoot, { recursive: true, mode: 0o700 })
  await rename(backupPath, trashPath)
  try {
    if (await pathExists(backupPath)) throw new Error('备份移出可恢复列表后验证失败。')
    await rm(trashPath, { recursive: true, force: true })
    await rm(transactionRoot, { recursive: true, force: true }).catch(() => undefined)
    return {
      id: randomUUID(),
      planHash: plan.hash,
      action: plan.action,
      status: 'applied',
      appliedAt: new Date().toISOString(),
      manifestRevision: manifest.revision,
      deletedBackupVersion: plan.backupVersion,
    }
  } catch (error) {
    try {
      if (await pathExists(trashPath) && !(await pathExists(backupPath))) await rename(trashPath, backupPath)
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], '备份删除失败且无法恢复删除前状态。')
    }
    throw error
  }
}

/** 应用经过用户确认的统一源清空、恢复或备份删除计划。 */
export async function applyCanonicalSourceMutationPlan(context: CanonicalSourceManagerContext, inputPlan: CanonicalSourceMutationPlan, consent: UserConsent): Promise<CanonicalSourceMutationReceipt> {
  const plan = canonicalSourceMutationPlanSchema.parse(inputPlan)
  const { hash: _hash, ...unsigned } = plan
  if (stableHash(unsigned) !== plan.hash || consent.planHash !== plan.hash) throw new Error('统一源操作计划或用户授权已经失效。')
  const manifest = await context.manifestStore.read()
  if (!manifest || manifest.revision !== plan.manifestRevision) throw new Error('Skills manifest 已经变化，请重新操作。')
  const detection = await createDetectionState(context, manifest, plan.action, plan.action === 'clear' ? undefined : plan.backupVersion)
  if (detection.fingerprint !== plan.detectionFingerprint || detection.source.entryCount !== plan.currentEntryCount || manifest.skills.length !== plan.currentSkillCount) {
    throw new Error('统一源或备份已经变化，请重新操作。')
  }
  if (plan.action === 'clear') return applyClearPlan(context, plan, manifest, detection.source)
  if (plan.action === 'restore') return applyRestorePlan(context, plan, manifest, detection.source)
  return applyDeleteBackupPlan(context, plan, manifest)
}
