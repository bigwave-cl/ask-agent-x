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
import type { ManagedSkillRecord } from './skill-types.js'

/** 本地专属 Skill 迁移到共享源的计划。 */
export interface LocalSkillMigrationPlan {
  /** 计划标识。 */
  id: string
  /** 计划创建时间。 */
  createdAt: string
  /** 本地专属 Skill 标识。 */
  skillId: string
  /** Skill 名称。 */
  skillName: string
  /** 本地专属来源路径。 */
  sourcePath: string
  /** 共享统一源目标路径。 */
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

/** 本地专属 Skill 迁移回执。 */
export interface LocalSkillMigrationReceipt {
  /** 回执标识。 */
  id: string
  /** 对应计划 hash。 */
  planHash: string
  /** 迁移完成时间。 */
  appliedAt: string
  /** 已迁移 Skill 标识。 */
  skillId: string
  /** 共享统一源路径。 */
  destinationPath: string
  /** 更新后的 manifest revision。 */
  manifestRevision: number
  /** 更新后的 registry revision。 */
  registryRevision: number
}

/** 本地专属 Skill 迁移计划运行时 schema。 */
export const localSkillMigrationPlanSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  skillId: z.string().min(1),
  skillName: z.string().min(1),
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

/** 为本地专属 Skill 迁移生成只读确认计划。 */
export async function createLocalSkillMigrationPlan(manifestStore: SkillsManifestStore, skillId: string): Promise<LocalSkillMigrationPlan> {
  const manifest = await manifestStore.read()
  if (!manifest) throw new Error('Skills 管理尚未初始化。')
  const record = manifest.localSkills?.find((skill) => skill.id === skillId)
  if (!record) throw new Error('本地专属 Skill 不存在。')
  const fingerprint = await fingerprintManagedSkill(record.localPath)
  if (fingerprint.contentHash !== record.contentHash) throw new Error('本地专属 Skill 已经变化，请刷新后重试。')
  const destinationPath = join(manifestStore.dataDir, 'skills', record.name)
  if (await pathExists(destinationPath)) throw new Error(`共享统一源已存在同名 Skill：${record.name}`)
  const registryRevision = (await new SkillManagerRegistryStore(manifestStore.dataDir).read())?.revision ?? 0
  const unsigned = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    skillId,
    skillName: record.name,
    sourcePath: record.localPath,
    destinationPath,
    contentHash: fingerprint.contentHash,
    manifestRevision: manifest.revision,
    registryRevision,
  }
  return { ...unsigned, hash: stableHash(unsigned) }
}

/** 应用一次经过确认的本地专属 Skill 迁移，失败时恢复来源和索引。 */
export async function applyLocalSkillMigrationPlan(
  manifestStore: SkillsManifestStore,
  inputPlan: LocalSkillMigrationPlan,
  consent: UserConsent,
): Promise<LocalSkillMigrationReceipt> {
  const plan = localSkillMigrationPlanSchema.parse(inputPlan)
  const { hash, ...unsigned } = plan
  if (stableHash(unsigned) !== hash || consent.planHash !== hash) throw new Error('本地 Skill 迁移授权与当前计划不匹配。')
  const manifest = await manifestStore.read()
  const record = manifest?.localSkills?.find((skill) => skill.id === plan.skillId)
  if (!manifest || !record || manifest.revision !== plan.manifestRevision || record.localPath !== plan.sourcePath) {
    throw new Error('本地 Skill 或 manifest 已经变化，请重新生成计划。')
  }
  if ((await fingerprintManagedSkill(record.localPath)).contentHash !== plan.contentHash || await pathExists(plan.destinationPath)) {
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
    await cp(record.localPath, staging, { recursive: true, dereference: false, preserveTimestamps: true })
    const manager = await inspectSkillManagerMetadata(staging)
    if (!manager.metadata || !manager.metadata.local_only) throw new Error('本地 Skill 缺少有效的 local-only manager 身份。')
    await ensureAskxManagedDeclaration(staging, false)
    const fingerprint = await fingerprintManagedSkill(staging)
    const updatedMetadata = updateSkillManagerMetadata(manager.metadata, fingerprint.businessContentHash, { localOnly: false })
    await writeSkillManagerMetadata(staging, updatedMetadata)
    const finalFingerprint = await fingerprintManagedSkill(staging)
    await mkdir(dirname(backup), { recursive: true, mode: 0o700 })
    await rename(record.localPath, backup)
    sourceMoved = true
    await rename(staging, plan.destinationPath)
    destinationApplied = true
    const previousRegistryEntry = registryBefore.skills[updatedMetadata.skill_id]
    const savedRegistry = await registryStore.write({
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
            ...(previousRegistryEntry?.targets ?? {}),
            canonical: {
              kind: 'canonical',
              path: plan.destinationPath,
              status: 'copied',
              version: updatedMetadata.version,
              content_sha256: updatedMetadata.content_sha256,
              synced_at: new Date().toISOString(),
            },
          },
        },
      },
    }, registryBefore.revision)
    registryRevision = savedRegistry.revision
    const sharedRecord: ManagedSkillRecord = {
      id: record.id,
      name: record.name,
      kind: 'user',
      canonicalPath: plan.destinationPath,
      contentHash: finalFingerprint.contentHash,
      businessContentHash: finalFingerprint.businessContentHash,
      manager: {
        skillId: updatedMetadata.skill_id,
        version: updatedMetadata.version,
        localOnly: false,
        managedBy: updatedMetadata.managed_by,
        contentSha256: updatedMetadata.content_sha256,
      },
      updatedAt: new Date().toISOString(),
    }
    const savedManifest = await manifestStore.write({
      ...manifest,
      skills: [...manifest.skills, sharedRecord],
      localSkills: (manifest.localSkills ?? []).filter((skill) => skill.id !== record.id),
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
      if (sourceMoved && await pathExists(backup)) await rename(backup, record.localPath)
      if (registryRevision !== registryBefore.revision) await registryStore.write(registryBefore, registryRevision)
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }
    await rm(dirname(staging), { recursive: true, force: true }).catch(() => undefined)
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], '本地 Skill 迁移失败且自动恢复不完整。')
    throw error
  }
}
