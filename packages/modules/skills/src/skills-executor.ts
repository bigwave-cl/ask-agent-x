import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { SkillsManifestStore } from './manifest-store.js'
import { hashSkillDirectory, scanSkills } from './scanner.js'
import { assertSkillsBatchPlan, assertSkillsPlanScope } from './skills-planner.js'
import type {
  ManagedSkillBinding,
  ManagedSkillRecord,
  SkillBackupMove,
  SkillDecision,
  SkillLocation,
  SkillPlanUnit,
  SkillPlatformId,
  SkillTransactionResult,
  SkillsBatchPlan,
  SkillsBatchReceipt,
  SkillsManifest,
  SkillsScanReport,
} from './skill-types.js'
import type { RollbackResult } from '@askx/core'
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

/** 单元执行的内部恢复信息。 */
interface AppliedUnit {
  /** 对外回执。 */
  result: SkillTransactionResult
  /** 本次是否新建统一源。 */
  createdCanonical: boolean
  /** 写入 manifest 的记录。 */
  record?: ManagedSkillRecord
}

/** 持久化批次回执。 */
interface StoredBatchReceipt {
  /** 对外回执。 */
  receipt: SkillsBatchReceipt
  /** 操作前 manifest。 */
  manifestBefore: SkillsManifest | null
  /** 成功单元的内部恢复信息。 */
  appliedUnits: AppliedUnit[]
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
  if (!location || location.platform === 'askx') throw new Error(`找不到可操作的 Skill 位置：${id}`)
  return location
}

/** 获取决策的统一源位置。 */
function getSource(report: SkillsScanReport, decision: SkillDecision): SkillLocation | undefined {
  if (decision.kind === 'keep' || decision.kind === 'archive') return undefined
  return getLocation(report, decision.sourceLocationId)
}

/** 获取决策最终使用的 Skill 名称。 */
function getCanonicalName(unit: SkillPlanUnit, source?: SkillLocation): string {
  return unit.decision.kind === 'rename-and-adopt' ? unit.decision.newName : source?.name ?? unit.skillName
}

/** 获取需要建立链接的平台。 */
function getBindingPlatforms(report: SkillsScanReport, decision: SkillDecision, source?: SkillLocation): SkillPlatformId[] {
  if (decision.kind === 'adopt' || decision.kind === 'merge' || decision.kind === 'rename-and-adopt') {
    return decision.platforms
  }
  if (decision.kind === 'replace') {
    const candidates = [
      ...(source ? [source.platform] : []),
      ...decision.targetLocationIds.map((id) => getLocation(report, id).platform),
    ]
    return [...new Set(candidates.filter((platform): platform is SkillPlatformId => report.platforms.includes(platform as SkillPlatformId)))]
  }
  return []
}

/** 将一个未受管路径安全移动到事务备份。 */
async function moveToBackup(path: string, backupPath: string): Promise<SkillBackupMove> {
  await mkdir(dirname(backupPath), { recursive: true, mode: 0o700 })
  await rename(path, backupPath)
  return { originalPath: path, backupPath }
}

/** 回滚一个已经开始应用的 Skill 单元。 */
async function rollbackUnit(unit: AppliedUnit): Promise<void> {
  for (const linkPath of [...unit.result.createdLinks].reverse()) {
    if (!await pathExists(linkPath)) continue
    const stat = await lstat(linkPath)
    if (!stat.isSymbolicLink()) throw new Error(`回滚被阻止，受管链接已变为真实目录：${linkPath}`)
    if (unit.result.canonicalPath && resolve(dirname(linkPath), await readlink(linkPath)) !== resolve(unit.result.canonicalPath)) {
      throw new Error(`回滚被阻止，软链目标已经变化：${linkPath}`)
    }
    await rm(linkPath)
  }
  for (const backup of [...unit.result.backups].reverse()) {
    if (await pathExists(backup.originalPath)) throw new Error(`回滚目标已被占用：${backup.originalPath}`)
    if (await pathExists(backup.backupPath)) await rename(backup.backupPath, backup.originalPath)
  }
  if (unit.createdCanonical && unit.result.canonicalPath && await pathExists(unit.result.canonicalPath)) {
    await rm(unit.result.canonicalPath, { recursive: true })
  }
}

/**
 * 在显式恢复前验证所有受管路径仍保持事务完成时的状态。
 * @param unit 待恢复的事务单元。
 */
async function assertRollbackUnitSafe(unit: AppliedUnit): Promise<void> {
  for (const linkPath of unit.result.createdLinks) {
    if (!await pathExists(linkPath)) continue
    const stat = await lstat(linkPath)
    if (!stat.isSymbolicLink()) throw new Error(`恢复被阻止，受管链接已变为真实目录：${linkPath}`)
    if (unit.result.canonicalPath && resolve(dirname(linkPath), await readlink(linkPath)) !== resolve(unit.result.canonicalPath)) {
      throw new Error(`恢复被阻止，软链目标已经变化：${linkPath}`)
    }
  }
  for (const backup of unit.result.backups) {
    if (await pathExists(backup.originalPath) && !unit.result.createdLinks.includes(backup.originalPath)) {
      throw new Error(`恢复被阻止，原路径已被占用：${backup.originalPath}`)
    }
    if (!await pathExists(backup.backupPath)) throw new Error(`恢复被阻止，事务备份已经丢失：${backup.backupPath}`)
  }
  if (unit.createdCanonical && unit.result.canonicalPath && await pathExists(unit.result.canonicalPath)) {
    if (!unit.record || await hashSkillDirectory(unit.result.canonicalPath) !== unit.record.contentHash) {
      throw new Error(`恢复被阻止，统一源内容已经变化：${unit.result.canonicalPath}`)
    }
  }
}

/** 应用一个独立 Skill 事务。 */
async function applyUnit(
  unit: SkillPlanUnit,
  report: SkillsScanReport,
  dataDir: string,
  batchId: string,
  manifest: SkillsManifest | null,
): Promise<AppliedUnit> {
  const receiptId = randomUUID()
  const result: SkillTransactionResult = {
    receiptId,
    skillName: unit.skillName,
    status: 'applied',
    createdLinks: [],
    backups: [],
    warnings: [...unit.warnings],
  }
  const applied: AppliedUnit = { result, createdCanonical: false }
  if (unit.decision.kind === 'keep') {
    result.status = 'skipped'
    return applied
  }
  if (unit.decision.kind === 'archive') {
    try {
      for (const locationId of unit.decision.locationIds) {
        const location = getLocation(report, locationId)
        const backupPath = join(dataDir, 'backups', 'skills', batchId, receiptId, location.platform, `${location.name}.bak`)
        result.backups.push(await moveToBackup(location.path, backupPath))
      }
      return applied
    } catch (error) {
      result.warnings.push((error as Error).message)
      await rollbackUnit(applied)
      result.status = 'rolled-back'
      return applied
    }
  }

  const source = getSource(report, unit.decision)
  if (!source?.contentHash) throw new Error(`Skill ${unit.skillName} 缺少内容指纹。`)
  const canonicalName = getCanonicalName(unit, source)
  const canonicalPath = join(dataDir, 'skills', canonicalName)
  result.canonicalPath = canonicalPath
  const existingRecord = manifest?.skills.find((record) => record.name === canonicalName)
  const canonicalExists = await pathExists(canonicalPath)
  if (canonicalExists && !existingRecord) throw new Error(`统一源存在未受管目录：${canonicalPath}`)
  if (canonicalExists && await hashSkillDirectory(canonicalPath) !== source.contentHash) {
    throw new Error(`统一源 ${canonicalName} 与所选版本内容不一致。`)
  }

  try {
    if (!canonicalExists) {
      await mkdir(join(dataDir, 'transactions', batchId, receiptId), { recursive: true, mode: 0o700 })
      const stagingPath = join(dataDir, 'transactions', batchId, receiptId, 'canonical.staging')
      await cp(source.path, stagingPath, { recursive: true, dereference: true, preserveTimestamps: true })
      await verifyCanonicalSkill(stagingPath, source.contentHash)
      await mkdir(dirname(canonicalPath), { recursive: true, mode: 0o700 })
      await rename(stagingPath, canonicalPath)
      applied.createdCanonical = true
    }

    const bindings: ManagedSkillBinding[] = [...(existingRecord?.bindings ?? [])]
    const platforms = getBindingPlatforms(report, unit.decision, source)
    for (const platform of platforms) {
      const status = report.platformStatuses.find((entry) => entry.id === platform)
      if (!status?.linkSupported) {
        result.warnings.push(`${status?.name ?? platform} 当前不可绑定，已保留原路径。`)
        continue
      }
      const linkPath = join(status.skillsDir, canonicalName)
      if (await pathExists(linkPath)) {
        const stat = await lstat(linkPath)
        if (stat.isSymbolicLink() && resolve(dirname(linkPath), await readlink(linkPath)) === resolve(canonicalPath)) {
          if (!bindings.some((binding) => binding.path === linkPath)) bindings.push({ platform, path: linkPath, target: canonicalPath })
          continue
        }
        const backupPath = join(dataDir, 'backups', 'skills', batchId, receiptId, platform, `${canonicalName}.bak`)
        result.backups.push(await moveToBackup(linkPath, backupPath))
      }
      await mkdir(dirname(linkPath), { recursive: true, mode: 0o700 })
      await symlink(canonicalPath, linkPath, 'dir')
      result.createdLinks.push(linkPath)
      await verifyManagedLink(linkPath, canonicalPath)
      bindings.push({ platform, path: linkPath, target: canonicalPath })
    }
    await verifyCanonicalSkill(canonicalPath, source.contentHash)
    applied.record = {
      id: existingRecord?.id ?? randomUUID(),
      name: canonicalName,
      canonicalPath,
      contentHash: source.contentHash,
      bindings: [...new Map(bindings.map((binding) => [binding.path, binding])).values()],
      updatedAt: new Date().toISOString(),
    }
    return applied
  } catch (error) {
    result.warnings.push((error as Error).message)
    try {
      await rollbackUnit(applied)
      result.status = 'rolled-back'
    } catch (rollbackError) {
      result.status = 'failed'
      result.warnings.push(`自动回滚失败：${(rollbackError as Error).message}`)
    }
    return applied
  }
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
  const report = await scanSkills(input.homeDir, input.dataDir, input.plan.platforms, input.plan.customRoots)
  if (report.fingerprint !== input.plan.detectionFingerprint) throw new Error('本地 Skill 已经变化，请重新扫描。')
  assertSkillsPlanScope(input.plan, report)

  const journalPath = join(input.dataDir, 'transactions', `${input.plan.id}.json`)
  await writeInternalJson(journalPath, { status: 'applying', plan: input.plan, startedAt: new Date().toISOString() })
  const appliedUnits: AppliedUnit[] = []
  for (const unit of input.plan.units) {
    try {
      appliedUnits.push(await applyUnit(unit, report, input.dataDir, input.plan.id, manifestBefore))
    } catch (error) {
      appliedUnits.push({
        createdCanonical: false,
        result: {
          receiptId: randomUUID(),
          skillName: unit.skillName,
          status: 'failed',
          createdLinks: [],
          backups: [],
          warnings: [(error as Error).message],
        },
      })
    }
  }

  const successfulRecords = appliedUnits.flatMap((unit) => unit.result.status === 'applied' && unit.record ? [unit.record] : [])
  const currentRecords = new Map((manifestBefore?.skills ?? []).map((record) => [record.name, record]))
  for (const record of successfulRecords) currentRecords.set(record.name, record)
  const now = new Date().toISOString()
  let manifestRevision = input.plan.manifestRevision
  try {
    const saved = await input.manifestStore.write({
      version: 1,
      revision: input.plan.manifestRevision,
      initializedAt: manifestBefore?.initializedAt ?? now,
      lastScan: { scannedAt: report.scannedAt, fingerprint: report.fingerprint, platforms: report.platforms },
      skills: [...currentRecords.values()].sort((left, right) => left.name.localeCompare(right.name)),
    }, input.plan.manifestRevision)
    manifestRevision = saved.revision
  } catch (error) {
    for (const unit of [...appliedUnits].reverse()) {
      if (unit.result.status !== 'applied') continue
      try {
        await rollbackUnit(unit)
        unit.result.status = 'rolled-back'
      } catch (rollbackError) {
        unit.result.status = 'failed'
        unit.result.warnings.push(`manifest 写入失败后的回滚失败：${(rollbackError as Error).message}`)
      }
    }
    await writeInternalJson(journalPath, { status: 'failed', plan: input.plan, error: (error as Error).message, appliedUnits })
    throw error
  }

  const receipt: SkillsBatchReceipt = {
    id: input.plan.id,
    planHash: input.plan.hash,
    appliedAt: now,
    manifestRevision,
    results: appliedUnits.map((unit) => unit.result),
  }
  const stored: StoredBatchReceipt = { receipt, manifestBefore, appliedUnits }
  try {
    await writeInternalJson(journalPath, { status: 'complete', ...stored })
  } catch (error) {
    const rollbackWarnings: string[] = []
    for (const unit of [...appliedUnits].reverse()) {
      if (unit.result.status !== 'applied') continue
      try {
        await rollbackUnit(unit)
        unit.result.status = 'rolled-back'
      } catch (rollbackError) {
        rollbackWarnings.push((rollbackError as Error).message)
      }
    }
    try {
      if (manifestBefore) await input.manifestStore.write(manifestBefore, manifestRevision)
      else await input.manifestStore.remove(manifestRevision)
    } catch (manifestError) {
      rollbackWarnings.push((manifestError as Error).message)
    }
    try {
      await writeInternalJson(journalPath, { status: 'failed', plan: input.plan, error: (error as Error).message, rollbackWarnings, appliedUnits })
    } catch {
      // 回执目录本身不可写时，只能将原始错误和回滚告警返回调用方。
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
      return stored.status === 'complete' ? stored.receipt : undefined
    } catch {
      return undefined
    }
  }))
  return receipts.filter((receipt): receipt is SkillsBatchReceipt => Boolean(receipt)).sort((left, right) => right.appliedAt.localeCompare(left.appliedAt))
}

/**
 * 按批次回执恢复首次接管操作。
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
  if ((currentManifest?.revision ?? 0) !== stored.receipt.manifestRevision) {
    throw new Error('Skills manifest 已在该事务后发生变化，不能直接回滚。')
  }
  const restoredPaths: string[] = []
  const warnings: string[] = []
  for (const unit of [...stored.appliedUnits].reverse()) {
    if (unit.result.status !== 'applied') continue
    try {
      await assertRollbackUnitSafe(unit)
    } catch (error) {
      warnings.push((error as Error).message)
    }
  }
  if (warnings.length) return { receiptId, rolledBack: false, restoredPaths, warnings }
  for (const unit of [...stored.appliedUnits].reverse()) {
    if (unit.result.status !== 'applied') continue
    try {
      await rollbackUnit(unit)
      restoredPaths.push(...unit.result.backups.map((backup) => backup.originalPath))
    } catch (error) {
      warnings.push((error as Error).message)
      break
    }
  }
  if (warnings.length) return { receiptId, rolledBack: false, restoredPaths, warnings }
  if (stored.manifestBefore) {
    await manifestStore.write(stored.manifestBefore, stored.receipt.manifestRevision)
  } else {
    await manifestStore.remove(stored.receipt.manifestRevision)
  }
  await writeInternalJson(path, { ...stored, status: 'rolled-back', rolledBackAt: new Date().toISOString() })
  return { receiptId, rolledBack: true, restoredPaths, warnings }
}
