import { randomUUID } from 'node:crypto'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { stableHash } from '@askx/core'
import { MAX_CUSTOM_SKILL_DIRECTORIES, skillDecisionSchema, skillsBatchPlanSchema, type SkillDecision, type SkillPlanOperation, type SkillPlanUnit, type SkillPlatformId, type SkillPlatformStatus, type SkillsBatchMode, type SkillsBatchPlan, type SkillsScanReport } from './skill-types.js'

/** 计划输入。 */
export interface CreateSkillsPlanInput {
  /** 最新扫描报告。 */
  report: SkillsScanReport
  /** 当前共享设置版本。 */
  settingsRevision: number
  /** 当前 manifest 版本。 */
  manifestRevision: number
  /** 批量计划模式。 */
  mode: SkillsBatchMode
  /** 用户明确选择接入软链的平台；为空时只同步统一源。 */
  linkPlatforms?: SkillPlatformId[]
  /** AskX 支持的全部平台状态，不受本次扫描来源限制。 */
  linkPlatformStatuses: SkillPlatformStatus[]
  /** 用户明确选择接入统一源的自定义目录。 */
  linkCustomRoots?: string[]
  /** 用户决策。 */
  decisions: SkillDecision[]
  /** AskX 数据目录。 */
  dataDir: string
}

/**
 * 查找决策涉及的分组。
 * @param report 扫描报告。
 * @param decision 用户决策。
 * @returns 对应分组。
 */
function resolveDecisionGroup(report: SkillsScanReport, decision: SkillDecision) {
  if (decision.kind === 'keep') return report.groups.find((group) => group.id === decision.groupId)
  const locationId = decision.kind === 'archive' ? decision.locationIds[0] : decision.sourceLocationId
  return report.groups.find((group) => group.locations.some((location) => location.id === locationId))
}

/**
 * 将一个决策转为可解释的事务单元。
 * @param input 计划上下文。
 * @param decision 用户决策。
 * @returns 单个 Skill 事务单元。
 */
function createUnit(input: CreateSkillsPlanInput, decision: SkillDecision): SkillPlanUnit {
  const group = resolveDecisionGroup(input.report, decision)
  if (!group) throw new Error('决策引用了不存在的 Skill。')
  const locations = input.report.locations
  const location = (id: string) => {
    const resolved = locations.find((entry) => entry.id === id)
    if (!resolved) throw new Error(`无效的 Skill 位置：${id}`)
    return resolved
  }
  const operations: SkillPlanOperation[] = []
  const warnings: string[] = []

  if (decision.kind === 'keep') operations.push({ kind: 'keep' })
  if (decision.kind === 'archive') {
    if (input.mode === 'sync') throw new Error('单平台同步不能归档或修改平台原目录。')
    for (const id of decision.locationIds) {
      const target = location(id)
      if (!group.locations.some((entry) => entry.id === target.id)) throw new Error(`Skill ${group.name} 的归档目标跨越了其他分组。`)
      if (target.platform === 'custom' || target.platform === 'askx') {
        throw new Error(`额外扫描目录和 AskX 统一源不能归档或标记为平台备份：${target.path}`)
      }
      operations.push({ kind: 'archive', path: target.path })
    }
  }
  if (decision.kind === 'adopt' || decision.kind === 'merge') {
    const source = location(decision.sourceLocationId)
    if (!source.metadata.valid || !source.contentHash || source.broken) throw new Error(`Skill ${source.name} 无法作为接管来源。`)
    if (decision.kind === 'merge' && group.status !== 'identical') throw new Error(`Skill ${group.name} 的内容不一致，不能合并。`)
    operations.push({ kind: 'copy-canonical', sourcePath: source.path, targetPath: join(input.dataDir, 'skills', source.name) })
  }
  if (decision.kind === 'replace') {
    const source = location(decision.sourceLocationId)
    if (!source.metadata.valid || !source.contentHash || source.broken) throw new Error(`Skill ${source.name} 无法作为覆盖来源。`)
    if (decision.targetLocationIds.includes(source.id)) throw new Error(`Skill ${group.name} 的统一源不能同时作为覆盖目标。`)
    for (const id of decision.targetLocationIds) {
      const target = location(id)
      if (!group.locations.some((entry) => entry.id === id)) throw new Error(`Skill ${group.name} 的覆盖目标跨越了其他分组。`)
      if (target.platform === 'custom') throw new Error(`额外扫描目录只能作为统一版本来源，不能被覆盖：${target.path}`)
    }
    operations.push({ kind: 'select-source', sourcePath: source.path })
    if (input.mode === 'connect') {
      for (const id of decision.targetLocationIds) operations.push({ kind: 'replace', path: location(id).path })
    }
  }
  if (decision.kind === 'rename-and-adopt') {
    const source = location(decision.sourceLocationId)
    if (!source.metadata.valid || !source.contentHash || source.broken) throw new Error(`Skill ${source.name} 无法重命名接管。`)
    if (input.report.locations.some((entry) => entry.name === decision.newName)) throw new Error(`Skill 名称已存在：${decision.newName}`)
    operations.push({ kind: 'write-renamed', name: decision.newName })
  }
  return { id: randomUUID(), skillName: group.name, decision, operations, warnings }
}

/**
 * 校验决策完整覆盖扫描分组，且不会生成重复统一源。
 * @param report 最新扫描报告。
 * @param decisions 用户提交的全部决策。
 * @returns 决策对应的分组 ID。
 */
function validateDecisionSet(report: SkillsScanReport, decisions: SkillDecision[]): string[] {
  const decisionGroups = decisions.map((decision) => resolveDecisionGroup(report, decision))
  if (decisionGroups.some((group) => !group)) throw new Error('决策引用了不存在的 Skill。')
  const groupIds = decisionGroups.map((group) => group!.id)
  if (groupIds.length !== report.groups.length || new Set(groupIds).size !== report.groups.length) {
    throw new Error('每个扫描分组必须且只能提交一项决策。')
  }
  const canonicalNames = decisions.flatMap((decision) => {
    if (decision.kind === 'keep' || decision.kind === 'archive') return []
    if (decision.kind === 'rename-and-adopt') return [decision.newName]
    const source = report.locations.find((location) => location.id === decision.sourceLocationId)
    return source ? [source.name] : []
  })
  if (new Set(canonicalNames).size !== canonicalNames.length) throw new Error('批次中存在重复的统一源名称。')
  return groupIds
}

/** 判断两个绝对目录是否相同或存在父子包含关系。 */
function pathsOverlap(left: string, right: string): boolean {
  const leftToRight = relative(left, right)
  const rightToLeft = relative(right, left)
  return leftToRight === ''
    || (!leftToRight.startsWith('..') && !isAbsolute(leftToRight))
    || (!rightToLeft.startsWith('..') && !isAbsolute(rightToLeft))
}

/**
 * 创建带稳定授权指纹的批量计划。
 * @param input 当前扫描、版本和用户决策。
 * @returns 可展示并授权的批量计划。
 */
export function createSkillsBatchPlan(input: CreateSkillsPlanInput): SkillsBatchPlan {
  const decisions = input.decisions.map((decision) => skillDecisionSchema.parse(decision))
  validateDecisionSet(input.report, decisions)
  const canonicalRoot = join(input.dataDir, 'skills')
  const linkPlatforms = input.mode === 'connect' ? [...new Set(input.linkPlatforms ?? input.report.platforms)] : []
  const selectedStatuses = linkPlatforms.map((platform) => {
    const status = input.linkPlatformStatuses.find((entry) => entry.id === platform)
    if (!status) throw new Error(`找不到软链接入平台：${platform}`)
    if (!status.linkSupported) throw new Error(`平台 ${status.name} 当前不支持建立软链。`)
    return status
  })
  const platformOperations = selectedStatuses.map((platform) => {
    return { kind: 'bind-platform' as const, platform: platform.id, path: platform.skillsDir, target: canonicalRoot }
  })
  const customLinkPaths = input.mode === 'connect'
    ? [...new Set((input.linkCustomRoots ?? []).map((path) => {
        if (!isAbsolute(path)) throw new Error(`软链使用目录必须是绝对路径：${path}`)
        return resolve(path)
      }))].sort()
    : []
  if (customLinkPaths.length > MAX_CUSTOM_SKILL_DIRECTORIES) {
    throw new Error(`一次最多配置 ${MAX_CUSTOM_SKILL_DIRECTORIES} 个自定义软链目录。`)
  }
  const reservedPaths = [canonicalRoot, ...platformOperations.map((operation) => operation.path)]
  if (customLinkPaths.some((path) => reservedPaths.some((reserved) => pathsOverlap(path, reserved)))) {
    throw new Error('自定义软链目录不能与统一源或平台目录相同，也不能互为父子目录。')
  }
  if (customLinkPaths.some((path, index) => customLinkPaths.slice(index + 1).some((candidate) => pathsOverlap(path, candidate)))) {
    throw new Error('多个自定义软链目录不能相同，也不能互为父子目录。')
  }
  const customLinkOperations = customLinkPaths.map((path) => ({
    kind: 'bind-custom-root' as const,
    id: stableHash({ type: 'custom-link-root', path }),
    name: basename(path),
    path,
    target: canonicalRoot,
  }))
  const unsigned = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    detectionFingerprint: input.report.fingerprint,
    settingsRevision: input.settingsRevision,
    manifestRevision: input.manifestRevision,
    mode: input.mode,
    platforms: input.report.platforms,
    customRoots: input.report.customRoots.map((root) => root.path),
    units: decisions.map((decision) => createUnit(input, decision)),
    platformOperations,
    customLinkOperations,
  }
  return { ...unsigned, hash: stableHash(unsigned) }
}

/**
 * 验证批量计划未被调用方修改。
 * @param plan 待应用计划。
 */
export function assertSkillsBatchPlan(plan: SkillsBatchPlan): void {
  skillsBatchPlanSchema.parse(plan)
  const { hash, ...unsigned } = plan
  if (stableHash(unsigned) !== hash) throw new Error('Skills 计划 hash 校验失败。')
}

/**
 * 在执行前校验计划单元仍完整对应最新扫描结果。
 * @param plan 已获用户授权的计划。
 * @param report 执行前重新生成的只读扫描报告。
 */
export function assertSkillsPlanScope(plan: SkillsBatchPlan, report: SkillsScanReport, dataDir: string, platformStatuses: SkillPlatformStatus[]): void {
  if (plan.platforms.join(',') !== report.platforms.join(',')) throw new Error('Skills 计划平台范围已经变化。')
  if (plan.customRoots.join('\0') !== report.customRoots.map((root) => root.path).join('\0')) throw new Error('Skills 计划额外扫描目录已经变化。')
  if (new Set(plan.units.map((unit) => unit.id)).size !== plan.units.length) throw new Error('Skills 计划包含重复事务单元。')
  const decisions = plan.units.map((unit) => skillDecisionSchema.parse(unit.decision))
  const groupIds = validateDecisionSet(report, decisions)
  plan.units.forEach((unit, index) => {
    const group = report.groups.find((entry) => entry.id === groupIds[index])
    if (!group || unit.skillName !== group.name) throw new Error('Skills 计划单元与扫描分组不匹配。')
    createUnit({ report, settingsRevision: plan.settingsRevision, manifestRevision: plan.manifestRevision, mode: plan.mode, decisions, dataDir: '', linkPlatformStatuses: platformStatuses }, unit.decision)
  })
  const canonicalRoot = join(dataDir, 'skills')
  const seenPlatforms = new Set<SkillPlatformId>()
  for (const operation of plan.platformOperations) {
    if (seenPlatforms.has(operation.platform)) throw new Error('Skills 计划包含重复的平台根目录绑定。')
    seenPlatforms.add(operation.platform)
    const current = platformStatuses.find((platform) => platform.id === operation.platform)
    if (!current || !current.linkSupported || operation.path !== current.skillsDir || operation.target !== canonicalRoot) {
      throw new Error('Skills 计划的平台根目录绑定范围已经变化。')
    }
  }
  const seenCustomPaths = new Set<string>()
  for (const operation of plan.customLinkOperations) {
    if ([...seenCustomPaths].some((path) => pathsOverlap(path, operation.path))) {
      throw new Error('Skills 计划包含重复或互相嵌套的自定义软链目录。')
    }
    seenCustomPaths.add(operation.path)
    const expectedId = stableHash({ type: 'custom-link-root', path: operation.path })
    if (!isAbsolute(operation.path) || operation.id !== expectedId || operation.name !== basename(operation.path) || operation.target !== canonicalRoot) {
      throw new Error('Skills 计划的自定义软链目录范围已经变化。')
    }
    if (pathsOverlap(operation.path, canonicalRoot) || plan.platformOperations.some((platform) => pathsOverlap(platform.path, operation.path))) {
      throw new Error('Skills 计划的自定义软链目录与统一源或平台目录范围冲突。')
    }
  }
}
