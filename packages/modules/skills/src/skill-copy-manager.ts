import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readlink, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { stableHash, type UserConsent } from '@askx/core'
import type { SkillsManifestStore } from './manifest-store.js'
import { detectSkillPlatforms, hashSkillDirectory } from './scanner.js'
import { compareManagerVersions, fingerprintManagedSkill, inspectSkillManagerMetadata } from './skill-manager-metadata.js'
import { SkillManagerRegistryStore } from './skill-manager-registry.js'
import {
  MAX_SKILL_COPY_TARGETS,
  MAX_SKILL_COPY_UNITS,
  skillCopyBatchPlanSchema,
  skillCopyPlanSchema,
  skillCopySelectionSchema,
  type ManagedSkillRecord,
  type SkillCopyBatchPlan,
  type SkillCopyBatchReceipt,
  type SkillCopyBatchUnitResult,
  type SkillBackupMove,
  type SkillCopyConflictStrategy,
  type SkillCopyPlan,
  type SkillCopyReceipt,
  type SkillCopySelection,
  type SkillCopyTarget,
} from './skill-types.js'

/** 单 Skill 复制管理器所需依赖。 */
export interface SkillCopyManagerContext {
  /** 当前用户目录。 */
  homeDir: string
  /** Skills manifest 存储。 */
  manifestStore: SkillsManifestStore
}

/** 文件系统路径的稳定只读快照。 */
interface CopyPathSnapshot {
  /** 快照路径。 */
  path: string
  /** 当前路径类型。 */
  kind: 'missing' | 'directory' | 'file' | 'symlink' | 'other'
  /** 目录内容指纹。 */
  contentHash?: string | undefined
  /** 软链保存的原始目标。 */
  linkTarget?: string | undefined
}

/** 复制计划中参与 hash 的字段。 */
type UnsignedSkillCopyPlan = Omit<SkillCopyPlan, 'hash'>

/** 批量复制计划中参与 hash 的字段。 */
type UnsignedSkillCopyBatchPlan = Omit<SkillCopyBatchPlan, 'hash'>

/** 已校验的受管 Skill 与 manifest 版本。 */
interface ResolvedManagedSkill {
  /** 当前 manifest 版本。 */
  manifestRevision: number
  /** 当前 registry 版本。 */
  registryRevision: number
  /** 受管 Skill 记录。 */
  record: ManagedSkillRecord
}

/** 判断路径是否严格位于指定父目录中。 */
function isPathInside(parent: string, candidate: string): boolean {
  const child = relative(resolve(parent), resolve(candidate))
  return Boolean(child) && !child.startsWith('..') && !isAbsolute(child)
}

/** 判断路径是否存在，失效软链也视为存在。 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/** 读取一个路径的类型和目录指纹。 */
async function inspectPath(path: string): Promise<CopyPathSnapshot> {
  try {
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) return { path, kind: 'symlink', linkTarget: await readlink(path) }
    if (stat.isDirectory()) return { path, kind: 'directory', contentHash: await hashSkillDirectory(path) }
    if (stat.isFile()) return { path, kind: 'file' }
    return { path, kind: 'other' }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path, kind: 'missing' }
    throw error
  }
}

/** 读取目标根目录，但不递归计算容器目录内容。 */
async function inspectTargetRoot(path: string): Promise<CopyPathSnapshot> {
  try {
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) return { path, kind: 'symlink', linkTarget: await readlink(path) }
    if (stat.isDirectory()) return { path, kind: 'directory' }
    if (stat.isFile()) return { path, kind: 'file' }
    return { path, kind: 'other' }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path, kind: 'missing' }
    throw error
  }
}

/** 校验一个 manifest Skill 仍对应真实且未漂移的统一源目录。 */
async function validateManagedSkill(context: SkillCopyManagerContext, record: ManagedSkillRecord): Promise<void> {
  if (basename(record.name) !== record.name || ['.', '..'].includes(record.name)) throw new Error('受管 Skill 名称不能安全写入目标目录。')
  const expectedPath = join(context.manifestStore.dataDir, 'skills', record.name)
  if (resolve(record.canonicalPath) !== resolve(expectedPath)) throw new Error('受管 Skill 路径超出 AskX 统一源。')
  const stat = await lstat(record.canonicalPath)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('受管 Skill 不是可复制的真实目录。')
  const contentHash = await hashSkillDirectory(record.canonicalPath)
  if (contentHash !== record.contentHash) throw new Error(`统一源 Skill ${record.name} 已经变化，请刷新页面后重试。`)
}

/** 根据 manifest 一次解析并校验多个受管统一源 Skill。 */
async function resolveManagedSkills(context: SkillCopyManagerContext, skillIds: string[]): Promise<Map<string, ResolvedManagedSkill>> {
  const manifest = await context.manifestStore.read()
  if (!manifest?.initializedAt) throw new Error('Skills 管理尚未初始化。')
  const result = new Map<string, ResolvedManagedSkill>()
  const registryRevision = (await new SkillManagerRegistryStore(context.manifestStore.dataDir).read())?.revision ?? 0
  for (const skillId of [...new Set(skillIds)]) {
    const record = manifest.skills.find((entry) => entry.id === skillId)
    if (!record) throw new Error('找不到要同步的受管 Skill。')
    await validateManagedSkill(context, record)
    result.set(skillId, { manifestRevision: manifest.revision, registryRevision, record })
  }
  return result
}

/** 根据 manifest 严格解析一个受管统一源 Skill。 */
async function resolveManagedSkill(context: SkillCopyManagerContext, skillId: string): Promise<ResolvedManagedSkill> {
  return (await resolveManagedSkills(context, [skillId])).get(skillId)!
}

/** 将用户目标解析为当前设备上的真实根目录。 */
async function resolveTargetRoot(context: SkillCopyManagerContext, target: SkillCopyTarget): Promise<string> {
  if (target.kind === 'folder') {
    if (!isAbsolute(target.path)) throw new Error('同步目标必须是绝对路径。')
    return resolve(target.path)
  }
  const platforms = await detectSkillPlatforms(context.homeDir)
  const platform = platforms.find((entry) => entry.id === target.platform)
  if (!platform) throw new Error(`找不到目标平台：${target.platform}`)
  return resolve(platform.skillsDir)
}

/** 校验目标没有指向 AskX 自己的统一源或已接入的平台软链。 */
async function assertTargetScope(context: SkillCopyManagerContext, target: SkillCopyTarget, targetRoot: string, destinationPath: string, sourcePath: string): Promise<void> {
  const dataRoot = resolve(context.manifestStore.dataDir)
  const manifest = await context.manifestStore.read()
  if (target.kind === 'platform') {
    const binding = manifest?.platformBindings.find((entry) => entry.platform === target.platform)
    if (binding && !binding.suspendedAt) throw new Error('该平台已经通过软链使用统一源，无需再次同步。')
  }
  if (resolve(destinationPath) === resolve(sourcePath) || isPathInside(sourcePath, destinationPath) || isPathInside(destinationPath, sourcePath)) {
    throw new Error('同步目标与统一源 Skill 路径重叠。')
  }
  if (resolve(targetRoot) === dataRoot || isPathInside(dataRoot, targetRoot)) throw new Error('不能把 AskX 内部数据目录作为同步目标。')
}

/** 创建目标文件系统状态指纹。 */
async function createDetectionState(targetRoot: string, destinationPath: string): Promise<{ fingerprint: string, root: CopyPathSnapshot, destination: CopyPathSnapshot }> {
  const root = await inspectTargetRoot(targetRoot)
  const destination = ['missing', 'directory'].includes(root.kind)
    ? await inspectPath(destinationPath)
    : { path: destinationPath, kind: 'other' as const }
  return { root, destination, fingerprint: stableHash({ root, destination }) }
}

/** 原子保存同步回执。 */
async function saveReceipt(context: SkillCopyManagerContext, receipt: SkillCopyReceipt): Promise<void> {
  const receiptPath = join(context.manifestStore.dataDir, 'transactions', 'skill-copies', `${receipt.id}.json`)
  await mkdir(dirname(receiptPath), { recursive: true, mode: 0o700 })
  const temporaryPath = `${receiptPath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporaryPath, receiptPath)
}

/** 把已验证的复制目标写入 registry。 */
async function recordCopyTarget(
  context: SkillCopyManagerContext,
  plan: SkillCopyPlan,
  record: ManagedSkillRecord,
  status: 'copied' | 'conflict',
): Promise<void> {
  if (!record.manager) return
  const store = new SkillManagerRegistryStore(context.manifestStore.dataDir)
  const registry = await store.read()
  if (!registry || registry.revision !== plan.registryRevision) throw new Error('Skill registry 已经变化，请重新生成同步计划。')
  const previous = registry.skills[record.manager.skillId]
  if (!previous) throw new Error(`Registry 中不存在受管 Skill：${record.name}`)
  const key = plan.target.kind === 'platform' ? `platform:${plan.target.platform}` : `folder:${plan.targetRoot}`
  await store.write({
    ...registry,
    skills: {
      ...registry.skills,
      [record.manager.skillId]: {
        ...previous,
        targets: {
          ...previous.targets,
          [key]: {
            kind: plan.target.kind,
            path: plan.destinationPath,
            status,
            ...(status === 'copied' ? {
              version: record.manager.version,
              content_sha256: record.manager.contentSha256,
              synced_at: new Date().toISOString(),
            } : {}),
          },
        },
      },
    },
  }, registry.revision)
}

/** 使用已经校验的来源与目标根目录生成一个独立复制计划。 */
async function createSkillCopyPlanFromResolved(
  context: SkillCopyManagerContext,
  resolvedSkill: ResolvedManagedSkill,
  target: SkillCopyTarget,
  conflictStrategy: SkillCopyConflictStrategy,
  targetRoot: string,
): Promise<SkillCopyPlan> {
  const { manifestRevision, registryRevision, record } = resolvedSkill
  const destinationPath = join(targetRoot, record.name)
  await assertTargetScope(context, target, targetRoot, destinationPath, record.canonicalPath)
  const detection = await createDetectionState(targetRoot, destinationPath)
  if (target.kind === 'folder' && detection.root.kind !== 'directory') throw new Error('选择的同步目标不是可用的真实目录。')
  if (target.kind === 'platform' && !['missing', 'directory'].includes(detection.root.kind)) throw new Error('平台 Skills 根路径不是可用的真实目录。')
  if (!['missing', 'directory'].includes(detection.destination.kind)) throw new Error('目标同名路径不是可安全替换的真实目录。')

  const targetState = detection.destination.kind === 'missing'
    ? 'missing'
    : detection.destination.contentHash === record.contentHash ? 'identical' : 'conflict'
  const planId = randomUUID()
  const targetManager = detection.destination.kind === 'directory'
    ? await inspectSkillManagerMetadata(destinationPath, (await fingerprintManagedSkill(destinationPath)).businessContentHash)
    : undefined
  const sourceVersion = record.manager?.version
  const targetVersion = targetManager?.metadata?.version
  const comparison = sourceVersion && targetVersion ? compareManagerVersions(sourceVersion, targetVersion) : undefined
  const versionRelation = !targetManager?.metadata
    ? 'unmanaged' as const
    : comparison === undefined ? 'unknown' as const : comparison > 0 ? 'newer' as const : comparison < 0 ? 'older' as const : 'same' as const
  const identityConflict = Boolean(record.manager && targetManager?.metadata && record.manager.skillId !== targetManager.metadata.skill_id)
  const recommendedConflictStrategy = versionRelation === 'newer' && !identityConflict ? 'replace' as const : 'keep' as const
  const backupPath = targetState === 'conflict' && conflictStrategy === 'replace'
    ? join(context.manifestStore.dataDir, 'backups', 'skill-copies', planId, record.name)
    : undefined
  const unsigned: UnsignedSkillCopyPlan = {
    id: planId,
    createdAt: new Date().toISOString(),
    skillId: record.id,
    skillName: record.name,
    sourcePath: record.canonicalPath,
    sourceContentHash: record.contentHash,
    ...(record.businessContentHash ? { sourceBusinessContentHash: record.businessContentHash } : {}),
    ...(sourceVersion ? { sourceVersion } : {}),
    target,
    targetRoot,
    destinationPath,
    targetState,
    ...(detection.destination.contentHash ? { previousTargetHash: detection.destination.contentHash } : {}),
    ...(targetVersion ? { targetVersion } : {}),
    versionRelation,
    identityConflict,
    recommendedConflictStrategy,
    conflictStrategy,
    ...(backupPath ? { backupPath } : {}),
    manifestRevision,
    registryRevision,
    detectionFingerprint: detection.fingerprint,
  }
  return skillCopyPlanSchema.parse({ ...unsigned, hash: stableHash(unsigned) })
}

/** 为单个统一源 Skill 生成一次性复制计划。 */
export async function createSkillCopyPlan(
  context: SkillCopyManagerContext,
  skillId: string,
  target: SkillCopyTarget,
  conflictStrategy: SkillCopyConflictStrategy,
): Promise<SkillCopyPlan> {
  const resolvedSkill = await resolveManagedSkill(context, skillId)
  const targetRoot = await resolveTargetRoot(context, target)
  return createSkillCopyPlanFromResolved(context, resolvedSkill, target, conflictStrategy, targetRoot)
}

/** 返回目标对象的稳定去重键。 */
function targetKey(target: SkillCopyTarget): string {
  return stableHash(target)
}

/** 为多个 Skill 与多个目标组合生成一个只读批量计划。 */
export async function createSkillCopyBatchPlan(context: SkillCopyManagerContext, inputSelections: SkillCopySelection[]): Promise<SkillCopyBatchPlan> {
  const selections = skillCopySelectionSchema.array().min(1).max(MAX_SKILL_COPY_UNITS).parse(inputSelections)
  const selectionKeys = selections.map((selection) => stableHash({ skillId: selection.skillId, target: selection.target }))
  if (new Set(selectionKeys).size !== selectionKeys.length) throw new Error('批量同步中存在重复的 Skill 与目标组合。')

  const targets = new Map<string, SkillCopyTarget>()
  for (const selection of selections) targets.set(targetKey(selection.target), selection.target)
  if (targets.size > MAX_SKILL_COPY_TARGETS) throw new Error(`一次最多同步到 ${MAX_SKILL_COPY_TARGETS} 个目标。`)

  const resolvedSkills = await resolveManagedSkills(context, selections.map((selection) => selection.skillId))
  const targetRoots = new Map<string, string>()
  const seenRoots = new Set<string>()
  for (const [key, target] of targets) {
    const targetRoot = await resolveTargetRoot(context, target)
    if (seenRoots.has(targetRoot)) throw new Error('批量同步中存在指向同一目录的重复目标。')
    seenRoots.add(targetRoot)
    targetRoots.set(key, targetRoot)
  }

  const units: SkillCopyPlan[] = []
  for (const selection of selections) {
    const resolvedSkill = resolvedSkills.get(selection.skillId)!
    const targetRoot = targetRoots.get(targetKey(selection.target))!
    units.push(await createSkillCopyPlanFromResolved(context, resolvedSkill, selection.target, selection.conflictStrategy, targetRoot))
  }
  const unsigned: UnsignedSkillCopyBatchPlan = { id: randomUUID(), createdAt: new Date().toISOString(), units }
  return skillCopyBatchPlanSchema.parse({ ...unsigned, hash: stableHash(unsigned) })
}

/** 在失败时恢复已经被替换的目标目录。 */
async function rollbackCopy(
  destinationPath: string,
  previousPath: string,
  stagingPath: string,
  installed: boolean,
  previousMoved: boolean,
  backup?: SkillBackupMove,
  previousTargetHash?: string,
): Promise<void> {
  await rm(stagingPath, { recursive: true, force: true })
  if (installed) await rm(destinationPath, { recursive: true, force: true })
  if (!previousMoved || await pathExists(destinationPath)) return
  if (await pathExists(previousPath)) {
    await rename(previousPath, destinationPath)
    return
  }
  if (!backup || !previousTargetHash || !await pathExists(backup.backupPath)) throw new Error('同步失败后缺少可用的目标恢复副本。')
  await cp(backup.backupPath, destinationPath, { recursive: true, dereference: false, preserveTimestamps: true, errorOnExist: true })
  if (await hashSkillDirectory(destinationPath) !== previousTargetHash) throw new Error('同步失败后恢复目标目录的内容校验失败。')
}

/** 应用经过确认的单 Skill 复制计划。 */
export async function applySkillCopyPlan(
  context: SkillCopyManagerContext,
  inputPlan: SkillCopyPlan,
  consent: UserConsent,
  options: { recordRegistry?: boolean; saveReceipt?: boolean } = {},
): Promise<SkillCopyReceipt> {
  const plan = skillCopyPlanSchema.parse(inputPlan)
  const { hash: _hash, ...unsigned } = plan
  if (stableHash(unsigned) !== plan.hash || consent.planHash !== plan.hash) throw new Error('Skill 同步计划或用户授权已经失效。')

  const { manifestRevision, record } = await resolveManagedSkill(context, plan.skillId)
  if (manifestRevision !== plan.manifestRevision || record.name !== plan.skillName || record.canonicalPath !== plan.sourcePath || record.contentHash !== plan.sourceContentHash) {
    throw new Error('统一源 Skill 已经变化，请重新生成同步计划。')
  }
  if (record.manager) {
    const registryRevision = (await new SkillManagerRegistryStore(context.manifestStore.dataDir).read())?.revision ?? 0
    if (registryRevision !== plan.registryRevision) throw new Error('Skill registry 已经变化，请重新生成同步计划。')
  }
  const targetRoot = await resolveTargetRoot(context, plan.target)
  if (targetRoot !== plan.targetRoot) throw new Error('目标平台路径已经变化，请重新生成同步计划。')
  await assertTargetScope(context, plan.target, targetRoot, plan.destinationPath, record.canonicalPath)
  const detection = await createDetectionState(plan.targetRoot, plan.destinationPath)
  if (detection.fingerprint !== plan.detectionFingerprint) throw new Error('同步目标已经变化，请重新生成同步计划。')

  const appliedAt = new Date().toISOString()
  if (plan.targetState === 'identical' || (plan.targetState === 'conflict' && plan.conflictStrategy === 'keep')) {
    const receipt: SkillCopyReceipt = {
      id: randomUUID(),
      planHash: plan.hash,
      appliedAt,
      skillId: plan.skillId,
      skillName: plan.skillName,
      target: plan.target,
      destinationPath: plan.destinationPath,
      status: 'skipped',
      contentHash: plan.targetState === 'identical' ? plan.sourceContentHash : plan.previousTargetHash!,
      warnings: [plan.targetState === 'identical' ? '目标已经是最新版本，无需重复同步。' : '目标存在不同内容，已按计划保留现状。'],
    }
    if (options.recordRegistry !== false) await recordCopyTarget(context, plan, record, plan.targetState === 'identical' ? 'copied' : 'conflict')
    if (options.saveReceipt !== false) await saveReceipt(context, receipt)
    return receipt
  }

  const rootWasMissing = detection.root.kind === 'missing'
  const stagingPath = join(plan.targetRoot, `.askx-${plan.id}-${plan.skillName}.staging`)
  const previousPath = join(plan.targetRoot, `.askx-${plan.id}-${plan.skillName}.previous`)
  let installed = false
  let previousMoved = false
  let backup: SkillBackupMove | undefined
  const warnings: string[] = []
  try {
    if (rootWasMissing) await mkdir(plan.targetRoot, { recursive: true, mode: 0o700 })
    if (await pathExists(stagingPath) || await pathExists(previousPath)) throw new Error('同步事务暂存路径已被占用。')
    await cp(plan.sourcePath, stagingPath, { recursive: true, dereference: false, preserveTimestamps: true, errorOnExist: true })
    if (await hashSkillDirectory(stagingPath) !== plan.sourceContentHash) throw new Error('Skill 写入暂存区后校验失败。')

    if (plan.targetState === 'conflict') {
      if (!plan.backupPath || !plan.previousTargetHash) throw new Error('覆盖计划缺少目标备份信息。')
      if (await pathExists(plan.backupPath)) throw new Error('同步备份位置已被占用。')
      await mkdir(dirname(plan.backupPath), { recursive: true, mode: 0o700 })
      await cp(plan.destinationPath, plan.backupPath, { recursive: true, dereference: false, preserveTimestamps: true, errorOnExist: true })
      if (await hashSkillDirectory(plan.backupPath) !== plan.previousTargetHash) throw new Error('目标内容备份校验失败。')
      backup = { originalPath: plan.destinationPath, backupPath: plan.backupPath }
      await rename(plan.destinationPath, previousPath)
      previousMoved = true
    }

    await rename(stagingPath, plan.destinationPath)
    installed = true
    if (await hashSkillDirectory(plan.destinationPath) !== plan.sourceContentHash) throw new Error('Skill 同步完成后的内容校验失败。')
    if (options.recordRegistry !== false) await recordCopyTarget(context, plan, record, 'copied')
    if (previousMoved) {
      await rm(previousPath, { recursive: true, force: true }).catch(() => {
        warnings.push(`目标原目录已完整备份，但临时目录清理失败：${previousPath}`)
      })
    }
    const receipt: SkillCopyReceipt = {
      id: randomUUID(),
      planHash: plan.hash,
      appliedAt,
      skillId: plan.skillId,
      skillName: plan.skillName,
      target: plan.target,
      destinationPath: plan.destinationPath,
      status: 'applied',
      contentHash: plan.sourceContentHash,
      ...(backup ? { backup } : {}),
      warnings,
    }
    if (options.saveReceipt !== false) await saveReceipt(context, receipt)
    return receipt
  } catch (error) {
    await rollbackCopy(plan.destinationPath, previousPath, stagingPath, installed, previousMoved, backup, plan.previousTargetHash)
    if (backup) await rm(backup.backupPath, { recursive: true, force: true })
    if (rootWasMissing) {
      const entries = await readdir(plan.targetRoot).catch(() => [])
      if (!entries.length) await rmdir(plan.targetRoot).catch(() => undefined)
    }
    throw error
  }
}

/** 应用一次经过确认的批量同步计划，并隔离每个组合的失败。 */
export async function applySkillCopyBatchPlan(context: SkillCopyManagerContext, inputPlan: SkillCopyBatchPlan, consent: UserConsent): Promise<SkillCopyBatchReceipt> {
  const plan = skillCopyBatchPlanSchema.parse(inputPlan)
  const { hash: _hash, ...unsigned } = plan
  if (stableHash(unsigned) !== plan.hash || consent.planHash !== plan.hash) throw new Error('批量同步计划或用户授权已经失效。')

  const results: SkillCopyBatchUnitResult[] = []
  const receipts: Array<{ plan: SkillCopyPlan; receipt: SkillCopyReceipt }> = []
  for (const unit of plan.units) {
    try {
      const receipt = await applySkillCopyPlan(
        context,
        unit,
        { planHash: unit.hash, confirmedAt: consent.confirmedAt },
        { recordRegistry: false, saveReceipt: false },
      )
      receipts.push({ plan: unit, receipt })
      results.push({
        skillId: unit.skillId,
        skillName: unit.skillName,
        target: unit.target,
        destinationPath: unit.destinationPath,
        status: receipt.status,
        receiptId: receipt.id,
        warnings: receipt.warnings,
      })
    } catch (error) {
      results.push({
        skillId: unit.skillId,
        skillName: unit.skillName,
        target: unit.target,
        destinationPath: unit.destinationPath,
        status: 'failed',
        warnings: [error instanceof Error ? error.message : String(error)],
      })
    }
  }
  try {
    const managedSkills = await resolveManagedSkills(context, plan.units.map((unit) => unit.skillId))
    const registryStore = new SkillManagerRegistryStore(context.manifestStore.dataDir)
    const registry = await registryStore.read()
    const expectedRevision = plan.units[0]?.registryRevision ?? 0
    if ((registry?.revision ?? 0) !== expectedRevision) throw new Error('Skill registry 已经变化，请重新生成同步计划。')
    const containsManagedSkill = [...managedSkills.values()].some(item => Boolean(item.record.manager))
    if (containsManagedSkill && !registry) throw new Error('AskX Skill Manager registry 不可用，无法登记导出结果。')
    if (registry) {
      const skills = { ...registry.skills }
      for (const unit of plan.units) {
        const record = managedSkills.get(unit.skillId)?.record
        if (!record?.manager) continue
        const previous = skills[record.manager.skillId]
        if (!previous) throw new Error(`Registry 中不存在受管 Skill：${record.name}`)
        const result = results.find((item) => item.skillId === unit.skillId && stableHash(item.target) === stableHash(unit.target))
        const status = result?.status === 'failed'
          ? 'failed' as const
          : unit.targetState === 'conflict' && unit.conflictStrategy === 'keep' ? 'conflict' as const : 'copied' as const
        const key = unit.target.kind === 'platform' ? `platform:${unit.target.platform}` : `folder:${unit.targetRoot}`
        const verified = status === 'copied'
        skills[record.manager.skillId] = {
          ...previous,
          targets: {
            ...previous.targets,
            [key]: {
              kind: unit.target.kind,
              path: unit.destinationPath,
              status,
              ...(verified ? {
                version: record.manager.version,
                content_sha256: record.manager.contentSha256,
                synced_at: new Date().toISOString(),
              } : {}),
            },
          },
        }
      }
      await registryStore.write({ ...registry, skills }, registry.revision)
    }
    await Promise.all(receipts.map(({ receipt }) => saveReceipt(context, receipt)))
  } catch (error) {
    const rollbackErrors: unknown[] = []
    for (const { plan: unit, receipt } of [...receipts].reverse()) {
      if (receipt.status !== 'applied') continue
      try {
        await rm(receipt.destinationPath, { recursive: true, force: true })
        if (receipt.backup) {
          await cp(receipt.backup.backupPath, receipt.destinationPath, { recursive: true, dereference: false, preserveTimestamps: true })
          if (unit.previousTargetHash && await hashSkillDirectory(receipt.destinationPath) !== unit.previousTargetHash) {
            throw new Error(`目标 ${receipt.destinationPath} 回滚后校验失败。`)
          }
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], '批量复制统计写入失败且目标回滚不完整。')
    throw error
  }
  return {
    id: randomUUID(),
    planHash: plan.hash,
    appliedAt: new Date().toISOString(),
    results,
  }
}
