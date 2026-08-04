import { randomUUID } from 'node:crypto'
import { stableHash, type UserConsent } from '@askx/core'
import type { SkillsManifestStore } from './manifest-store.js'
import {
  skillCustomRootRemovalPlanSchema,
  type SkillCustomRootRemovalPlan,
  type SkillCustomRootRemovalReceipt,
} from './skill-types.js'

/** 自定义扫描来源管理依赖。 */
export interface SkillCustomRootManagerDependencies {
  /** Skills manifest 存储。 */
  manifestStore: SkillsManifestStore
}

/**
 * 创建移除自定义扫描来源的确认计划。
 * @param dependencies manifest 存储依赖。
 * @param rootId 要移除的扫描来源标识。
 * @returns 只修改来源登记、不触碰 Skill 内容的确认计划。
 */
export async function createSkillCustomRootRemovalPlan(
  dependencies: SkillCustomRootManagerDependencies,
  rootId: string,
): Promise<SkillCustomRootRemovalPlan> {
  const manifest = await dependencies.manifestStore.read()
  if (!manifest) throw new Error('Skills 尚未完成初始化。')
  const root = (manifest.customRoots ?? []).find((entry) => entry.id === rootId)
  if (!root) throw new Error('找不到要移除的自定义扫描来源。')
  const unsigned = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    root,
    manifestRevision: manifest.revision,
  }
  return { ...unsigned, hash: stableHash(unsigned) }
}

/**
 * 应用经过确认的自定义扫描来源移除计划。
 * @param dependencies manifest 存储依赖。
 * @param plan 已展示给用户的完整计划。
 * @param consent 与计划 hash 对应的用户授权。
 * @returns 只移除默认扫描来源登记的操作回执。
 */
export async function applySkillCustomRootRemovalPlan(
  dependencies: SkillCustomRootManagerDependencies,
  plan: SkillCustomRootRemovalPlan,
  consent: UserConsent,
): Promise<SkillCustomRootRemovalReceipt> {
  const parsed = skillCustomRootRemovalPlanSchema.parse(plan)
  const { hash, ...unsigned } = parsed
  if (stableHash(unsigned) !== hash) throw new Error('自定义扫描来源计划 hash 校验失败。')
  if (consent.planHash !== hash) throw new Error('用户授权与自定义扫描来源计划不匹配。')

  const manifest = await dependencies.manifestStore.read()
  if (!manifest || manifest.revision !== parsed.manifestRevision) throw new Error('Skills manifest 已经变化，请重新操作。')
  const current = (manifest.customRoots ?? []).find((entry) => entry.id === parsed.root.id)
  if (!current || stableHash(current) !== stableHash(parsed.root)) throw new Error('自定义扫描来源已经变化，请重新操作。')

  const saved = await dependencies.manifestStore.write({
    ...manifest,
    customRoots: (manifest.customRoots ?? []).filter((entry) => entry.id !== parsed.root.id),
  }, manifest.revision)
  return {
    id: randomUUID(),
    planHash: hash,
    appliedAt: new Date().toISOString(),
    root: parsed.root,
    manifestRevision: saved.revision,
  }
}
