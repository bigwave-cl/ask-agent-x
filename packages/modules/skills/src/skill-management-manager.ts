import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { stableHash, type UserConsent } from '@askx/core'
import { z } from 'zod'
import type { SkillsManifestStore } from './manifest-store.js'
import {
  ASKX_SKILL_MANAGER_NAME,
  SKILL_MANAGER_METADATA_FILE,
  createSkillManagerMetadata,
  ensureAskxManagedDeclaration,
  fingerprintManagedSkill,
  inspectSkillManagerMetadata,
  removeAskxManagedDeclaration,
  updateSkillManagerMetadata,
  writeSkillManagerMetadata,
  type SkillManagerInspection,
} from './skill-manager-metadata.js'
import { SkillManagerRegistryStore, type AskxSkillRegistry } from './skill-manager-registry.js'
import type { ManagedLocalSkillRecord, ManagedSkillRecord, SkillManagerMetadataSummary, SkillsManifest } from './skill-types.js'

/** Skill 版本管理所在的资源范围。 */
export type SkillManagementScope = 'shared' | 'local'

/** 统计页中的 Skill 版本管理状态。 */
export interface SkillManagementStatusItem {
  /** Manifest 中的稳定记录标识。 */
  recordId: string
  /** Skill 名称。 */
  name: string
  /** Skill 所在范围。 */
  scope: SkillManagementScope
  /** 当前绝对目录。 */
  path: string
  /** 实际 manager 元数据状态。 */
  state: SkillManagerInspection['state']
  /** 是否已经由 AskX Manager 管理。 */
  managed: boolean
  /** 是否已经登记到权威 Registry。 */
  registryRegistered: boolean
  /** 当前版本。 */
  version?: string
  /** 当前稳定 manager Skill ID。 */
  managerSkillId?: string | undefined
  /** 当前需要用户关注的问题。 */
  issue?: string
  /** 是否可以执行纳入或修复管理。 */
  canManage: boolean
  /** 是否可以无损移除版本管理。 */
  canRemove: boolean
}

/** 统计页使用的管理覆盖报告。 */
export interface SkillManagementOverview {
  /** 已由 AskX Manager 管理的 Skill。 */
  managed: SkillManagementStatusItem[]
  /** 尚未由 AskX Manager 管理的 Skill。 */
  unmanaged: SkillManagementStatusItem[]
}

/** 单个 Skill 的快捷管理动作。 */
export type SkillManagementAction = 'manage' | 'remove'

/** 实际写入时采用的明确管理操作。 */
export type SkillManagementOperation = 'initialize' | 'migrate-bobo' | 'refresh' | 'reinitialize' | 'remove'

/** 单个 Skill 版本管理计划。 */
export interface SkillManagementPlan {
  /** 计划标识。 */
  id: string
  /** 计划创建时间。 */
  createdAt: string
  /** Manifest 记录标识。 */
  recordId: string
  /** Skill 名称。 */
  skillName: string
  /** Skill 所在范围。 */
  scope: SkillManagementScope
  /** 用户请求的动作。 */
  action: SkillManagementAction
  /** 服务端根据实际状态解析出的操作。 */
  operation: SkillManagementOperation
  /** 当前 Skill 绝对目录。 */
  path: string
  /** 当前完整内容指纹。 */
  contentHash: string
  /** 当前 manifest revision。 */
  manifestRevision: number
  /** 当前 registry revision。 */
  registryRevision: number
  /** 移除管理时将被删除的 manager Skill ID。 */
  managerSkillId?: string | undefined
  /** 用户授权所对应的稳定指纹。 */
  hash: string
}

/** 单个 Skill 版本管理回执。 */
export interface SkillManagementReceipt {
  /** 回执标识。 */
  id: string
  /** 对应计划指纹。 */
  planHash: string
  /** 完成时间。 */
  appliedAt: string
  /** Manifest 记录标识。 */
  recordId: string
  /** 已执行的动作。 */
  action: SkillManagementAction
  /** 更新后的 manifest revision。 */
  manifestRevision: number
  /** 更新后的 registry revision。 */
  registryRevision: number
}

/** 用户在批量编辑弹窗中保存的一项管理变更。 */
export interface SkillManagementBatchSelection {
  /** Manifest 记录标识。 */
  recordId: string
  /** 纳入或移除版本管理。 */
  action: SkillManagementAction
}

/** 批量计划中的一个稳定操作单元。 */
export interface SkillManagementBatchUnit {
  /** Manifest 记录标识。 */
  recordId: string
  /** Skill 名称。 */
  skillName: string
  /** Skill 所在范围。 */
  scope: SkillManagementScope
  /** 用户保存的动作。 */
  action: SkillManagementAction
  /** 服务端解析出的明确操作。 */
  operation: SkillManagementOperation
  /** Skill 绝对目录。 */
  path: string
  /** 生成计划时的完整内容指纹。 */
  contentHash: string
  /** 移除管理时对应的 manager Skill ID。 */
  managerSkillId?: string | undefined
}

/** 统计页批量管理计划。 */
export interface SkillManagementBatchPlan {
  /** 计划标识。 */
  id: string
  /** 计划创建时间。 */
  createdAt: string
  /** 计划基于的 manifest revision。 */
  manifestRevision: number
  /** 计划基于的 registry revision。 */
  registryRevision: number
  /** 要逐项执行的稳定操作。 */
  units: SkillManagementBatchUnit[]
  /** 用户授权对应的稳定指纹。 */
  hash: string
}

/** 批量执行中的单项结果。 */
export interface SkillManagementBatchResult {
  /** Manifest 记录标识。 */
  recordId: string
  /** Skill 名称。 */
  skillName: string
  /** 已尝试的动作。 */
  action: SkillManagementAction
  /** 单项是否成功应用。 */
  status: 'applied' | 'failed'
  /** 失败时的可展示原因。 */
  error?: string | undefined
}

/** 统计页批量管理回执。 */
export interface SkillManagementBatchReceipt {
  /** 回执标识。 */
  id: string
  /** 对应批量计划指纹。 */
  planHash: string
  /** 批次完成时间。 */
  appliedAt: string
  /** 每个 Skill 的独立执行结果。 */
  results: SkillManagementBatchResult[]
  /** 批次结束后的 manifest revision。 */
  manifestRevision: number
  /** 批次结束后的 registry revision。 */
  registryRevision: number
}

/** 单 Skill 版本管理计划运行时 schema。 */
export const skillManagementPlanSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  recordId: z.string().uuid(),
  skillName: z.string().min(1),
  scope: z.enum(['shared', 'local']),
  action: z.enum(['manage', 'remove']),
  operation: z.enum(['initialize', 'migrate-bobo', 'refresh', 'reinitialize', 'remove']),
  path: z.string().min(1),
  contentHash: z.string().min(1),
  manifestRevision: z.number().int().nonnegative(),
  registryRevision: z.number().int().nonnegative(),
  managerSkillId: z.string().optional(),
  hash: z.string().min(1),
})

/** 统计页批量管理计划运行时 schema。 */
export const skillManagementBatchPlanSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  manifestRevision: z.number().int().nonnegative(),
  registryRevision: z.number().int().nonnegative(),
  units: z.array(z.object({
    recordId: z.string().uuid(),
    skillName: z.string().min(1),
    scope: z.enum(['shared', 'local']),
    action: z.enum(['manage', 'remove']),
    operation: z.enum(['initialize', 'migrate-bobo', 'refresh', 'reinitialize', 'remove']),
    path: z.string().min(1),
    contentHash: z.string().min(1),
    managerSkillId: z.string().optional(),
  })).min(1).max(200),
  hash: z.string().min(1),
}).superRefine((plan, context) => {
  const ids = new Set<string>()
  for (const [index, unit] of plan.units.entries()) {
    if (ids.has(unit.recordId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['units', index, 'recordId'], message: '同一个 Skill 不能重复出现在批量计划中。' })
    ids.add(unit.recordId)
  }
})

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

/** 解析 Manifest 记录及其实际目录。 */
function findRecord(manifest: SkillsManifest, recordId: string): { record: ManagedSkillRecord | ManagedLocalSkillRecord; scope: SkillManagementScope; path: string } {
  const shared = manifest.skills.find((record) => record.id === recordId)
  if (shared) return { record: shared, scope: 'shared', path: shared.canonicalPath }
  const local = manifest.localSkills?.find((record) => record.id === recordId)
  if (local) return { record: local, scope: 'local', path: local.localPath }
  throw new Error('Skill 记录不存在，请刷新页面后重试。')
}

/** 根据实际元数据与 Registry 状态决定纳入管理操作。 */
function resolveManageOperation(inspection: SkillManagerInspection, registryRegistered: boolean): Exclude<SkillManagementOperation, 'remove'> {
  if (inspection.state === 'unmanaged') return 'initialize'
  if (inspection.state === 'metadata-invalid') return 'reinitialize'
  if (inspection.metadata?.managed_by === 'bobo-skill-manager') return 'migrate-bobo'
  if (inspection.state === 'metadata-stale' || !registryRegistered) return 'refresh'
  throw new Error('该 Skill 已经纳入 AskX 版本管理。')
}

/** 将实际元数据转换为 Manifest 摘要。 */
function toManagerSummary(metadata: NonNullable<SkillManagerInspection['metadata']>): SkillManagerMetadataSummary {
  return {
    skillId: metadata.skill_id,
    version: metadata.version,
    localOnly: metadata.local_only,
    managedBy: metadata.managed_by,
    contentSha256: metadata.content_sha256,
  }
}

/** 读取全部用户 Skill 的版本管理覆盖状态。 */
export async function inspectSkillManagementOverview(manifestStore: SkillsManifestStore, registryStore = new SkillManagerRegistryStore(manifestStore.dataDir)): Promise<SkillManagementOverview> {
  const manifest = await manifestStore.read()
  const registry = await registryStore.read()
  if (!manifest || !registry) return { managed: [], unmanaged: [] }
  const records = [
    ...manifest.skills.filter((record) => record.kind !== 'system').map((record) => ({ record, scope: 'shared' as const, path: record.canonicalPath })),
    ...(manifest.localSkills ?? []).map((record) => ({ record, scope: 'local' as const, path: record.localPath })),
  ]
  const items = await Promise.all(records.map(async ({ record, scope, path }): Promise<SkillManagementStatusItem> => {
    const inspection = await inspectSkillManagerMetadata(path)
    const managerSkillId = inspection.metadata?.skill_id
    const registryRegistered = Boolean(managerSkillId && registry.skills[managerSkillId])
    const managed = inspection.metadata?.managed_by === ASKX_SKILL_MANAGER_NAME
    const issue = inspection.error ?? (managed && !registryRegistered ? 'Skill 尚未登记到 AskX Registry。' : undefined)
    return {
      recordId: record.id,
      name: record.name,
      scope,
      path,
      state: inspection.state,
      managed,
      registryRegistered,
      ...(inspection.metadata ? { version: inspection.metadata.version, managerSkillId: inspection.metadata.skill_id } : {}),
      ...(issue ? { issue } : {}),
      canManage: !managed || inspection.state === 'metadata-stale' || !registryRegistered,
      canRemove: managed,
    }
  }))
  return {
    managed: items.filter((item) => item.managed).sort((left, right) => left.name.localeCompare(right.name)),
    unmanaged: items.filter((item) => !item.managed).sort((left, right) => left.name.localeCompare(right.name)),
  }
}

/** 为统计页中的纳入或移除管理动作生成只读确认计划。 */
export async function createSkillManagementPlan(manifestStore: SkillsManifestStore, recordId: string, action: SkillManagementAction): Promise<SkillManagementPlan> {
  const manifest = await manifestStore.read()
  if (!manifest) throw new Error('Skills 管理尚未初始化。')
  const { record, scope, path } = findRecord(manifest, recordId)
  if (record.kind === 'system') throw new Error('系统 Skill 不能通过普通管理操作修改。')
  const registry = await new SkillManagerRegistryStore(manifestStore.dataDir).read()
  if (!registry) throw new Error('AskX Skill Manager Registry 不可用。')
  const fingerprint = await fingerprintManagedSkill(path)
  const inspection = await inspectSkillManagerMetadata(path, fingerprint.businessContentHash)
  const registryRegistered = Boolean(inspection.metadata && registry.skills[inspection.metadata.skill_id])
  const operation = action === 'manage'
    ? resolveManageOperation(inspection, registryRegistered)
    : inspection.metadata?.managed_by === ASKX_SKILL_MANAGER_NAME
      ? 'remove'
      : (() => { throw new Error('该 Skill 尚未纳入 AskX 版本管理。') })()
  const unsigned = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    recordId,
    skillName: record.name,
    scope,
    action,
    operation,
    path,
    contentHash: fingerprint.contentHash,
    manifestRevision: manifest.revision,
    registryRevision: registry.revision,
    ...(action === 'remove' && inspection.metadata ? { managerSkillId: inspection.metadata.skill_id } : {}),
  }
  return skillManagementPlanSchema.parse({ ...unsigned, hash: stableHash(unsigned) })
}

/** 将更新后的记录写回对应 Manifest 列表。 */
function updateManifestRecord(manifest: SkillsManifest, scope: SkillManagementScope, nextRecord: ManagedSkillRecord | ManagedLocalSkillRecord): SkillsManifest {
  return scope === 'shared'
    ? { ...manifest, skills: manifest.skills.map((record) => record.id === nextRecord.id ? nextRecord : record) }
    : { ...manifest, localSkills: (manifest.localSkills ?? []).map((record) => record.id === nextRecord.id ? nextRecord as ManagedLocalSkillRecord : record) }
}

/** 应用一次经过确认的单 Skill 版本管理计划，失败时恢复目录和 Registry。 */
export async function applySkillManagementPlan(manifestStore: SkillsManifestStore, inputPlan: SkillManagementPlan, consent: UserConsent): Promise<SkillManagementReceipt> {
  const plan = skillManagementPlanSchema.parse(inputPlan)
  const { hash, ...unsigned } = plan
  if (stableHash(unsigned) !== hash || consent.planHash !== hash) throw new Error('Skill 版本管理授权与当前计划不匹配。')
  const manifest = await manifestStore.read()
  if (!manifest || manifest.revision !== plan.manifestRevision) throw new Error('Skills manifest 已经变化，请重新生成计划。')
  const { record, scope, path } = findRecord(manifest, plan.recordId)
  if (scope !== plan.scope || path !== plan.path || record.name !== plan.skillName) throw new Error('Skill 记录已经变化，请重新生成计划。')
  const beforeFingerprint = await fingerprintManagedSkill(path)
  if (beforeFingerprint.contentHash !== plan.contentHash) throw new Error('Skill 内容已经变化，请重新生成计划。')
  const registryStore = new SkillManagerRegistryStore(manifestStore.dataDir)
  const registryBefore = await registryStore.read()
  if (!registryBefore || registryBefore.revision !== plan.registryRevision) throw new Error('Skill Registry 已经变化，请重新生成计划。')
  const inspection = await inspectSkillManagerMetadata(path, beforeFingerprint.businessContentHash)
  const registryRegistered = Boolean(inspection.metadata && registryBefore.skills[inspection.metadata.skill_id])
  const currentOperation = plan.action === 'manage'
    ? resolveManageOperation(inspection, registryRegistered)
    : inspection.metadata?.managed_by === ASKX_SKILL_MANAGER_NAME ? 'remove' : undefined
  if (currentOperation !== plan.operation) throw new Error('Skill 版本管理状态已经变化，请重新生成计划。')

  const transactionRoot = join(manifestStore.dataDir, 'transactions', `skill-management-${plan.id}`)
  const staging = join(transactionRoot, 'staging', record.name)
  const backup = join(transactionRoot, 'backup', record.name)
  let swapped = false
  let registryRevision = registryBefore.revision
  try {
    await mkdir(dirname(staging), { recursive: true, mode: 0o700 })
    await cp(path, staging, { recursive: true, dereference: false, preserveTimestamps: true })
    let nextRegistry: AskxSkillRegistry
    let manager: SkillManagerMetadataSummary | undefined
    if (plan.action === 'manage') {
      await ensureAskxManagedDeclaration(staging, scope === 'local')
      const stagedFingerprint = await fingerprintManagedSkill(staging)
      const metadata = plan.operation === 'initialize' || plan.operation === 'reinitialize'
        ? createSkillManagerMetadata(stagedFingerprint.businessContentHash, scope === 'local')
        : updateSkillManagerMetadata(inspection.metadata!, stagedFingerprint.businessContentHash, {
            migrateOwner: plan.operation === 'migrate-bobo',
            localOnly: scope === 'local',
            bumpVersion: plan.operation !== 'migrate-bobo',
          })
      await writeSkillManagerMetadata(staging, metadata)
      manager = toManagerSummary(metadata)
      const previous = registryBefore.skills[metadata.skill_id]
      nextRegistry = {
        ...registryBefore,
        skills: {
          ...registryBefore.skills,
          [metadata.skill_id]: {
            current_name: record.name,
            aliases: previous?.aliases ?? [],
            version: metadata.version,
            content_sha256: metadata.content_sha256,
            usage_count: previous?.usage_count ?? 0,
            ...(previous?.last_used_at ? { last_used_at: previous.last_used_at } : {}),
            targets: {
              ...(previous?.targets ?? {}),
              [scope === 'shared' ? 'canonical' : `folder:${path}`]: {
                kind: scope === 'shared' ? 'canonical' : 'folder',
                path,
                status: 'copied',
                version: metadata.version,
                content_sha256: metadata.content_sha256,
                synced_at: new Date().toISOString(),
              },
            },
          },
        },
      }
    } else {
      await rm(join(staging, SKILL_MANAGER_METADATA_FILE), { force: true })
      await removeAskxManagedDeclaration(staging)
      const skills = { ...registryBefore.skills }
      delete skills[plan.managerSkillId!]
      nextRegistry = { ...registryBefore, skills }
    }
    const finalFingerprint = await fingerprintManagedSkill(staging)
    await mkdir(dirname(backup), { recursive: true, mode: 0o700 })
    await rename(path, backup)
    await rename(staging, path)
    swapped = true
    const verifiedFingerprint = await fingerprintManagedSkill(path)
    if (verifiedFingerprint.contentHash !== finalFingerprint.contentHash) throw new Error('Skill 版本管理写入后的内容校验失败。')
    const savedRegistry = await registryStore.write(nextRegistry, registryBefore.revision)
    registryRevision = savedRegistry.revision
    const nextRecord: ManagedSkillRecord | ManagedLocalSkillRecord = {
      ...record,
      contentHash: verifiedFingerprint.contentHash,
      businessContentHash: verifiedFingerprint.businessContentHash,
      ...(manager ? { manager } : { manager: undefined }),
      updatedAt: new Date().toISOString(),
    }
    const savedManifest = await manifestStore.write(updateManifestRecord(manifest, scope, nextRecord), manifest.revision)
    await rm(transactionRoot, { recursive: true, force: true })
    return {
      id: randomUUID(),
      planHash: plan.hash,
      appliedAt: new Date().toISOString(),
      recordId: plan.recordId,
      action: plan.action,
      manifestRevision: savedManifest.revision,
      registryRevision,
    }
  } catch (error) {
    const rollbackErrors: unknown[] = []
    try {
      if (swapped) {
        await rm(path, { recursive: true, force: true })
        if (await pathExists(backup)) await rename(backup, path)
      }
      if (registryRevision !== registryBefore.revision) await registryStore.write(registryBefore, registryRevision)
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }
    await rm(transactionRoot, { recursive: true, force: true }).catch(() => undefined)
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], 'Skill 版本管理失败且自动恢复不完整。')
    throw error
  }
}

/** 从单项计划提取批量授权中需要稳定展示的操作。 */
function toBatchUnit(plan: SkillManagementPlan): SkillManagementBatchUnit {
  return {
    recordId: plan.recordId,
    skillName: plan.skillName,
    scope: plan.scope,
    action: plan.action,
    operation: plan.operation,
    path: plan.path,
    contentHash: plan.contentHash,
    ...(plan.managerSkillId ? { managerSkillId: plan.managerSkillId } : {}),
  }
}

/** 为统计弹窗中保存的全部增删草稿生成一份只读批量计划。 */
export async function createSkillManagementBatchPlan(manifestStore: SkillsManifestStore, selections: SkillManagementBatchSelection[]): Promise<SkillManagementBatchPlan> {
  if (!selections.length) throw new Error('没有需要保存的 Skill 管理变更。')
  if (new Set(selections.map(selection => selection.recordId)).size !== selections.length) throw new Error('同一个 Skill 不能重复提交管理变更。')
  const manifest = await manifestStore.read()
  const registry = await new SkillManagerRegistryStore(manifestStore.dataDir).read()
  if (!manifest || !registry) throw new Error('Skills 管理或 Registry 尚未初始化。')
  const units = await Promise.all(selections.map(async selection => toBatchUnit(
    await createSkillManagementPlan(manifestStore, selection.recordId, selection.action),
  )))
  const unsigned = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    manifestRevision: manifest.revision,
    registryRevision: registry.revision,
    units,
  }
  return skillManagementBatchPlanSchema.parse({ ...unsigned, hash: stableHash(unsigned) })
}

/** 应用用户最终保存的批量管理计划；单项失败时由单项事务恢复并继续后续 Skill。 */
export async function applySkillManagementBatchPlan(manifestStore: SkillsManifestStore, inputPlan: SkillManagementBatchPlan, consent: UserConsent): Promise<SkillManagementBatchReceipt> {
  const plan = skillManagementBatchPlanSchema.parse(inputPlan)
  const { hash, ...unsigned } = plan
  if (stableHash(unsigned) !== hash || consent.planHash !== hash) throw new Error('Skill 批量管理授权与当前计划不匹配。')
  const [manifestBefore, registryBefore] = await Promise.all([
    manifestStore.read(),
    new SkillManagerRegistryStore(manifestStore.dataDir).read(),
  ])
  if (!manifestBefore || !registryBefore || manifestBefore.revision !== plan.manifestRevision || registryBefore.revision !== plan.registryRevision) {
    throw new Error('Skills 管理状态已经变化，请重新打开弹窗确认。')
  }

  const results: SkillManagementBatchResult[] = []
  for (const unit of plan.units) {
    try {
      const currentPlan = await createSkillManagementPlan(manifestStore, unit.recordId, unit.action)
      if (stableHash(toBatchUnit(currentPlan)) !== stableHash(unit)) throw new Error('Skill 状态与已保存的批量计划不一致。')
      await applySkillManagementPlan(manifestStore, currentPlan, { planHash: currentPlan.hash, confirmedAt: consent.confirmedAt })
      results.push({ recordId: unit.recordId, skillName: unit.skillName, action: unit.action, status: 'applied' })
    } catch (error) {
      results.push({ recordId: unit.recordId, skillName: unit.skillName, action: unit.action, status: 'failed', error: (error as Error).message })
    }
  }
  const [manifestAfter, registryAfter] = await Promise.all([
    manifestStore.read(),
    new SkillManagerRegistryStore(manifestStore.dataDir).read(),
  ])
  return {
    id: randomUUID(),
    planHash: plan.hash,
    appliedAt: new Date().toISOString(),
    results,
    manifestRevision: manifestAfter?.revision ?? plan.manifestRevision,
    registryRevision: registryAfter?.revision ?? plan.registryRevision,
  }
}
