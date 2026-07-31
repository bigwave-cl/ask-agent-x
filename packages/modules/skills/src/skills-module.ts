import { join } from 'node:path'
import {
  createActionPlan,
  stableHash,
  type ActionPlan,
  type ActionReceipt,
  type AskXModule,
  type DetectionReport,
  type ModuleContext,
  type RollbackResult,
  type UserConsent,
} from '@askx/core'
import { applySkillsBatchPlan, listSkillsReceipts, rollbackSkillsReceipt } from './skills-executor.js'
import { SkillsManifestStore } from './manifest-store.js'
import { detectSkillPlatforms, scanSkills, supportedSkillPlatforms } from './scanner.js'
import { createSkillsBatchPlan } from './skills-planner.js'
import { inspectManagedSkill } from './skills-verifier.js'
import type {
  SkillDecision,
  SkillPlatformId,
  SkillsBatchPlan,
  SkillsBatchReceipt,
  SkillsBootstrap,
  SkillsScanReport,
} from './skill-types.js'

/** 创建接管计划的输入。 */
export interface SkillsPlanRequest {
  /** 用户选择的平台。 */
  platforms: SkillPlatformId[]
  /** 用户额外选择的只读扫描目录。 */
  customRoots?: string[]
  /** 页面基于的扫描指纹。 */
  detectionFingerprint: string
  /** 当前共享设置 revision。 */
  settingsRevision: number
  /** 用户的全部决策。 */
  decisions: SkillDecision[]
}

/** Skills 生命周期共享服务。 */
export class SkillsManager {
  /** manifest 存储。 */
  readonly manifestStore: SkillsManifestStore

  /**
   * 创建 Skills 管理服务。
   * @param context 用户与 AskX 数据目录。
   */
  constructor(readonly context: ModuleContext) {
    this.manifestStore = new SkillsManifestStore(context.dataDir)
  }

  /** 读取首次页面所需的只读状态。 */
  async bootstrap(): Promise<SkillsBootstrap> {
    const manifest = await this.manifestStore.read()
    const managedSkills = manifest?.skills ?? []
    return {
      initialized: Boolean(manifest?.initializedAt),
      manifestRevision: manifest?.revision ?? 0,
      canonicalSkillsDir: join(this.context.dataDir, 'skills'),
      platforms: await detectSkillPlatforms(this.context.homeDir),
      managedSkills,
      managedHealth: await Promise.all(managedSkills.map(inspectManagedSkill)),
    }
  }

  /**
   * 扫描用户明确选择的平台。
   * @param platforms 本次管理平台。
   * @param customRoots 用户额外选择的只读扫描目录。
   */
  scan(platforms: SkillPlatformId[], customRoots: string[] = []): Promise<SkillsScanReport> {
    return scanSkills(this.context.homeDir, this.context.dataDir, platforms, customRoots)
  }

  /**
   * 基于最新扫描结果生成计划。
   * @param request 平台、指纹、revision 与用户决策。
   */
  async planOnboarding(request: SkillsPlanRequest): Promise<SkillsBatchPlan> {
    const report = await this.scan(request.platforms, request.customRoots ?? [])
    if (report.fingerprint !== request.detectionFingerprint) throw new Error('本地 Skill 已经变化，请重新扫描。')
    const manifest = await this.manifestStore.read()
    return createSkillsBatchPlan({
      report,
      settingsRevision: request.settingsRevision,
      manifestRevision: manifest?.revision ?? 0,
      decisions: request.decisions,
      dataDir: this.context.dataDir,
    })
  }

  /**
   * 应用一次经过确认的批量计划。
   * @param plan 完整批量计划。
   * @param settingsRevision 当前共享设置 revision。
   */
  applyOnboarding(plan: SkillsBatchPlan, settingsRevision: number): Promise<SkillsBatchReceipt> {
    return applySkillsBatchPlan({
      plan,
      settingsRevision,
      homeDir: this.context.homeDir,
      dataDir: this.context.dataDir,
      manifestStore: this.manifestStore,
    })
  }

  /** 列出已完成事务。 */
  history(): Promise<SkillsBatchReceipt[]> {
    return listSkillsReceipts(this.context.dataDir)
  }

  /**
   * 回滚一个完整 Skills 批次。
   * @param receiptId 批次回执标识。
   */
  rollbackReceipt(receiptId: string): Promise<RollbackResult> {
    return rollbackSkillsReceipt(this.context.dataDir, this.manifestStore, receiptId)
  }
}

/** 兼容 Core 模块注册表的 Skills 模块入口。 */
export class SkillsModule implements AskXModule {
  /** 模块 ID。 */
  readonly id = 'skills'
  /** 模块名称。 */
  readonly name = 'Skills'

  /** 执行默认三平台只读检测。 */
  async detect(context: ModuleContext): Promise<DetectionReport<SkillsScanReport>> {
    const report = await scanSkills(context.homeDir, context.dataDir, supportedSkillPlatforms)
    const issues = report.groups.flatMap((group) => {
      if (group.status === 'conflict') return [{ code: 'SKILL_CONTENT_CONFLICT', message: `Skill ${group.name} 在不同平台内容不一致。` }]
      if (group.status === 'broken') return [{ code: 'BROKEN_SKILL_LINK', message: `Skill ${group.name} 包含失效软链。` }]
      if (group.status === 'invalid') return [{ code: 'INVALID_SKILL', message: `Skill ${group.name} 的 SKILL.md 无效。` }]
      return []
    })
    return {
      moduleId: this.id,
      status: issues.length ? 'warning' : 'ok',
      observedAt: report.scannedAt,
      fingerprint: report.fingerprint,
      issues,
      data: report,
    }
  }

  /** 为兼容模块契约生成不可直接执行的通用计划。 */
  async plan(action: string, input: unknown): Promise<ActionPlan> {
    return createActionPlan({ moduleId: this.id, action, detectionFingerprint: stableHash(input), input })
  }

  /** 写操作必须通过 SkillsManager 的强类型入口。 */
  async apply(_plan: ActionPlan, _consent: UserConsent): Promise<ActionReceipt> {
    throw new Error('请通过 SkillsManager 应用强类型 Skills 计划。')
  }

  /** 通用模块入口没有可回滚回执。 */
  async rollback(receipt: ActionReceipt): Promise<RollbackResult> {
    return { receiptId: receipt.id, rolledBack: false, restoredPaths: [], warnings: ['请使用 Skills 事务回执执行回滚。'] }
  }
}
