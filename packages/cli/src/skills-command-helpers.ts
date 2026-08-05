import type { SkillDecision, SkillsBatchPlan, SkillsScanReport } from '@askx/module-skills/skill-types'

/** CLI 展示的 Skills 批量计划摘要。 */
export interface SkillsBatchPlanSummary {
  /** 扫描到的 Skill 总数。 */
  total: number
  /** 将接管到统一源的数量。 */
  adopt: number
  /** 将按相同内容合并的数量。 */
  merge: number
  /** 保留现状的数量。 */
  keep: number
  /** 因内容冲突而保留现状的数量。 */
  conflicts: number
  /** 将建立根目录绑定的平台数量。 */
  platformLinks: number
  /** 将建立根目录绑定的自定义目录数量。 */
  customLinks: number
}

/**
 * 为 CLI 同步流程生成与 Web 一致的安全默认决策。
 * @param report 最新只读扫描报告。
 * @returns 完整覆盖所有扫描分组的决策。
 */
export function createSafeSyncDecisions(report: SkillsScanReport): SkillDecision[] {
  return report.groups.map((group) => {
    const source = group.locations.find((location) => location.metadata.valid && !location.broken)
    if (group.recommendedAction === 'adopt' && source) return { kind: 'adopt', sourceLocationId: source.id }
    if (group.recommendedAction === 'merge' && source) return { kind: 'merge', sourceLocationId: source.id }
    return { kind: 'keep', groupId: group.id }
  })
}

/**
 * 为只建立软链的流程生成不改动 Skill 内容的决策。
 * @param report 最新只读扫描报告。
 * @returns 全部保留现状的决策。
 */
export function createKeepDecisions(report: SkillsScanReport): SkillDecision[] {
  return report.groups.map((group) => ({ kind: 'keep', groupId: group.id }))
}

/**
 * 汇总一个 Skills 批量计划，供人类终端确认。
 * @param plan 已生成且尚未授权的计划。
 * @param report 生成该计划时使用的扫描报告。
 * @returns 可稳定展示的计划数量摘要。
 */
export function summarizeSkillsBatchPlan(plan: SkillsBatchPlan, report: SkillsScanReport): SkillsBatchPlanSummary {
  const conflicts = new Set(report.groups.filter((group) => group.status === 'conflict').map((group) => group.id))
  return {
    total: plan.units.length,
    adopt: plan.units.filter((unit) => unit.decision.kind === 'adopt').length,
    merge: plan.units.filter((unit) => unit.decision.kind === 'merge').length,
    keep: plan.units.filter((unit) => unit.decision.kind === 'keep').length,
    conflicts: plan.units.filter((unit) => unit.decision.kind === 'keep' && conflicts.has(unit.decision.groupId)).length,
    platformLinks: plan.platformOperations.length,
    customLinks: plan.customLinkOperations.length,
  }
}
