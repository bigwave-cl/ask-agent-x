import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { stableHash, type RollbackResult, type UserConsent } from '@askx/core'
import { managedDirectoryLinkType } from '@askx/platform-adapters'
import { installBuiltinSkillManager } from './builtin-skill-manager.js'
import type { SkillsManifestStore } from './manifest-store.js'
import { detectSkillPlatforms, hashSkillDirectory, scanSkills } from './scanner.js'
import {
  ASKX_SKILL_MANAGER_NAME,
  createSkillManagerMetadata,
  ensureAskxManagedDeclaration,
  fingerprintManagedSkill,
  inspectSkillManagerMetadata,
  updateSkillManagerMetadata,
  writeSkillManagerMetadata,
} from './skill-manager-metadata.js'
import { askxSkillRegistrySchema, SkillManagerRegistryStore } from './skill-manager-registry.js'
import { assertSkillsBatchPlan, assertSkillsPlanScope } from './skills-planner.js'
import type {
  ManagedPlatformBinding,
  ManagedCustomLinkBinding,
  ManagedLocalSkillRecord,
  ManagedSkillRecord,
  CustomLinkBindingResult,
  PlatformBindingResult,
  SkillBackupMove,
  SkillBindPlatformOperation,
  SkillBindCustomRootOperation,
  SkillDecision,
  SkillLocation,
  SkillPlanUnit,
  SkillTransactionResult,
  SkillsBatchPlan,
  SkillsBatchReceipt,
  SkillsRollbackPlan,
  SkillsManifest,
  SkillsScanReport,
} from './skill-types.js'
import { verifyCanonicalSkill, verifyManagedLink } from './skills-verifier.js'

/** 批量执行输入。 */
export interface ApplySkillsPlanInput {
  /** 用户确认的完整计划。 */
  plan: SkillsBatchPlan
  /** 当前设置 revision。 */
  settingsRevision: number
  /** 用户目录。 */
  homeDir: string
  /** AskX 数据目录。 */
  dataDir: string
  /** manifest 存储。 */
  manifestStore: SkillsManifestStore
}

/** 根目录切换后的内部恢复信息。 */
interface AppliedBatch {
  /** 本次创建的平台根目录软链。 */
  createdLinks: string[]
  /** 被整体移动的平台根目录。 */
  platformBackups: SkillBackupMove[]
  /** 本批次恢复的既有平台绑定。 */
  resumedBindings: ManagedPlatformBinding[]
  /** 本批次停用的既有平台绑定。 */
  suspendedBindings: ManagedPlatformBinding[]
  /** 本批次恢复的既有自定义绑定。 */
  resumedCustomBindings: ManagedCustomLinkBinding[]
  /** 本批次停用的既有自定义绑定。 */
  suspendedCustomBindings: ManagedCustomLinkBinding[]
  /** 原 AskX 统一目录备份。 */
  canonicalBackup?: SkillBackupMove
  /** 本次是否从空状态创建统一目录。 */
  createdCanonical: boolean
  /** 本次是否从空状态创建本地专属目录。 */
  createdLocal: boolean
  /** 本地专属目录是否已经切换为 staging。 */
  localApplied: boolean
  /** 原本地专属目录备份。 */
  localBackup?: SkillBackupMove
  /** 应用后的统一目录记录。 */
  records: ManagedSkillRecord[]
  /** 应用后的本地专属记录。 */
  localRecords: ManagedLocalSkillRecord[]
  /** 平台根目录执行结果。 */
  platformResults: PlatformBindingResult[]
  /** 自定义目录执行结果。 */
  customLinkResults: CustomLinkBindingResult[]
}

/** 持久化批次回执。 */
interface StoredBatchReceipt {
  /** 对外回执。 */
  receipt: SkillsBatchReceipt
  /** 操作前 manifest。 */
  manifestBefore: SkillsManifest | null
  /** 根目录切换的内部恢复信息。 */
  appliedBatch: AppliedBatch
}

/** 创建一份只读的 Skills 批次回滚计划。 */
export async function createSkillsRollbackPlan(
  dataDir: string,
  manifestStore: SkillsManifestStore,
  receiptId: string,
): Promise<SkillsRollbackPlan> {
  const receipt = (await listSkillsReceipts(dataDir)).find(entry => entry.id === receiptId)
  if (!receipt) throw new Error(`找不到可回滚的 Skills 回执：${receiptId}`)
  const manifestRevision = (await manifestStore.read())?.revision ?? 0
  if (manifestRevision !== receipt.manifestRevision) throw new Error('Skills manifest 已在该事务后发生变化，不能直接回滚。')
  const unsigned = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    receiptId,
    receiptPlanHash: receipt.planHash,
    manifestRevision,
  }
  return { ...unsigned, hash: stableHash(unsigned) }
}

/** 应用经过确认且仍与最新状态一致的 Skills 批次回滚计划。 */
export async function applySkillsRollbackPlan(
  dataDir: string,
  manifestStore: SkillsManifestStore,
  plan: SkillsRollbackPlan,
  consent: UserConsent,
): Promise<RollbackResult> {
  const { hash, ...unsigned } = plan
  if (stableHash(unsigned) !== hash) throw new Error('Skills 回滚计划内容已经变化。')
  if (consent.planHash !== hash) throw new Error('用户授权与 Skills 回滚计划不匹配。')
  const latest = await createSkillsRollbackPlan(dataDir, manifestStore, plan.receiptId)
  if (latest.manifestRevision !== plan.manifestRevision || latest.receiptPlanHash !== plan.receiptPlanHash) {
    throw new Error('Skills 回滚目标已经变化，请重新生成计划。')
  }
  return rollbackSkillsReceipt(dataDir, manifestStore, plan.receiptId)
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

/** 原子写入内部 JSON。 */
async function writeInternalJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporaryPath, path)
}

/** 根据 ID 获取当前扫描位置。 */
function getLocation(report: SkillsScanReport, id: string): SkillLocation {
  const location = report.locations.find((entry) => entry.id === id)
  if (!location) throw new Error(`找不到可操作的 Skill 位置：${id}`)
  return location
}

/** 获取决策选择的统一源位置。 */
function getSource(report: SkillsScanReport, decision: SkillDecision): SkillLocation | undefined {
  if (decision.kind === 'keep' || decision.kind === 'archive') return undefined
  return getLocation(report, decision.sourceLocationId)
}

/** 获取决策最终写入统一目录的 Skill 名称。 */
function getCanonicalName(unit: SkillPlanUnit, source?: SkillLocation): string {
  return unit.decision.kind === 'rename-and-adopt' ? unit.decision.newName : source?.name ?? unit.skillName
}

/** 将一个路径安全移动到事务备份。 */
async function moveToBackup(path: string, backupPath: string): Promise<SkillBackupMove> {
  await mkdir(dirname(backupPath), { recursive: true, mode: 0o700 })
  await rename(path, backupPath)
  return { originalPath: path, backupPath }
}

/**
 * 将一个 Skill 来源复制进临时统一目录。
 * @param source 只读扫描来源。
 * @param target 临时统一目录中的目标路径。
 * @param allowReplace 是否允许覆盖临时目录中的不同版本。
 */
async function copySkillIntoStaging(source: SkillLocation, target: string, allowReplace: boolean): Promise<void> {
  if (!source.contentHash || !source.metadata.valid || source.broken) throw new Error(`Skill ${source.name} 无法作为统一来源。`)
  if (await pathExists(target)) {
    if (await hashSkillDirectory(target) === source.contentHash) return
    if (!allowReplace) throw new Error(`统一目录中已经存在不同内容的 Skill：${source.name}`)
    await rm(target, { recursive: true })
  }
  const temporaryPath = `${target}.${randomUUID()}.staging`
  await cp(source.path, temporaryPath, { recursive: true, dereference: true, preserveTimestamps: true })
  await verifyCanonicalSkill(temporaryPath, source.contentHash)
  await rename(temporaryPath, target)
}

/** 在 staging 中执行用户明确授权的版本管理改造。 */
async function applyManagementChoice(target: string, unit: SkillPlanUnit): Promise<void> {
  if (unit.management === 'preserve') return
  if (unit.management === 'initialize') {
    await ensureAskxManagedDeclaration(target, false)
    const fingerprint = await fingerprintManagedSkill(target)
    await writeSkillManagerMetadata(target, createSkillManagerMetadata(fingerprint.businessContentHash, false))
    return
  }
  const before = await inspectSkillManagerMetadata(target)
  if (!before.metadata) throw new Error(`Skill ${unit.skillName} 缺少可更新的 manager 元数据。`)
  await ensureAskxManagedDeclaration(target, before.metadata.local_only)
  const fingerprint = await fingerprintManagedSkill(target)
  await writeSkillManagerMetadata(target, updateSkillManagerMetadata(before.metadata, fingerprint.businessContentHash, {
    migrateOwner: unit.management === 'migrate-bobo',
    bumpVersion: unit.management === 'refresh',
  }))
}

/** 将 manager 元数据转换为 manifest 摘要。 */
function summarizeManager(metadata: NonNullable<Awaited<ReturnType<typeof inspectSkillManagerMetadata>>['metadata']>) {
  return {
    skillId: metadata.skill_id,
    version: metadata.version,
    localOnly: metadata.local_only,
    managedBy: metadata.managed_by,
    contentSha256: metadata.content_sha256,
  }
}

/** 在 staging 内原子更新 registry 索引。 */
async function updateStagingRegistry(stagingRoot: string, records: ManagedSkillRecord[], expectedRevision: number): Promise<void> {
  const registryPath = join(stagingRoot, ASKX_SKILL_MANAGER_NAME, 'registry', 'skills.json')
  const registry = askxSkillRegistrySchema.parse(JSON.parse(await readFile(registryPath, 'utf8')))
  if (registry.revision !== expectedRevision) throw new Error('Skill registry 已经变化，请重新扫描。')
  const skills = { ...registry.skills }
  for (const record of records) {
    if (!record.manager || record.kind === 'system' || record.manager.contentSha256 !== record.businessContentHash) continue
    const previous = skills[record.manager.skillId]
    const aliases = previous && previous.current_name !== record.name
      ? [...new Set([...previous.aliases, previous.current_name])]
      : previous?.aliases ?? []
    skills[record.manager.skillId] = {
      current_name: record.name,
      aliases,
      version: record.manager.version,
      content_sha256: record.manager.contentSha256,
      usage_count: previous?.usage_count ?? 0,
      ...(previous?.last_used_at ? { last_used_at: previous.last_used_at } : {}),
      targets: {
        ...(previous?.targets ?? {}),
        canonical: {
          kind: 'canonical',
          path: record.canonicalPath,
          status: 'copied',
          version: record.manager.version,
          content_sha256: record.manager.contentSha256,
          synced_at: new Date().toISOString(),
        },
      },
    }
  }
  await writeInternalJson(registryPath, {
    ...registry,
    revision: registry.revision + 1,
    updated_at: new Date().toISOString(),
    skills,
  })
}

/**
 * 在不修改平台目录的前提下构建最终统一目录。
 * @param plan 用户确认的完整计划。
 * @param report 执行前重新扫描结果。
 * @param dataDir AskX 数据目录。
 * @param manifestBefore 操作前 manifest。
 * @returns 临时目录路径、Skill 结果和最终记录。
 */
async function buildCanonicalStaging(
  plan: SkillsBatchPlan,
  report: SkillsScanReport,
  dataDir: string,
  manifestBefore: SkillsManifest | null,
): Promise<{
  stagingRoot: string
  localStagingRoot: string
  results: SkillTransactionResult[]
  records: ManagedSkillRecord[]
  localRecords: ManagedLocalSkillRecord[]
}> {
  const canonicalRoot = join(dataDir, 'skills')
  const transactionRoot = join(dataDir, 'transactions', plan.id)
  const stagingRoot = join(transactionRoot, 'canonical.staging')
  const localRoot = join(dataDir, 'local-skills')
  const localStagingRoot = join(transactionRoot, 'local.staging')
  await rm(stagingRoot, { recursive: true, force: true })
  await rm(localStagingRoot, { recursive: true, force: true })
  await mkdir(transactionRoot, { recursive: true, mode: 0o700 })
  if (await pathExists(canonicalRoot)) {
    const stat = await lstat(canonicalRoot)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`AskX 统一源不是可接管的真实目录：${canonicalRoot}`)
    await cp(canonicalRoot, stagingRoot, { recursive: true, dereference: true, preserveTimestamps: true })
  } else {
    await mkdir(stagingRoot, { recursive: true, mode: 0o700 })
  }
  if (await pathExists(localRoot)) {
    const stat = await lstat(localRoot)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`AskX 本地专属目录不是可接管的真实目录：${localRoot}`)
    await cp(localRoot, localStagingRoot, { recursive: true, dereference: true, preserveTimestamps: true })
  } else {
    await mkdir(localStagingRoot, { recursive: true, mode: 0o700 })
  }

  const results: SkillTransactionResult[] = []
  for (const unit of plan.units) {
    const result: SkillTransactionResult = {
      receiptId: randomUUID(),
      skillName: unit.skillName,
      status: 'applied',
      backups: [],
      warnings: [...unit.warnings],
    }
    try {
      if (unit.decision.kind === 'keep' || unit.decision.kind === 'archive') {
        result.status = 'skipped'
        results.push(result)
        continue
      }
      const source = getSource(report, unit.decision)
      if (!source) throw new Error(`Skill ${unit.skillName} 缺少统一来源。`)
      const canonicalName = getCanonicalName(unit, source)
      const localOnly = source.managerMetadata?.localOnly === true
      result.canonicalPath = join(localOnly ? localRoot : canonicalRoot, canonicalName)
      const target = join(localOnly ? localStagingRoot : stagingRoot, canonicalName)
      await copySkillIntoStaging(source, target, unit.decision.kind === 'replace')
      await applyManagementChoice(target, unit)
    } catch (error) {
      result.status = 'failed'
      result.warnings.push((error as Error).message)
    }
    results.push(result)
  }

  if (results.some((result) => result.status === 'failed')) {
    await rm(stagingRoot, { recursive: true, force: true })
    await rm(localStagingRoot, { recursive: true, force: true })
    throw new Error(results.flatMap((result) => result.warnings).join('\n'))
  }

  const systemPath = join(stagingRoot, ASKX_SKILL_MANAGER_NAME)
  if (!await pathExists(systemPath)) {
    if (plan.systemSkillAction !== 'install') throw new Error('默认 AskX Skill Manager 缺失，请先确认修复。')
    await installBuiltinSkillManager(stagingRoot)
  }

  const previousRecords = new Map((manifestBefore?.skills ?? []).map((record) => [record.name, record]))
  const previousLocalRecords = new Map((manifestBefore?.localSkills ?? []).map((record) => [record.name, record]))
  const records: ManagedSkillRecord[] = []
  const localRecords: ManagedLocalSkillRecord[] = []
  /** 将 staging 根目录转换为 manifest 记录。 */
  async function collectRecords(root: string, finalRoot: string, local: boolean): Promise<void> {
    const entries = await readdir(root, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith('.') || !entry.isDirectory()) continue
    const path = join(root, entry.name)
    const fingerprint = await fingerprintManagedSkill(path)
    const manager = await inspectSkillManagerMetadata(path, fingerprint.businessContentHash)
    const previousBySkillId = manager.metadata
      ? [...(local ? previousLocalRecords : previousRecords).values()].find((record) => record.manager?.skillId === manager.metadata?.skill_id)
      : undefined
    const previous = (local ? previousLocalRecords : previousRecords).get(entry.name)
    const baseRecord = {
      id: previousBySkillId?.id ?? previous?.id ?? randomUUID(),
      name: entry.name,
      kind: entry.name === ASKX_SKILL_MANAGER_NAME ? 'system' : 'user',
      canonicalPath: join(finalRoot, entry.name),
      contentHash: fingerprint.contentHash,
      businessContentHash: fingerprint.businessContentHash,
      ...(manager.metadata ? { manager: summarizeManager(manager.metadata) } : {}),
      updatedAt: new Date().toISOString(),
    } satisfies ManagedSkillRecord
    if (local) localRecords.push({ ...baseRecord, kind: 'user', localPath: baseRecord.canonicalPath })
    else records.push(baseRecord)
    }
  }
  await collectRecords(stagingRoot, canonicalRoot, false)
  await collectRecords(localStagingRoot, localRoot, true)
  records.sort((left, right) => Number(left.kind === 'system') - Number(right.kind === 'system') || left.name.localeCompare(right.name))
  await updateStagingRegistry(stagingRoot, [...records, ...localRecords], plan.registryRevision)
  return { stagingRoot, localStagingRoot, results, records, localRecords }
}

/**
 * 将平台 Skills 根目录整体切换为统一目录软链。
 * @param plan 已确认计划。
 * @param stagingRoot 已完成校验的临时统一目录。
 * @param records 最终 Skill 记录。
 * @param dataDir AskX 数据目录。
 * @returns 可用于回滚和写入 Manifest 的批次状态。
 */
async function switchPlatformRoots(
  plan: SkillsBatchPlan,
  stagingRoot: string,
  localStagingRoot: string,
  records: ManagedSkillRecord[],
  localRecords: ManagedLocalSkillRecord[],
  dataDir: string,
  previousBindings: ManagedPlatformBinding[],
  previousCustomBindings: ManagedCustomLinkBinding[],
): Promise<AppliedBatch> {
  const canonicalRoot = join(dataDir, 'skills')
  const localRoot = join(dataDir, 'local-skills')
  const applied: AppliedBatch = {
    createdLinks: [],
    platformBackups: [],
    resumedBindings: [],
    suspendedBindings: [],
    resumedCustomBindings: [],
    suspendedCustomBindings: [],
    createdCanonical: !await pathExists(canonicalRoot),
    createdLocal: !await pathExists(localRoot),
    localApplied: false,
    records,
    localRecords,
    platformResults: [],
    customLinkResults: [],
  }
  try {
    if (await pathExists(canonicalRoot)) {
      applied.canonicalBackup = await moveToBackup(canonicalRoot, join(dataDir, 'backups', 'skills', plan.id, 'askx-root.bak'))
    }
    await rename(stagingRoot, canonicalRoot)
    if (await pathExists(localRoot)) {
      applied.localBackup = await moveToBackup(localRoot, join(dataDir, 'backups', 'skills', plan.id, 'askx-local-root.bak'))
    }
    await rename(localStagingRoot, localRoot)
    applied.localApplied = true

    for (const operation of plan.platformOperations) {
      const previousBinding = previousBindings.find((binding) => binding.platform === operation.platform)
      const { result, createdLink, backup, resumedBinding } = await applyPlatformRoot(operation, dataDir, plan.id, previousBinding)
      applied.platformResults.push(result)
      if (createdLink) applied.createdLinks.push(createdLink)
      if (backup) applied.platformBackups.push(backup)
      if (resumedBinding) applied.resumedBindings.push(resumedBinding)
      if (operation.action === 'suspend' && previousBinding) applied.suspendedBindings.push(previousBinding)
    }
    for (const operation of plan.customLinkOperations) {
      const previousBinding = previousCustomBindings.find((binding) => binding.id === operation.id)
      const { result, createdLink, backup } = await applyCustomLinkRoot(operation, dataDir, plan.id, previousBinding)
      applied.customLinkResults.push(result)
      if (createdLink) applied.createdLinks.push(createdLink)
      if (backup) applied.platformBackups.push(backup)
      if (operation.action === 'resume' && previousBinding) applied.resumedCustomBindings.push(previousBinding)
      if (operation.action === 'suspend' && previousBinding) applied.suspendedCustomBindings.push(previousBinding)
    }
    for (const record of records) await verifyCanonicalSkill(record.canonicalPath, record.contentHash)
    for (const record of localRecords) await verifyCanonicalSkill(record.localPath, record.contentHash)
    return applied
  } catch (error) {
    await rollbackAppliedBatch(applied, canonicalRoot)
    throw error
  }
}

/** 单个平台根目录成功切换后需要纳入批次恢复的信息。 */
interface AppliedPlatformRoot {
  /** 平台接入结果。 */
  result: PlatformBindingResult
  /** 本次新建的根目录软链。 */
  createdLink?: string
  /** 接入前的平台根目录备份。 */
  backup?: SkillBackupMove
  /** 本次从停用状态恢复的原绑定。 */
  resumedBinding?: ManagedPlatformBinding
}

/**
 * 恢复一个失败平台在当前子事务中产生的修改。
 * @param operation 平台根目录绑定操作。
 * @param createdLink 本次是否已经创建软链。
 * @param backup 本次是否已经移动原平台目录。
 */
async function rollbackPlatformRoot(
  operation: SkillBindPlatformOperation | SkillBindCustomRootOperation,
  createdLink: boolean,
  backup?: SkillBackupMove,
): Promise<void> {
  if (createdLink && await pathExists(operation.path)) {
    const stat = await lstat(operation.path)
    if (!stat.isSymbolicLink()) throw new Error(`平台回滚被阻止，目标已变为真实目录：${operation.path}`)
    try {
      await verifyManagedLink(operation.path, operation.target)
    } catch {
      throw new Error(`平台回滚被阻止，软链目标已经变化：${operation.path}`)
    }
    await rm(operation.path)
  }
  if (!backup || !await pathExists(backup.backupPath)) return
  if (await pathExists(backup.originalPath)) throw new Error(`平台回滚目标已被占用：${backup.originalPath}`)
  await rename(backup.backupPath, backup.originalPath)
}

/** 单个自定义目录成功切换后需要纳入批次恢复的信息。 */
interface AppliedCustomLinkRoot {
  /** 自定义目录接入结果。 */
  result: CustomLinkBindingResult
  /** 本次新建的根目录软链。 */
  createdLink?: string
  /** 接入前的目录备份。 */
  backup?: SkillBackupMove
}

/**
 * 独立接入一个自定义使用目录；失败只恢复当前目录并返回失败结果。
 * @param operation 自定义目录绑定操作。
 * @param dataDir AskX 数据目录。
 * @param transactionId 批次事务标识。
 * @returns 当前目录结果及成功操作的恢复信息。
 */
async function applyCustomLinkRoot(
  operation: SkillBindCustomRootOperation,
  dataDir: string,
  transactionId: string,
  previousBinding?: ManagedCustomLinkBinding,
): Promise<AppliedCustomLinkRoot> {
  const result: CustomLinkBindingResult = {
    id: operation.id,
    name: operation.name,
    path: operation.path,
    target: operation.target,
    status: 'applied',
    warnings: [],
  }
  let backup: SkillBackupMove | undefined
  let createdLink = false
  try {
    if (operation.action === 'skip') {
      if (!previousBinding || previousBinding.suspendedAt) throw new Error(`自定义目录 ${operation.path} 的已绑定状态已经变化。`)
      await verifyManagedLink(operation.path, operation.target)
      result.status = 'skipped'
      return { result }
    }
    if (operation.action === 'suspend') {
      if (!previousBinding || previousBinding.suspendedAt) throw new Error(`自定义目录 ${operation.path} 的已绑定状态已经变化。`)
      await verifyManagedLink(operation.path, operation.target)
      const suspendedPath = previousBinding.suspendedPath ?? join(dirname(operation.path), `.askx-${operation.id}-skills-link`)
      if (await pathExists(suspendedPath)) throw new Error(`自定义软链隐藏路径已被占用：${suspendedPath}`)
      await rename(operation.path, suspendedPath)
      if (previousBinding.originalRootBackup && await pathExists(previousBinding.originalRootBackup.backupPath)) {
        await rename(previousBinding.originalRootBackup.backupPath, operation.path)
      }
      return { result }
    }
    if (operation.action === 'resume') {
      if (!previousBinding?.suspendedAt || !previousBinding.suspendedPath) throw new Error(`自定义目录 ${operation.path} 的停用状态已经变化。`)
      if (previousBinding.originalRootBackup && await pathExists(operation.path)) {
        await rename(operation.path, previousBinding.originalRootBackup.backupPath)
      } else if (await pathExists(operation.path)) throw new Error(`自定义目录在停用期间已被占用：${operation.path}`)
      await rename(previousBinding.suspendedPath, operation.path)
      await verifyManagedLink(operation.path, operation.target)
      return { result }
    }
    if (await pathExists(operation.path)) {
      const stat = await lstat(operation.path)
      if (stat.isSymbolicLink()) {
        try {
          await verifyManagedLink(operation.path, operation.target)
          return { result }
        } catch {
          // 目标不一致时按普通目录进入备份和重新接入流程。
        }
      }
      backup = await moveToBackup(
        operation.path,
        join(dataDir, 'backups', 'skills', transactionId, 'custom', operation.id, 'skills-root.bak'),
      )
      result.backup = backup
    }
    await mkdir(dirname(operation.path), { recursive: true, mode: 0o700 })
    await symlink(operation.target, operation.path, managedDirectoryLinkType())
    createdLink = true
    await verifyManagedLink(operation.path, operation.target)
    return { result, createdLink: operation.path, ...(backup ? { backup } : {}) }
  } catch (error) {
    result.status = 'failed'
    result.warnings.push((error as Error).message)
    try {
      await rollbackPlatformRoot(operation, createdLink, backup)
    } catch (rollbackError) {
      throw new Error(`自定义目录 ${operation.path} 接入失败且无法安全恢复：${(rollbackError as Error).message}`, { cause: error })
    }
    return { result }
  }
}

/**
 * 独立接入一个平台根目录；失败只恢复当前平台并返回失败结果。
 * @param operation 平台根目录绑定操作。
 * @param dataDir AskX 数据目录。
 * @param transactionId 批次事务标识。
 * @returns 当前平台结果及成功操作的恢复信息。
 */
async function applyPlatformRoot(
  operation: SkillBindPlatformOperation,
  dataDir: string,
  transactionId: string,
  previousBinding?: ManagedPlatformBinding,
): Promise<AppliedPlatformRoot> {
  const result: PlatformBindingResult = {
    platform: operation.platform,
    path: operation.path,
    target: operation.target,
    status: 'applied',
    warnings: [],
  }
  let backup: SkillBackupMove | undefined
  let createdLink = false
  try {
    if (operation.action === 'suspend') {
      if (!previousBinding || previousBinding.suspendedAt) throw new Error(`平台 ${operation.platform} 的已绑定状态已经变化。`)
      await verifyManagedLink(operation.path, operation.target)
      const suspendedPath = previousBinding.suspendedPath ?? join(dirname(operation.path), `.askx-${operation.platform}-skills-link`)
      if (await pathExists(suspendedPath)) throw new Error(`平台软链隐藏路径已被占用：${suspendedPath}`)
      await rename(operation.path, suspendedPath)
      if (previousBinding.originalRootBackup && await pathExists(previousBinding.originalRootBackup.backupPath)) {
        await rename(previousBinding.originalRootBackup.backupPath, operation.path)
      }
      return { result }
    }
    if (operation.action === 'skip') {
      if (!previousBinding || previousBinding.suspendedAt) throw new Error(`平台 ${operation.platform} 的已绑定状态已经变化。`)
      await verifyManagedLink(operation.path, operation.target)
      result.status = 'skipped'
      return { result }
    }
    if (operation.action === 'resume') {
      if (!previousBinding?.suspendedAt || !previousBinding.suspendedPath) throw new Error(`平台 ${operation.platform} 的停用状态已经变化。`)
      await verifyManagedLink(previousBinding.suspendedPath, operation.target)
      if (previousBinding.originalRootBackup) {
        if (!await pathExists(operation.path)) throw new Error(`平台原目录不存在：${operation.path}`)
        if (await pathExists(previousBinding.originalRootBackup.backupPath)) throw new Error(`平台原目录备份位置已被占用：${previousBinding.originalRootBackup.backupPath}`)
        await mkdir(dirname(previousBinding.originalRootBackup.backupPath), { recursive: true, mode: 0o700 })
        await rename(operation.path, previousBinding.originalRootBackup.backupPath)
      } else if (await pathExists(operation.path)) {
        throw new Error(`平台 Skills 路径在停用期间已被占用：${operation.path}`)
      }
      try {
        await rename(previousBinding.suspendedPath, operation.path)
        await verifyManagedLink(operation.path, operation.target)
      } catch (error) {
        if (await pathExists(operation.path)) {
          try {
            await verifyManagedLink(operation.path, operation.target)
            if (!await pathExists(previousBinding.suspendedPath)) await rename(operation.path, previousBinding.suspendedPath)
          } catch {
            // 非受管占用项保留原位，交由错误回执提示人工处理。
          }
        }
        if (previousBinding.originalRootBackup && await pathExists(previousBinding.originalRootBackup.backupPath) && !await pathExists(operation.path)) {
          await rename(previousBinding.originalRootBackup.backupPath, operation.path)
        }
        throw error
      }
      return { result, resumedBinding: previousBinding }
    }
    if (await pathExists(operation.path)) {
      const stat = await lstat(operation.path)
      if (stat.isSymbolicLink()) {
        try {
          await verifyManagedLink(operation.path, operation.target)
          return { result }
        } catch {
          // 目标不一致时按普通平台目录进入备份和重新接入流程。
        }
      }
      backup = await moveToBackup(
        operation.path,
        join(dataDir, 'backups', 'skills', transactionId, operation.platform, 'skills-root.bak'),
      )
      result.backup = backup
    }
    await mkdir(dirname(operation.path), { recursive: true, mode: 0o700 })
    await symlink(operation.target, operation.path, managedDirectoryLinkType())
    createdLink = true
    await verifyManagedLink(operation.path, operation.target)
    return { result, createdLink: operation.path, ...(backup ? { backup } : {}) }
  } catch (error) {
    result.status = 'failed'
    result.warnings.push((error as Error).message)
    try {
      await rollbackPlatformRoot(operation, createdLink, backup)
    } catch (rollbackError) {
      throw new Error(`平台 ${operation.platform} 接入失败且无法安全恢复：${(rollbackError as Error).message}`, { cause: error })
    }
    return { result }
  }
}

/**
 * 回滚平台根目录和 AskX 统一目录切换。
 * @param applied 已发生的批次副作用。
 * @param canonicalRoot AskX 统一目录路径。
 */
async function rollbackAppliedBatch(applied: AppliedBatch, canonicalRoot: string): Promise<void> {
  for (const binding of [...applied.suspendedCustomBindings].reverse()) {
    const suspendedPath = binding.suspendedPath ?? join(dirname(binding.path), `.askx-${binding.id}-skills-link`)
    if (binding.originalRootBackup && await pathExists(binding.path)) await rename(binding.path, binding.originalRootBackup.backupPath)
    await rename(suspendedPath, binding.path)
  }
  for (const binding of [...applied.suspendedBindings].reverse()) {
    const suspendedPath = binding.suspendedPath ?? join(dirname(binding.path), `.askx-${binding.platform}-skills-link`)
    if (binding.originalRootBackup && await pathExists(binding.path)) await rename(binding.path, binding.originalRootBackup.backupPath)
    await rename(suspendedPath, binding.path)
  }
  for (const binding of [...(applied.resumedBindings ?? [])].reverse()) {
    if (!binding.suspendedPath) throw new Error(`平台恢复回滚缺少隐藏软链路径：${binding.platform}`)
    await verifyManagedLink(binding.path, binding.target)
    if (await pathExists(binding.suspendedPath)) throw new Error(`平台恢复回滚目标已被占用：${binding.suspendedPath}`)
    await rename(binding.path, binding.suspendedPath)
    if (binding.originalRootBackup && await pathExists(binding.originalRootBackup.backupPath)) {
      if (await pathExists(binding.originalRootBackup.originalPath)) throw new Error(`平台原目录恢复目标已被占用：${binding.originalRootBackup.originalPath}`)
      await rename(binding.originalRootBackup.backupPath, binding.originalRootBackup.originalPath)
    }
  }
  for (const binding of [...applied.resumedCustomBindings].reverse()) {
    if (!binding.suspendedPath) throw new Error(`自定义目录恢复回滚缺少隐藏软链路径：${binding.path}`)
    await rename(binding.path, binding.suspendedPath)
    if (binding.originalRootBackup && await pathExists(binding.originalRootBackup.backupPath)) await rename(binding.originalRootBackup.backupPath, binding.path)
  }
  for (const linkPath of [...applied.createdLinks].reverse()) {
    if (!await pathExists(linkPath)) continue
    const stat = await lstat(linkPath)
    if (!stat.isSymbolicLink()) throw new Error(`回滚被阻止，平台根链接已变为真实目录：${linkPath}`)
    try {
      await verifyManagedLink(linkPath, canonicalRoot)
    } catch {
      throw new Error(`回滚被阻止，平台根链接目标已经变化：${linkPath}`)
    }
    await rm(linkPath)
  }
  for (const backup of [...applied.platformBackups].reverse()) {
    if (await pathExists(backup.originalPath)) throw new Error(`回滚目标已被占用：${backup.originalPath}`)
    if (await pathExists(backup.backupPath)) await rename(backup.backupPath, backup.originalPath)
  }
  if (await pathExists(canonicalRoot)) await rm(canonicalRoot, { recursive: true })
  if (applied.canonicalBackup && await pathExists(applied.canonicalBackup.backupPath)) {
    await rename(applied.canonicalBackup.backupPath, applied.canonicalBackup.originalPath)
  }
  const localRoot = join(dirname(canonicalRoot), 'local-skills')
  if (applied.localApplied && await pathExists(localRoot)) await rm(localRoot, { recursive: true })
  if (applied.localBackup && await pathExists(applied.localBackup.backupPath)) {
    await rename(applied.localBackup.backupPath, applied.localBackup.originalPath)
  }
}

/**
 * 验证回执对应的根目录状态仍可安全恢复。
 * @param applied 已完成的批次状态。
 * @param canonicalRoot AskX 统一目录路径。
 */
async function assertRollbackSafe(applied: AppliedBatch, canonicalRoot: string): Promise<void> {
  for (const linkPath of applied.createdLinks) await verifyManagedLink(linkPath, canonicalRoot)
  for (const backup of applied.platformBackups) {
    if (!await pathExists(backup.backupPath)) throw new Error(`恢复被阻止，平台目录备份已经丢失：${backup.backupPath}`)
  }
  if (applied.canonicalBackup && !await pathExists(applied.canonicalBackup.backupPath)) {
    throw new Error(`恢复被阻止，统一目录备份已经丢失：${applied.canonicalBackup.backupPath}`)
  }
  if (applied.localBackup && !await pathExists(applied.localBackup.backupPath)) {
    throw new Error(`恢复被阻止，本地专属目录备份已经丢失：${applied.localBackup.backupPath}`)
  }
  for (const record of applied.records) {
    try {
      await verifyCanonicalSkill(record.canonicalPath, record.contentHash)
    } catch {
      throw new Error(`统一源内容已经变化：${record.canonicalPath}`)
    }
  }
  for (const record of applied.localApplied ? applied.localRecords : []) {
    try {
      await verifyCanonicalSkill(record.localPath, record.contentHash)
    } catch {
      throw new Error(`本地专属 Skill 内容已经变化：${record.localPath}`)
    }
  }
}

/**
 * 将平台执行结果转换为 Manifest 根目录绑定。
 * @param results 平台根目录执行结果。
 * @param previousBindings 其他批次已经登记的平台根目录绑定。
 * @returns 已成功接入的平台绑定。
 */
function createPlatformBindings(
  results: PlatformBindingResult[],
  previousBindings: ManagedPlatformBinding[],
  operations: SkillBindPlatformOperation[],
): ManagedPlatformBinding[] {
  const updatedAt = new Date().toISOString()
  const bindings = new Map(previousBindings.map((binding) => [binding.platform, binding]))
  for (const result of results) {
    const operation = operations.find((entry) => entry.platform === result.platform)
    if (operation?.action === 'suspend' && result.status === 'applied') {
      const previous = bindings.get(result.platform)
      if (previous) bindings.set(result.platform, { ...previous, updatedAt, suspendedAt: updatedAt, suspendedPath: previous.suspendedPath ?? join(dirname(previous.path), `.askx-${previous.platform}-skills-link`) })
      continue
    }
    if (result.status === 'applied') {
      const previous = bindings.get(result.platform)
      bindings.set(result.platform, {
        platform: result.platform,
        path: result.path,
        target: result.target,
        updatedAt,
        ...(result.backup || previous?.originalRootBackup
          ? { originalRootBackup: result.backup ?? previous?.originalRootBackup }
          : {}),
      })
    }
  }
  return [...bindings.values()].sort((left, right) => left.platform.localeCompare(right.platform))
}

/**
 * 将自定义目录执行结果转换为 Manifest 绑定。
 * @param results 自定义目录执行结果。
 * @param previousBindings 其他批次已经登记的自定义目录绑定。
 * @returns 已成功接入的自定义目录绑定。
 */
function createCustomLinkBindings(
  results: CustomLinkBindingResult[],
  previousBindings: ManagedCustomLinkBinding[],
  operations: SkillBindCustomRootOperation[],
): ManagedCustomLinkBinding[] {
  const updatedAt = new Date().toISOString()
  const bindings = new Map(previousBindings.map((binding) => [binding.id, binding]))
  for (const result of results) {
    const operation = operations.find((entry) => entry.id === result.id)
    if (operation?.action === 'suspend' && result.status === 'applied') {
      const previous = bindings.get(result.id)
      if (previous) bindings.set(result.id, { ...previous, updatedAt, suspendedAt: updatedAt, suspendedPath: previous.suspendedPath ?? join(dirname(previous.path), `.askx-${previous.id}-skills-link`) })
      continue
    }
    if (result.status !== 'applied') continue
    const previous = bindings.get(result.id)
    bindings.set(result.id, {
      id: result.id,
      name: result.name,
      path: result.path,
      target: result.target,
      updatedAt,
      ...(result.backup || previous?.originalRootBackup
        ? { originalRootBackup: result.backup ?? previous?.originalRootBackup }
        : {}),
    })
  }
  return [...bindings.values()].sort((left, right) => left.path.localeCompare(right.path))
}

/**
 * 应用用户确认的 Skills 批量计划。
 * @param input 计划、revision 与运行目录。
 * @returns 批量回执。
 */
export async function applySkillsBatchPlan(input: ApplySkillsPlanInput): Promise<SkillsBatchReceipt> {
  assertSkillsBatchPlan(input.plan)
  if (input.settingsRevision !== input.plan.settingsRevision) throw new Error('共享设置已经变化，请重新扫描。')
  const manifestBefore = await input.manifestStore.read()
  if ((manifestBefore?.revision ?? 0) !== input.plan.manifestRevision) throw new Error('Skills manifest 已经变化，请重新扫描。')
  const registry = await new SkillManagerRegistryStore(input.dataDir).read()
  if ((registry?.revision ?? 0) !== input.plan.registryRevision) throw new Error('Skill registry 已经变化，请重新扫描。')
  const report = await scanSkills(input.homeDir, input.dataDir, input.plan.platforms, input.plan.customRoots)
  if (report.fingerprint !== input.plan.detectionFingerprint) throw new Error('本地 Skill 已经变化，请重新扫描。')
  assertSkillsPlanScope(input.plan, report, input.dataDir, await detectSkillPlatforms(input.homeDir))

  const journalPath = join(input.dataDir, 'transactions', `${input.plan.id}.json`)
  await writeInternalJson(journalPath, { status: 'applying', plan: input.plan, startedAt: new Date().toISOString() })
  const { stagingRoot, localStagingRoot, results, records, localRecords } = await buildCanonicalStaging(input.plan, report, input.dataDir, manifestBefore)
  const appliedBatch = await switchPlatformRoots(input.plan, stagingRoot, localStagingRoot, records, localRecords, input.dataDir, manifestBefore?.platformBindings ?? [], manifestBefore?.customLinkBindings ?? [])
  const now = new Date().toISOString()
  let manifestRevision = input.plan.manifestRevision
  try {
    /** connect 计划保存用户本次确认的完整扫描来源列表；sync 不修改来源设置。 */
    const linkedCustomPaths = new Set(input.plan.customLinkOperations.map((operation) => operation.path))
    const scannedCustomRoots = report.customRoots.filter((root) => !linkedCustomPaths.has(root.path))
    const persistedCustomRoots = input.plan.configurationStrategy === 'replace'
      ? scannedCustomRoots
      : input.plan.configurationStrategy === 'merge'
        ? [...new Map([...(manifestBefore?.customRoots ?? []), ...scannedCustomRoots].map((root) => [root.path, root])).values()].sort((left, right) => left.path.localeCompare(right.path))
        : manifestBefore?.customRoots ?? []
    const saved = await input.manifestStore.write({
      version: 3,
      revision: input.plan.manifestRevision,
      initializedAt: manifestBefore?.initializedAt ?? now,
      lastScan: { scannedAt: report.scannedAt, fingerprint: report.fingerprint, platforms: report.platforms },
      skills: records,
      localSkills: localRecords,
      customRoots: persistedCustomRoots,
      platformBindings: createPlatformBindings(appliedBatch.platformResults, manifestBefore?.platformBindings ?? [], input.plan.platformOperations),
      customLinkBindings: createCustomLinkBindings(appliedBatch.customLinkResults, manifestBefore?.customLinkBindings ?? [], input.plan.customLinkOperations),
    }, input.plan.manifestRevision)
    manifestRevision = saved.revision
  } catch (error) {
    await rollbackAppliedBatch(appliedBatch, join(input.dataDir, 'skills'))
    await writeInternalJson(journalPath, { status: 'failed', plan: input.plan, error: (error as Error).message })
    throw error
  }

  const receipt: SkillsBatchReceipt = {
    id: input.plan.id,
    planHash: input.plan.hash,
    appliedAt: now,
    manifestRevision,
    results,
    platformResults: appliedBatch.platformResults,
    customLinkResults: appliedBatch.customLinkResults,
  }
  const stored: StoredBatchReceipt = { receipt, manifestBefore, appliedBatch }
  try {
    await writeInternalJson(journalPath, { status: 'complete', ...stored })
  } catch (error) {
    const rollbackWarnings: string[] = []
    try {
      await rollbackAppliedBatch(appliedBatch, join(input.dataDir, 'skills'))
    } catch (rollbackError) {
      rollbackWarnings.push((rollbackError as Error).message)
    }
    try {
      if (manifestBefore) await input.manifestStore.write(manifestBefore, manifestRevision)
      else await input.manifestStore.remove(manifestRevision)
    } catch (manifestError) {
      rollbackWarnings.push((manifestError as Error).message)
    }
    throw new Error([`Skills 回执写入失败：${(error as Error).message}`, ...rollbackWarnings].join('\n'))
  }
  return receipt
}

/**
 * 列出本机已完成的 Skills 批量回执。
 * @param dataDir AskX 数据目录。
 * @returns 按时间倒序排列的回执。
 */
export async function listSkillsReceipts(dataDir: string): Promise<SkillsBatchReceipt[]> {
  const directory = join(dataDir, 'transactions')
  let names: string[]
  try {
    names = (await readdir(directory)).filter((entry) => entry.endsWith('.json'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const receipts = await Promise.all(names.map(async (name) => {
    try {
      const stored = JSON.parse(await readFile(join(directory, name), 'utf8')) as { status?: string; receipt?: SkillsBatchReceipt }
      if (stored.status !== 'complete' || !stored.receipt) return undefined
      return {
        ...stored.receipt,
        platformResults: stored.receipt.platformResults ?? [],
        customLinkResults: stored.receipt.customLinkResults ?? [],
      }
    } catch {
      return undefined
    }
  }))
  return receipts.filter((receipt): receipt is SkillsBatchReceipt => Boolean(receipt)).sort((left, right) => right.appliedAt.localeCompare(left.appliedAt))
}

/**
 * 按批次回执恢复根目录代理操作。
 * @param dataDir AskX 数据目录。
 * @param manifestStore manifest 存储。
 * @param receiptId 批次回执标识。
 * @returns Core 统一回滚结果。
 */
export async function rollbackSkillsReceipt(
  dataDir: string,
  manifestStore: SkillsManifestStore,
  receiptId: string,
): Promise<RollbackResult> {
  const path = join(dataDir, 'transactions', `${receiptId}.json`)
  let stored: StoredBatchReceipt & { status?: string }
  try {
    stored = JSON.parse(await readFile(path, 'utf8')) as StoredBatchReceipt & { status?: string }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`找不到 Skills 回执：${receiptId}`)
    throw error
  }
  if (stored.status !== 'complete') throw new Error(`Skills 回执当前不可回滚：${receiptId}`)
  const currentManifest = await manifestStore.read()
  if ((currentManifest?.revision ?? 0) !== stored.receipt.manifestRevision) throw new Error('Skills manifest 已在该事务后发生变化，不能直接回滚。')

  try {
    await assertRollbackSafe(stored.appliedBatch, join(dataDir, 'skills'))
  } catch (error) {
    return { receiptId, rolledBack: false, restoredPaths: [], warnings: [(error as Error).message] }
  }
  await rollbackAppliedBatch(stored.appliedBatch, join(dataDir, 'skills'))
  if (stored.manifestBefore) await manifestStore.write(stored.manifestBefore, stored.receipt.manifestRevision)
  else await manifestStore.remove(stored.receipt.manifestRevision)
  await writeInternalJson(path, { ...stored, status: 'rolled-back', rolledBackAt: new Date().toISOString() })
  return {
    receiptId,
    rolledBack: true,
    restoredPaths: stored.appliedBatch.platformBackups.map((backup) => backup.originalPath),
    warnings: [],
  }
}
