import { join } from 'node:path'
import {
  applySystemSkillRepairPlan,
  createSystemSkillRepairPlan,
  inspectSystemSkillManager,
  type SystemSkillRepairPlan,
  type SystemSkillRepairReceipt,
} from './builtin-skill-manager.js'
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
import {
  applyCanonicalSourceMutationPlan,
  createCanonicalSourceMutationPlan,
  listCanonicalSkillsBackups,
  type CanonicalSkillsBackup,
  type CanonicalSourceAction,
  type CanonicalSourceMutationPlan,
  type CanonicalSourceMutationReceipt,
} from './canonical-source-manager.js'
import { applyCustomLinkPlan, createCustomLinkPlan } from './custom-link-manager.js'
import { applySkillCustomRootRemovalPlan, createSkillCustomRootRemovalPlan } from './custom-root-manager.js'
import { applySkillsBatchPlan, listSkillsReceipts, rollbackSkillsReceipt } from './skills-executor.js'
import { applySkillFileUpdatePlan, createSkillFileUpdatePlan, inspectManagedSkillDetail, readManagedSkillFile } from './skill-file-manager.js'
import { applySkillCopyBatchPlan, createSkillCopyBatchPlan } from './skill-copy-manager.js'
import {
  applyLocalSkillMigrationPlan,
  createLocalSkillMigrationPlan,
  type LocalSkillMigrationPlan,
  type LocalSkillMigrationReceipt,
} from './local-skill-manager.js'
import { SkillsManifestStore } from './manifest-store.js'
import { applyPlatformLinkPlan, createPlatformLinkPlan } from './platform-link-manager.js'
import { detectSkillPlatforms, scanSkills, supportedSkillPlatforms } from './scanner.js'
import { createSkillsBatchPlan } from './skills-planner.js'
import { SkillManagerRegistryStore, type SkillStatsReport, type SkillUsagePlan, type SkillUsageReceipt } from './skill-manager-registry.js'
import { inspectManagedPlatformBinding, inspectManagedSkill } from './skills-verifier.js'
import type {
  CustomLinkAction,
  CustomLinkPlan,
  CustomLinkReceipt,
  ManagedPlatformBinding,
  ManagedPlatformHealth,
  PlatformLinkAction,
  PlatformLinkPlan,
  PlatformLinkReceipt,
  PlatformBindingResult,
  ManagedSkillDetail,
  ManagedSkillFile,
  SkillCustomRootRemovalPlan,
  SkillCustomRootRemovalReceipt,
  SkillDecision,
  SkillManagementChoice,
  SkillCopyBatchPlan,
  SkillCopyBatchReceipt,
  SkillCopySelection,
  SkillFileUpdatePlan,
  SkillFileUpdateReceipt,
  SkillBackupMove,
  SkillsBatchMode,
  SkillPlatformId,
  SkillsBatchPlan,
  SkillsBatchReceipt,
  SkillsBootstrap,
  SkillsScanReport,
} from './skill-types.js'

/** 最近一次平台接入结果及发生时间。 */
interface LatestPlatformAttempt {
  /** 平台接入结果。 */
  result: PlatformBindingResult
  /** 批次完成时间。 */
  attemptedAt: string
}

/**
 * 从事务回执中提取每个平台最近一次接入结果。
 * @param receipts 已按时间倒序排列的事务回执。
 * @returns 平台到最近一次尝试的映射。
 */
function collectLatestPlatformAttempts(receipts: SkillsBatchReceipt[]): Map<SkillPlatformId, LatestPlatformAttempt> {
  const attempts = new Map<SkillPlatformId, LatestPlatformAttempt>()
  for (const receipt of receipts) {
    for (const result of receipt.platformResults) {
      if (!attempts.has(result.platform)) attempts.set(result.platform, { result, attemptedAt: receipt.appliedAt })
    }
  }
  return attempts
}

/**
 * 从历史回执中恢复旧 manifest 未保存的平台原目录备份关系。
 * @param receipts 已按时间倒序排列的事务回执。
 * @returns 平台到最近有效原目录备份的映射。
 */
function collectOriginalRootBackups(receipts: SkillsBatchReceipt[]): Map<SkillPlatformId, SkillBackupMove> {
  const backups = new Map<SkillPlatformId, SkillBackupMove>()
  for (const receipt of receipts) {
    for (const result of receipt.platformResults) {
      if (result.status === 'applied' && result.backup && !backups.has(result.platform)) backups.set(result.platform, result.backup)
    }
  }
  return backups
}

/**
 * 为旧 manifest 中的平台绑定补回原目录备份关系。
 * @param bindings manifest 保存的平台绑定。
 * @param backups 从历史回执恢复出的原目录备份。
 * @returns 可用于校验和展示的完整绑定。
 */
function hydratePlatformBindings(bindings: ManagedPlatformBinding[], backups: ReadonlyMap<SkillPlatformId, SkillBackupMove>): ManagedPlatformBinding[] {
  return bindings.map((binding) => binding.originalRootBackup || !backups.has(binding.platform)
    ? binding
    : { ...binding, originalRootBackup: backups.get(binding.platform) })
}

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
  /** 用户明确选择的版本管理动作；未传时全部保持原状。 */
  managementChoices?: SkillManagementChoice[]
  /** connect 接入平台根目录，sync 只更新统一源。 */
  mode?: SkillsBatchMode
  /** 用户明确选择建立根目录软链的平台。 */
  linkPlatforms?: SkillPlatformId[]
  /** 用户明确选择建立统一源软链的自定义目录。 */
  linkCustomRoots?: string[]
}

/** Skills 生命周期共享服务。 */
export class SkillsManager {
  /** manifest 存储。 */
  readonly manifestStore: SkillsManifestStore
  /** Skill Manager registry 存储。 */
  readonly registryStore: SkillManagerRegistryStore

  /**
   * 创建 Skills 管理服务。
   * @param context 用户与 AskX 数据目录。
   */
  constructor(readonly context: ModuleContext) {
    this.manifestStore = new SkillsManifestStore(context.dataDir)
    this.registryStore = new SkillManagerRegistryStore(context.dataDir)
  }

  /** 读取首次页面所需的只读状态。 */
  async bootstrap(): Promise<SkillsBootstrap> {
    const manifest = await this.manifestStore.read()
    const managedSkills = manifest?.skills ?? []
    const receipts = await listSkillsReceipts(this.context.dataDir)
    const originalRootBackups = collectOriginalRootBackups(receipts)
    const bindings = hydratePlatformBindings(manifest?.platformBindings ?? [], originalRootBackups)
    const attempts = collectLatestPlatformAttempts(receipts)
    const platformHealth: ManagedPlatformHealth[] = []
    const systemSkillHealth = (await inspectSystemSkillManager(this.context.dataDir)).health
    for (const platform of supportedSkillPlatforms) {
      const binding = bindings.find((entry) => entry.platform === platform)
      const attempt = attempts.get(platform)
      if (binding) {
        const health = await inspectManagedPlatformBinding(binding)
        platformHealth.push({
          ...health,
          ...(attempt ? { lastAttemptAt: attempt.attemptedAt } : {}),
          ...(health.connected || !attempt?.result.warnings.length
            ? {}
            : { issues: [...health.issues, ...attempt.result.warnings] }),
        })
        continue
      }
      if (attempt?.result.status === 'failed') {
        platformHealth.push({
          platform,
          status: 'failed',
          connected: false,
          issues: [...attempt.result.warnings],
          lastAttemptAt: attempt.attemptedAt,
        })
        continue
      }
      platformHealth.push({ platform, status: 'pending', connected: false, issues: [] })
    }
    return {
      initialized: Boolean(manifest?.initializedAt && !manifest.migrationRequired),
      manifestRevision: manifest?.revision ?? 0,
      canonicalSkillsDir: join(this.context.dataDir, 'skills'),
      localSkillsDir: join(this.context.dataDir, 'local-skills'),
      systemSkillHealth,
      platforms: await detectSkillPlatforms(this.context.homeDir),
      managedSkills,
      localSkills: manifest?.localSkills ?? [],
      managedHealth: await Promise.all(managedSkills.map(inspectManagedSkill)),
      customRoots: manifest?.customRoots ?? [],
      platformBindings: bindings,
      customLinkBindings: manifest?.customLinkBindings ?? [],
      platformHealth,
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
    const registry = await this.registryStore.read()
    return createSkillsBatchPlan({
      report,
      settingsRevision: request.settingsRevision,
      manifestRevision: manifest?.revision ?? 0,
      registryRevision: registry?.revision ?? 0,
      mode: request.mode ?? 'connect',
      ...(request.linkPlatforms ? { linkPlatforms: request.linkPlatforms } : {}),
      linkPlatformStatuses: await detectSkillPlatforms(this.context.homeDir),
      ...(request.linkCustomRoots ? { linkCustomRoots: request.linkCustomRoots } : {}),
      decisions: request.decisions,
      ...(request.managementChoices ? { managementChoices: request.managementChoices } : {}),
      dataDir: this.context.dataDir,
    })
  }

  /** 读取本机 Skill 版本、usage 与同步状态统计。 */
  stats(): Promise<SkillStatsReport> {
    return this.registryStore.stats()
  }

  /** 为一次显式 usage 记录生成确认计划。 */
  planUsage(nameOrId: string): Promise<SkillUsagePlan> {
    return this.registryStore.planUsage(nameOrId)
  }

  /** 应用一次经过用户确认的 usage 记录。 */
  applyUsage(plan: SkillUsagePlan, consent: UserConsent): Promise<SkillUsageReceipt> {
    return this.registryStore.applyUsage(plan, consent)
  }

  /** 为缺失、损坏或过期的默认 Skill Manager 生成修复计划。 */
  planSystemSkillRepair(): Promise<SystemSkillRepairPlan> {
    return createSystemSkillRepairPlan(this.manifestStore)
  }

  /** 应用一次经过用户确认的默认 Skill Manager 修复。 */
  applySystemSkillRepair(plan: SystemSkillRepairPlan, consent: UserConsent): Promise<SystemSkillRepairReceipt> {
    return applySystemSkillRepairPlan(this.manifestStore, plan, consent)
  }

  /** 为本地专属 Skill 迁移到共享统一源生成计划。 */
  planLocalSkillMigration(skillId: string): Promise<LocalSkillMigrationPlan> {
    return createLocalSkillMigrationPlan(this.manifestStore, skillId)
  }

  /** 应用一次经过确认的本地专属 Skill 迁移。 */
  applyLocalSkillMigration(plan: LocalSkillMigrationPlan, consent: UserConsent): Promise<LocalSkillMigrationReceipt> {
    return applyLocalSkillMigrationPlan(this.manifestStore, plan, consent)
  }

  /**
   * 应用一次经过确认的批量计划。
   * @param plan 完整批量计划。
   * @param settingsRevision 当前共享设置 revision。
   * @param consent 与计划 hash 对应的用户授权。
   */
  async applyOnboarding(plan: SkillsBatchPlan, settingsRevision: number, consent: UserConsent): Promise<SkillsBatchReceipt> {
    if (consent.planHash !== plan.hash) throw new Error('用户授权与当前 Skills 计划不匹配。')
    return await applySkillsBatchPlan({
      plan,
      settingsRevision,
      homeDir: this.context.homeDir,
      dataDir: this.context.dataDir,
      manifestStore: this.manifestStore,
    })
  }

  /**
   * 生成一个平台根目录软链的停用或恢复计划。
   * @param platform 目标平台。
   * @param action 停用或恢复操作。
   */
  async planPlatformLink(platform: SkillPlatformId, action: PlatformLinkAction): Promise<PlatformLinkPlan> {
    const originalRootBackups = collectOriginalRootBackups(await listSkillsReceipts(this.context.dataDir))
    return createPlatformLinkPlan({ manifestStore: this.manifestStore, originalRootBackups }, platform, action)
  }

  /**
   * 应用一个经过确认的平台软链计划。
   * @param plan 平台软链计划。
   * @param consent 与计划 hash 对应的用户授权。
   */
  async applyPlatformLink(plan: PlatformLinkPlan, consent: UserConsent): Promise<PlatformLinkReceipt> {
    const originalRootBackups = collectOriginalRootBackups(await listSkillsReceipts(this.context.dataDir))
    return applyPlatformLinkPlan({ manifestStore: this.manifestStore, originalRootBackups }, plan, consent)
  }

  /**
   * 生成一个自定义目录软链的取消、恢复或删除计划。
   * @param bindingId Manifest 中的自定义绑定标识。
   * @param action 取消、恢复或删除操作。
   */
  planCustomLink(bindingId: string, action: CustomLinkAction): Promise<CustomLinkPlan> {
    return createCustomLinkPlan({ manifestStore: this.manifestStore }, bindingId, action)
  }

  /**
   * 应用一个经过确认的自定义目录软链计划。
   * @param plan 自定义软链计划。
   * @param consent 与计划 hash 对应的用户授权。
   */
  applyCustomLink(plan: CustomLinkPlan, consent: UserConsent): Promise<CustomLinkReceipt> {
    return applyCustomLinkPlan({ manifestStore: this.manifestStore }, plan, consent)
  }

  /**
   * 为移除一个自定义扫描来源生成确认计划。
   * @param rootId 要移除的扫描来源标识。
   */
  planCustomRootRemoval(rootId: string): Promise<SkillCustomRootRemovalPlan> {
    return createSkillCustomRootRemovalPlan({ manifestStore: this.manifestStore }, rootId)
  }

  /**
   * 应用经过确认的自定义扫描来源移除计划。
   * @param plan 已展示给用户的完整计划。
   * @param consent 与计划 hash 对应的用户授权。
   */
  applyCustomRootRemoval(plan: SkillCustomRootRemovalPlan, consent: UserConsent): Promise<SkillCustomRootRemovalReceipt> {
    return applySkillCustomRootRemovalPlan({ manifestStore: this.manifestStore }, plan, consent)
  }

  /**
   * 读取一个受管 Skill 的元数据和目录结构。
   * @param skillId 受管 Skill 标识。
   */
  inspectSkill(skillId: string): Promise<ManagedSkillDetail> {
    return inspectManagedSkillDetail({ manifestStore: this.manifestStore }, skillId)
  }

  /**
   * 读取受管 Skill 中的 UTF-8 文本文件。
   * @param skillId 受管 Skill 标识。
   * @param path 相对于 Skill 根目录的文件路径。
   */
  readSkillFile(skillId: string, path: string): Promise<ManagedSkillFile> {
    return readManagedSkillFile({ manifestStore: this.manifestStore }, skillId, path)
  }

  /**
   * 为受管 Skill 文件更新生成确认计划。
   * @param skillId 受管 Skill 标识。
   * @param path 相对于 Skill 根目录的文件路径。
   * @param nextContent 下一份 UTF-8 文本。
   * @param previousContentHash 页面读取时的文件指纹。
   */
  planSkillFileUpdate(skillId: string, path: string, nextContent: string, previousContentHash: string): Promise<SkillFileUpdatePlan> {
    return createSkillFileUpdatePlan({ manifestStore: this.manifestStore }, skillId, path, nextContent, previousContentHash)
  }

  /**
   * 应用经过确认的受管 Skill 文件更新。
   * @param plan 文件更新计划。
   * @param consent 与计划 hash 对应的用户授权。
   */
  applySkillFileUpdate(plan: SkillFileUpdatePlan, consent: UserConsent): Promise<SkillFileUpdateReceipt> {
    return applySkillFileUpdatePlan({ manifestStore: this.manifestStore }, plan, consent)
  }

  /**
   * 为多个统一源 Skill 和目标组合生成批量同步确认计划。
   * @param selections Skill 与目标组合及冲突策略。
   */
  planSkillCopyBatch(selections: SkillCopySelection[]): Promise<SkillCopyBatchPlan> {
    return createSkillCopyBatchPlan({ homeDir: this.context.homeDir, manifestStore: this.manifestStore }, selections)
  }

  /**
   * 应用经过确认的批量同步计划。
   * @param plan 批量同步计划。
   * @param consent 与批量计划 hash 对应的用户授权。
   */
  applySkillCopyBatch(plan: SkillCopyBatchPlan, consent: UserConsent): Promise<SkillCopyBatchReceipt> {
    return applySkillCopyBatchPlan({ homeDir: this.context.homeDir, manifestStore: this.manifestStore }, plan, consent)
  }

  /** 列出统一 Skill 来源的用户可管理备份。 */
  canonicalBackups(): Promise<CanonicalSkillsBackup[]> {
    return listCanonicalSkillsBackups({ manifestStore: this.manifestStore })
  }

  /**
   * 为统一源清空、备份恢复或永久删除生成确认计划。
   * @param action 二次操作类型。
   * @param backupVersion 要恢复或永久删除的备份版本。
   */
  planCanonicalSource(action: CanonicalSourceAction, backupVersion?: string): Promise<CanonicalSourceMutationPlan> {
    return createCanonicalSourceMutationPlan({ manifestStore: this.manifestStore }, action, backupVersion)
  }

  /**
   * 应用经过确认的统一源二次操作计划。
   * @param plan 已重新校验的完整计划。
   * @param consent 与计划 hash 对应的用户授权。
   */
  applyCanonicalSource(plan: CanonicalSourceMutationPlan, consent: UserConsent): Promise<CanonicalSourceMutationReceipt> {
    return applyCanonicalSourceMutationPlan({ manifestStore: this.manifestStore }, plan, consent)
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
