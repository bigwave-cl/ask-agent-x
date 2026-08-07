import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { stableHash, type UserConsent } from '@askx/core'
import { z } from 'zod'
import type { SkillsManifestStore } from './manifest-store.js'
import {
  ensureAskxManagedDeclaration,
  fingerprintManagedSkill,
  inspectSkillManagerMetadata,
  updateSkillManagerMetadata,
  writeSkillManagerMetadata,
} from './skill-manager-metadata.js'
import { SkillManagerRegistryStore } from './skill-manager-registry.js'
import type { ManagedLocalSkillRecord, ManagedSkillRecord } from './skill-types.js'

/** Skill 在共享与本地范围之间迁移的计划。 */
export interface LocalSkillMigrationPlan {
  /** 计划标识。 */
  id: string
  /** 计划创建时间。 */
  createdAt: string
  /** Skill 标识。 */
  skillId: string
  /** Skill 名称。 */
  skillName: string
  /** 迁移前范围。 */
  sourceScope: 'shared' | 'local'
  /** 迁移后范围。 */
  targetScope: 'shared' | 'local'
  /** 迁移来源路径。 */
  sourcePath: string
  /** 迁移目标路径。 */
  destinationPath: string
  /** 当前完整内容指纹。 */
  contentHash: string
  /** 当前 manifest revision。 */
  manifestRevision: number
  /** 当前 registry revision。 */
  registryRevision: number
  /** 用户授权对应的稳定指纹。 */
  hash: string
}

/** Skill 范围迁移回执。 */
export interface LocalSkillMigrationReceipt {
  /** 回执标识。 */
  id: string
  /** 对应计划 hash。 */
  planHash: string
  /** 迁移完成时间。 */
  appliedAt: string
  /** 已迁移 Skill 标识。 */
  skillId: string
  /** 迁移后的路径。 */
  destinationPath: string
  /** 更新后的 manifest revision。 */
  manifestRevision: number
  /** 更新后的 registry revision。 */
  registryRevision: number
}

/** Skill 范围迁移计划运行时 schema。 */
export const localSkillMigrationPlanSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  skillId: z.string().min(1),
  skillName: z.string().min(1),
  sourceScope: z.enum(['shared', 'local']),
  targetScope: z.enum(['shared', 'local']),
  sourcePath: z.string().min(1),
  destinationPath: z.string().min(1),
  contentHash: z.string().min(1),
  manifestRevision: z.number().int().nonnegative(),
  registryRevision: z.number().int().nonnegative(),
  hash: z.string().min(1),
})

/** 判断一个路径是否存在。 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/** 为 Skill 范围迁移生成只读确认计划。 */
export async function createLocalSkillMigrationPlan(manifestStore: SkillsManifestStore, skillId: string, targetScope: 'shared' | 'local' = 'shared'): Promise<LocalSkillMigrationPlan> {
  const manifest = await manifestStore.read()
  if (!manifest) throw new Error('Skills 管理尚未初始化。')
  const sourceScope: 'shared' | 'local' = targetScope === 'shared' ? 'local' : 'shared'
  const record = sourceScope === 'local'
    ? manifest.localSkills?.find((skill) => skill.id === skillId)
    : manifest.skills.find((skill) => skill.id === skillId && skill.kind !== 'system')
  if (!record) throw new Error(sourceScope === 'local' ? '本地专属 Skill 不存在。' : '共享 Skill 不存在。')
  const sourcePath = sourceScope === 'local'
    ? (record as ManagedLocalSkillRecord).localPath
    : (record as ManagedSkillRecord).canonicalPath
  const fingerprint = await fingerprintManagedSkill(sourcePath)
  if (fingerprint.contentHash !== record.contentHash) throw new Error('Skill 内容已经变化，请刷新后重试。')
  const destinationPath = join(manifestStore.dataDir, targetScope === 'local' ? 'local-skills' : 'skills', record.name)
  if (await pathExists(destinationPath)) throw new Error(`${targetScope === 'local' ? '本地专属源' : '共享统一源'}已存在同名 Skill：${record.name}`)
  const registryRevision = (await new SkillManagerRegistryStore(manifestStore.dataDir).read())?.revision ?? 0
  const unsigned = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    skillId,
    skillName: record.name,
    sourceScope,
    targetScope,
    sourcePath,
    destinationPath,
    contentHash: fingerprint.contentHash,
    manifestRevision: manifest.revision,
    registryRevision,
  }
  return { ...unsigned, hash: stableHash(unsigned) }
}

/** 应用一次经过确认的 Skill 范围迁移，失败时恢复来源和索引。 */
export async function applyLocalSkillMigrationPlan(
  manifestStore: SkillsManifestStore,
  inputPlan: LocalSkillMigrationPlan,
  consent: UserConsent,
): Promise<LocalSkillMigrationReceipt> {
  const plan = localSkillMigrationPlanSchema.parse(inputPlan)
  const { hash, ...unsigned } = plan
  if (stableHash(unsigned) !== hash || consent.planHash !== hash) throw new Error('Skill 范围迁移授权与当前计划不匹配。')
  const manifest = await manifestStore.read()
  const record = plan.sourceScope === 'local'
    ? manifest?.localSkills?.find((skill) => skill.id === plan.skillId)
    : manifest?.skills.find((skill) => skill.id === plan.skillId && skill.kind !== 'system')
  const sourcePath = record && ('localPath' in record ? record.localPath : record.canonicalPath)
  if (!manifest || !record || manifest.revision !== plan.manifestRevision || sourcePath !== plan.sourcePath) {
    throw new Error('Skill 或 manifest 已经变化，请重新生成计划。')
  }
  if ((await fingerprintManagedSkill(plan.sourcePath)).contentHash !== plan.contentHash || await pathExists(plan.destinationPath)) {
    throw new Error('迁移来源或目标已经变化，请重新生成计划。')
  }
  const registryStore = new SkillManagerRegistryStore(manifestStore.dataDir)
  const registryBefore = await registryStore.read()
  if (!registryBefore || registryBefore.revision !== plan.registryRevision) throw new Error('Skill registry 已经变化，请重新生成计划。')
  const staging = join(manifestStore.dataDir, 'transactions', `local-migration-${plan.id}`, record.name)
  const backup = join(manifestStore.dataDir, 'backups', 'skills', plan.id, 'local', record.name)
  let sourceMoved = false
  let destinationApplied = false
  let registryRevision = registryBefore.revision
  try {
    await mkdir(dirname(staging), { recursive: true, mode: 0o700 })
    await cp(plan.sourcePath, staging, { recursive: true, dereference: false, preserveTimestamps: true })
    const manager = await inspectSkillManagerMetadata(staging)
    const targetLocalOnly = plan.targetScope === 'local'
    let updatedMetadata = manager.metadata
    if (updatedMetadata) {
      await ensureAskxManagedDeclaration(staging, targetLocalOnly)
      const fingerprint = await fingerprintManagedSkill(staging)
      updatedMetadata = updateSkillManagerMetadata(updatedMetadata, fingerprint.businessContentHash, { localOnly: targetLocalOnly })
      await writeSkillManagerMetadata(staging, updatedMetadata)
    }
    const finalFingerprint = await fingerprintManagedSkill(staging)
    await mkdir(dirname(backup), { recursive: true, mode: 0o700 })
    await rename(plan.sourcePath, backup)
    sourceMoved = true
    await rename(staging, plan.destinationPath)
    destinationApplied = true
    const previousRegistryEntry = updatedMetadata ? registryBefore.skills[updatedMetadata.skill_id] : undefined
    const previousTargets = { ...(previousRegistryEntry?.targets ?? {}) }
    delete previousTargets[plan.sourceScope === 'local' ? `folder:${plan.sourcePath}` : 'canonical']
    const nextRegistry = updatedMetadata ? {
      ...registryBefore,
      skills: {
        ...registryBefore.skills,
        [updatedMetadata.skill_id]: {
          current_name: record.name,
          aliases: previousRegistryEntry?.aliases ?? [],
          version: updatedMetadata.version,
          content_sha256: updatedMetadata.content_sha256,
          usage_count: previousRegistryEntry?.usage_count ?? 0,
          ...(previousRegistryEntry?.last_used_at ? { last_used_at: previousRegistryEntry.last_used_at } : {}),
          targets: {
            ...previousTargets,
            [targetLocalOnly ? `folder:${plan.destinationPath}` : 'canonical']: {
              kind: targetLocalOnly ? 'folder' as const : 'canonical' as const,
              path: plan.destinationPath,
              status: 'copied' as const,
              version: updatedMetadata.version,
              content_sha256: updatedMetadata.content_sha256,
              synced_at: new Date().toISOString(),
            },
          },
        },
      },
    } : registryBefore
    const savedRegistry = updatedMetadata ? await registryStore.write(nextRegistry, registryBefore.revision) : registryBefore
    registryRevision = savedRegistry.revision
    const baseRecord = {
      id: record.id,
      name: record.name,
      kind: 'user' as const,
      contentHash: finalFingerprint.contentHash,
      businessContentHash: finalFingerprint.businessContentHash,
      ...(updatedMetadata ? { manager: {
        skillId: updatedMetadata.skill_id,
        version: updatedMetadata.version,
        localOnly: targetLocalOnly,
        managedBy: updatedMetadata.managed_by,
        contentSha256: updatedMetadata.content_sha256,
      } } : {}),
      updatedAt: new Date().toISOString(),
    }
    const sharedRecord: ManagedSkillRecord = { ...baseRecord, canonicalPath: plan.destinationPath }
    const localRecord: ManagedLocalSkillRecord = { ...baseRecord, canonicalPath: plan.destinationPath, localPath: plan.destinationPath }
    const savedManifest = await manifestStore.write({
      ...manifest,
      skills: plan.targetScope === 'shared'
        ? [...manifest.skills.filter(skill => skill.id !== record.id), sharedRecord]
        : manifest.skills.filter(skill => skill.id !== record.id),
      localSkills: plan.targetScope === 'local'
        ? [...(manifest.localSkills ?? []).filter(skill => skill.id !== record.id), localRecord]
        : (manifest.localSkills ?? []).filter(skill => skill.id !== record.id),
    }, manifest.revision)
    await rm(backup, { recursive: true, force: true })
    return {
      id: randomUUID(),
      planHash: plan.hash,
      appliedAt: new Date().toISOString(),
      skillId: record.id,
      destinationPath: plan.destinationPath,
      manifestRevision: savedManifest.revision,
      registryRevision,
    }
  } catch (error) {
    const rollbackErrors: unknown[] = []
    try {
      if (destinationApplied) await rm(plan.destinationPath, { recursive: true, force: true })
      if (sourceMoved && await pathExists(backup)) await rename(backup, plan.sourcePath)
      if (registryRevision !== registryBefore.revision) await registryStore.write(registryBefore, registryRevision)
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }
    await rm(dirname(staging), { recursive: true, force: true }).catch(() => undefined)
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], 'Skill 范围迁移失败且自动恢复不完整。')
    throw error
  }
}
