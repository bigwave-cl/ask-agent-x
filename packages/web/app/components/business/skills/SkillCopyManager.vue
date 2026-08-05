<script setup lang="ts">
import { MAX_SKILL_COPY_TARGETS } from '@askx/module-skills/skill-types'
import type {
  ManagedPlatformHealth,
  ManagedSkillRecord,
  SkillCopyBatchPlan,
  SkillCopyBatchReceipt,
  SkillCopyConflictStrategy,
  SkillCopyPlan,
  SkillCopySelection,
  SkillCopyTarget,
  SkillPlatformId,
  SkillPlatformStatus,
} from '@askx/module-skills/skill-types'
import { skillPlatformPresentations } from '@/lib/skillPlatformPresentation'

/** 批量 Skill 同步弹窗属性。 */
interface Props {
  /** 当前统一源中的受管 Skill。 */
  managedSkills: ManagedSkillRecord[]
  /** 当前平台预检测结果。 */
  platforms: SkillPlatformStatus[]
  /** 当前平台软链健康状态。 */
  platformHealth: ManagedPlatformHealth[]
  /** 是否禁止发起同步。 */
  disabled?: boolean
}

/** 批量同步界面步骤。 */
type CopyStep = 'skills' | 'targets' | 'review' | 'result'

const props = withDefaults(defineProps<Props>(), { disabled: false })
const { t } = useI18n()
const toast = useToast()

/** 批量同步弹窗是否打开。 */
const open = ref(false)
/** 当前同步步骤。 */
const step = ref<CopyStep>('skills')
/** 当前请求是否正在进行。 */
const busy = ref(false)
/** Skill 搜索词。 */
const search = ref('')
/** 用户选择的统一源 Skill 标识。 */
const selectedSkillIds = ref<string[]>([])
/** 用户选择的平台和本地文件夹目标。 */
const selectedTargets = ref<SkillCopyTarget[]>([])
/** 用户对每个同名冲突作出的处理选择。 */
const conflictChoices = ref<Record<string, SkillCopyConflictStrategy>>({})
/** 等待用户最终确认的批量同步计划。 */
const plan = ref<SkillCopyBatchPlan | null>(null)
/** 最近一次批量同步的执行结果。 */
const receipt = ref<SkillCopyBatchReceipt | null>(null)

/** 平台软链健康状态索引。 */
const healthByPlatform = computed(() => new Map(props.platformHealth.map((entry) => [entry.platform, entry])))
/** 当前搜索条件下可见的 Skill。 */
const filteredSkills = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  return keyword ? props.managedSkills.filter((skill) => skill.name.toLocaleLowerCase().includes(keyword)) : props.managedSkills
})
/** 当前可见 Skill 是否已经全部选中。 */
const allFilteredSelected = computed(() => Boolean(filteredSkills.value.length) && filteredSkills.value.every((skill) => selectedSkillIds.value.includes(skill.id)))
/** 当前计划中需要用户明确处理的同名冲突。 */
const conflictUnits = computed(() => plan.value?.units.filter((unit) => unit.targetState === 'conflict') ?? [])
/** 尚未明确选择保留或覆盖的冲突数量。 */
const unresolvedConflictCount = computed(() => conflictUnits.value.filter((unit) => !conflictChoices.value[unitKey(unit.skillId, unit.target)]).length)
/** 当前计划中可以直接复制的组合数量。 */
const missingUnitCount = computed(() => plan.value?.units.filter((unit) => unit.targetState === 'missing').length ?? 0)
/** 当前计划中内容已经一致的组合数量。 */
const identicalUnitCount = computed(() => plan.value?.units.filter((unit) => unit.targetState === 'identical').length ?? 0)
/** 当前执行结果统计。 */
const resultCounts = computed(() => ({
  applied: receipt.value?.results.filter((result) => result.status === 'applied').length ?? 0,
  skipped: receipt.value?.results.filter((result) => result.status === 'skipped').length ?? 0,
  failed: receipt.value?.results.filter((result) => result.status === 'failed').length ?? 0,
}))
/** 弹窗步骤标签。 */
const stepLabels = computed(() => [t('skills.copyStepSkills'), t('skills.copyStepTargets'), t('skills.copyStepReview')])
/** 当前步骤在步骤条中的位置。 */
const activeStepIndex = computed(() => step.value === 'skills' ? 0 : step.value === 'targets' ? 1 : 2)

/** 返回目标对象在前端状态中的稳定键。 */
function targetKey(target: SkillCopyTarget): string {
  return target.kind === 'platform' ? `platform:${target.platform}` : `folder:${target.path}`
}

/** 返回一个 Skill 与目标组合的稳定键。 */
function unitKey(skillId: string, target: SkillCopyTarget): string {
  return `${skillId}:${targetKey(target)}`
}

/** 返回文件夹路径的末级名称。 */
function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/** 返回同步目标的用户可见名称。 */
function targetLabel(target: SkillCopyTarget): string {
  return target.kind === 'platform' ? skillPlatformPresentations[target.platform].name : folderName(target.path)
}

/** 判断平台是否仍被 AskX 根目录软链占用。 */
function platformUsesManagedLink(platform: SkillPlatformId): boolean {
  const status = healthByPlatform.value.get(platform)?.status
  return status === 'connected' || status === 'broken'
}

/** 判断一个目标是否已经被用户选择。 */
function targetSelected(target: SkillCopyTarget): boolean {
  const key = targetKey(target)
  return selectedTargets.value.some((entry) => targetKey(entry) === key)
}

/** 更新一个 Skill 的选择状态。 */
function updateSkillSelection(skillId: string, selected: boolean): void {
  selectedSkillIds.value = selected
    ? [...new Set([...selectedSkillIds.value, skillId])]
    : selectedSkillIds.value.filter((id) => id !== skillId)
  plan.value = null
  conflictChoices.value = {}
}

/** 更新当前搜索结果的全选状态。 */
function updateFilteredSelection(selected: boolean): void {
  const visibleIds = new Set(filteredSkills.value.map((skill) => skill.id))
  selectedSkillIds.value = selected
    ? [...new Set([...selectedSkillIds.value, ...visibleIds])]
    : selectedSkillIds.value.filter((id) => !visibleIds.has(id))
  plan.value = null
  conflictChoices.value = {}
}

/** 切换一个 Agent 平台目标。 */
function togglePlatform(platform: SkillPlatformId): void {
  const target: SkillCopyTarget = { kind: 'platform', platform }
  if (platformUsesManagedLink(platform)) return
  selectedTargets.value = targetSelected(target)
    ? selectedTargets.value.filter((entry) => targetKey(entry) !== targetKey(target))
    : [...selectedTargets.value, target]
  plan.value = null
  conflictChoices.value = {}
}

/** 从目标列表移除一个本地文件夹。 */
function removeFolder(path: string): void {
  selectedTargets.value = selectedTargets.value.filter((target) => target.kind !== 'folder' || target.path !== path)
  plan.value = null
  conflictChoices.value = {}
}

/** 调起系统目录多选器并加入本地同步目标。 */
async function chooseFolders(): Promise<void> {
  busy.value = true
  try {
    const result = await $fetch<{ directories: Array<{ name: string, path: string }> }>('/api/skills/folders/select-copy-target', { method: 'POST' })
    const additions = result.directories.map((directory): SkillCopyTarget => ({ kind: 'folder', path: directory.path }))
    const merged = [...selectedTargets.value]
    for (const target of additions) {
      if (!merged.some((entry) => targetKey(entry) === targetKey(target))) merged.push(target)
    }
    if (merged.length > MAX_SKILL_COPY_TARGETS) {
      toast.warning(t('skills.copyTargetLimit', { count: MAX_SKILL_COPY_TARGETS }))
      return
    }
    selectedTargets.value = merged
    plan.value = null
    conflictChoices.value = {}
  } catch (error) {
    notifyError(error)
  } finally {
    busy.value = false
  }
}

/** 将当前选择展开为 Skill 与目标的完整组合。 */
function createSelections(): SkillCopySelection[] {
  return selectedSkillIds.value.flatMap((skillId) => selectedTargets.value.map((target) => ({
    skillId,
    target,
    conflictStrategy: conflictChoices.value[unitKey(skillId, target)] ?? 'keep',
  })))
}

/** 读取全部目标状态并生成最终批量计划。 */
async function preparePlan(moveToReview = true): Promise<boolean> {
  busy.value = true
  try {
    let nextPlan = await $fetch<SkillCopyBatchPlan>('/api/skills/copy/plan', {
      method: 'POST',
      body: { selections: createSelections() },
    })
    const recommendedChoices = { ...conflictChoices.value }
    let recommendationApplied = false
    for (const unit of nextPlan.units) {
      if (unit.targetState !== 'conflict' || unit.identityConflict) continue
      const key = unitKey(unit.skillId, unit.target)
      if (recommendedChoices[key]) continue
      if (unit.versionRelation === 'newer') recommendedChoices[key] = 'replace'
      else if (unit.versionRelation === 'older') recommendedChoices[key] = 'keep'
      else continue
      recommendationApplied = true
    }
    if (recommendationApplied) {
      conflictChoices.value = recommendedChoices
      nextPlan = await $fetch<SkillCopyBatchPlan>('/api/skills/copy/plan', {
        method: 'POST',
        body: { selections: createSelections() },
      })
    }
    plan.value = nextPlan
    if (moveToReview) step.value = 'review'
    return true
  } catch (error) {
    notifyError(error)
    return false
  } finally {
    busy.value = false
  }
}

/** 记录一个冲突组合的处理方式并刷新签名计划。 */
async function chooseConflict(unit: SkillCopyPlan, strategy: SkillCopyConflictStrategy): Promise<void> {
  const previousChoices = conflictChoices.value
  conflictChoices.value = { ...conflictChoices.value, [unitKey(unit.skillId, unit.target)]: strategy }
  if (!await preparePlan(false)) conflictChoices.value = previousChoices
}

/** 应用最终确认的批量同步计划。 */
async function applyPlan(): Promise<void> {
  if (!plan.value || unresolvedConflictCount.value) return
  busy.value = true
  try {
    receipt.value = await $fetch<SkillCopyBatchReceipt>('/api/skills/copy/apply', {
      method: 'POST',
      body: { plan: plan.value, consent: { planHash: plan.value.hash, confirmedAt: new Date().toISOString() } },
    })
    step.value = 'result'
    toast.success(t('skills.copyBatchCompleted', resultCounts.value))
  } catch (error) {
    notifyError(error)
  } finally {
    busy.value = false
  }
}

/** 将接口错误显示为全局 Toast。 */
function notifyError(error: unknown): void {
  const candidate = error as { data?: { message?: string }, statusMessage?: string }
  toast.error(candidate.data?.message ?? candidate.statusMessage ?? t('skills.copyFailed'))
}

/** 返回版本关系对应的用户可见说明。 */
function versionRelationLabel(unit: SkillCopyPlan): string {
  if (unit.identityConflict) return t('skills.copyIdentityConflict')
  if (unit.versionRelation === 'newer') return t('skills.copySourceNewer', { source: unit.sourceVersion, target: unit.targetVersion })
  if (unit.versionRelation === 'older') return t('skills.copySourceOlder', { source: unit.sourceVersion, target: unit.targetVersion })
  if (unit.versionRelation === 'same') return t('skills.copySameVersionDifferentContent', { version: unit.sourceVersion })
  return t('skills.copyUnknownVersionConflict')
}

/** 关闭弹窗后清理本次批量同步的临时状态。 */
function resetState(): void {
  step.value = 'skills'
  search.value = ''
  selectedSkillIds.value = []
  selectedTargets.value = []
  conflictChoices.value = {}
  plan.value = null
  receipt.value = null
}

watch(open, (nextOpen) => {
  if (!nextOpen) resetState()
})
</script>

<template>
  <TooltipProvider :delay-duration="150">
    <Tooltip>
      <CsResponsiveOverlayDialogDrawer
    v-model:open="open"
    :title="t('skills.copyManagerTitle')"
    :description="t('skills.copyManagerDescription')"
    :dismissible="!busy"
    :close-disabled="busy"
    :close-label="t('common.cancel')"
    :show-header="step !== 'result'"
    :dialog="{ content: { class: 'max-w-[calc(100vw-2rem)] sm:max-w-[min(68rem,calc(100vw-2rem))]' } }"
    :drawer="{ root: { handleOnly: true }, content: { class: '[&>div:first-child]:hidden' } }"
    header-class="px-4 py-4 sm:px-6"
    body-class="p-4 pb-28 sm:p-6 sm:pb-28"
    footer-class="absolute inset-x-4 bottom-4 z-20 flex-row items-center justify-between gap-3 rounded-[28px] border bg-background/75 p-3 shadow-xl backdrop-blur-md sm:inset-x-6 sm:bottom-6 sm:justify-between"
      >
        <template #trigger>
          <TooltipTrigger as-child>
            <Button variant="outline" size="40" class="w-full" :disabled="disabled || !managedSkills.length">
              <Icon name="askx-actions:external-link" />
              {{ t('skills.copyManagerAction') }}
            </Button>
          </TooltipTrigger>
        </template>

    <template #header>
      <div class="flex max-w-full items-center rounded-full border bg-card p-1.5 shadow-sm">
        <div v-for="(label, index) in stepLabels" :key="label" class="flex min-w-0 items-center">
          <span class="flex min-w-0 items-center gap-2 rounded-full px-3 py-2 text-xs transition" :class="index === activeStepIndex ? 'bg-primary text-ds-text-white' : index < activeStepIndex ? 'text-primary' : 'text-muted-foreground'">
            <span class="grid size-5 shrink-0 place-items-center rounded-full border border-current/30 font-mono text-[9px]">{{ index < activeStepIndex ? '✓' : index + 1 }}</span>
            <span class="truncate">{{ label }}</span>
          </span>
          <Icon v-if="index < stepLabels.length - 1" name="askx-navigation:chevron-right" class="mx-1 size-3 shrink-0 text-muted-foreground/40" />
        </div>
      </div>
    </template>

    <section v-if="step === 'skills'" class="grid gap-4">
      <div class="rounded-2xl bg-gradient-to-br from-primary/12 via-primary/4 to-transparent p-5">
        <h3 class="text-xl font-semibold">{{ t('skills.copySelectSkillsTitle') }}</h3>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ t('skills.copySelectSkillsDescription') }}</p>
      </div>
      <div class="overflow-hidden rounded-2xl border bg-card">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b p-3">
          <label class="flex h-10 min-w-[14rem] flex-1 items-center gap-2 rounded-xl border bg-background px-3 focus-within:ring-2 focus-within:ring-ring/40"><Icon name="askx-actions:search" class="size-4 text-muted-foreground" /><input v-model="search" class="min-w-0 flex-1 bg-transparent text-sm outline-none" :placeholder="t('skills.resourceSearch')"></label>
          <label class="flex cursor-pointer items-center gap-2 text-sm"><Checkbox :model-value="allFilteredSelected" @update:model-value="updateFilteredSelection(Boolean($event))" />{{ t('skills.copySelectAllVisible') }}</label>
          <Badge variant="secondary">{{ t('skills.copySelectedSkills', { count: selectedSkillIds.length }) }}</Badge>
        </div>
        <ScrollArea class="h-[min(28rem,52svh)]" viewport-class="p-2">
          <div class="grid gap-1 sm:grid-cols-2">
            <label v-for="skill in filteredSkills" :key="skill.id" class="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-3 transition hover:border-ds-border-subtle-10 hover:bg-ds-fill-bw-transparent-3" :class="selectedSkillIds.includes(skill.id) ? 'border-ds-border-brand-85 bg-ds-fill-brand-transparent-10' : ''">
              <Checkbox :model-value="selectedSkillIds.includes(skill.id)" @update:model-value="updateSkillSelection(skill.id, Boolean($event))" />
              <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-ds-fill-brand-transparent-10 text-primary"><Icon name="askx-objects:skills" class="size-4" /></span>
              <span class="min-w-0"><strong class="block truncate text-sm">{{ skill.name }}</strong><code class="mt-1 block truncate font-mono text-[9px] text-muted-foreground">{{ skill.canonicalPath }}</code></span>
            </label>
          </div>
        </ScrollArea>
      </div>
    </section>

    <section v-else-if="step === 'targets'" class="grid gap-4">
      <div class="rounded-2xl bg-gradient-to-br from-primary/12 via-primary/4 to-transparent p-5">
        <h3 class="text-xl font-semibold">{{ t('skills.copySelectTargetsTitle') }}</h3>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ t('skills.copySelectTargetsDescription') }}</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <button v-for="platform in platforms" :key="platform.id" type="button" class="flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-4 text-left transition hover:border-ds-border-brand-85 hover:bg-ds-fill-brand-transparent-10 disabled:cursor-not-allowed disabled:opacity-50" :class="targetSelected({ kind: 'platform', platform: platform.id }) ? 'border-ds-border-brand-85 bg-ds-fill-brand-transparent-10 ring-1 ring-ds-border-brand-85' : ''" :disabled="platformUsesManagedLink(platform.id)" @click="togglePlatform(platform.id)">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl border bg-background shadow-sm"><Icon :name="skillPlatformPresentations[platform.id].icon" class="size-5" /></span>
          <span class="min-w-0 flex-1"><strong class="block truncate text-sm">{{ skillPlatformPresentations[platform.id].name }}</strong><span class="mt-1 block truncate font-mono text-[9px] text-muted-foreground">{{ platformUsesManagedLink(platform.id) ? t('skills.copyAlreadyLinked') : platform.skillsDir }}</span></span>
          <Icon v-if="targetSelected({ kind: 'platform', platform: platform.id })" name="askx-status:check" class="size-4 shrink-0 text-primary" />
        </button>
      </div>
      <div class="overflow-hidden rounded-2xl border border-dashed bg-card">
        <div class="flex items-center justify-between gap-3 p-4">
          <div><strong class="text-sm">{{ t('skills.copyFolderTargetsTitle') }}</strong><p class="mt-1 text-xs text-muted-foreground">{{ t('skills.copyFolderTargetsDescription') }}</p></div>
          <Button variant="outline" size="40" :disabled="busy || selectedTargets.length >= MAX_SKILL_COPY_TARGETS" @click="chooseFolders"><Icon name="askx-objects:folder-open" />{{ t('skills.copyChooseFolder') }}</Button>
        </div>
        <div v-if="selectedTargets.some((target) => target.kind === 'folder')" class="border-t">
          <div v-for="target in selectedTargets.filter((entry) => entry.kind === 'folder')" :key="target.path" class="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-ds-fill-brand-transparent-10 text-primary"><Icon name="askx-objects:folder" class="size-4" /></span>
            <span class="min-w-0 flex-1"><strong class="block truncate text-xs">{{ folderName(target.path) }}</strong><code class="mt-1 block truncate font-mono text-[9px] text-muted-foreground">{{ target.path }}</code></span>
            <Button variant="ghost" size="icon-sm" :aria-label="t('skills.removeFolder', { name: folderName(target.path) })" @click="removeFolder(target.path)"><Icon name="askx-actions:delete" /></Button>
          </div>
        </div>
      </div>
    </section>

    <section v-else-if="step === 'review' && plan" class="grid gap-4">
      <div class="rounded-2xl bg-gradient-to-br from-primary/12 via-primary/4 to-transparent p-5">
        <h3 class="text-xl font-semibold">{{ t('skills.copyReviewTitle') }}</h3>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ t('skills.copyReviewDescription') }}</p>
        <div class="mt-4 flex flex-wrap gap-2"><Badge variant="secondary">{{ t('skills.copyReadyCount', { count: missingUnitCount }) }}</Badge><Badge variant="secondary">{{ t('skills.copyIdenticalCount', { count: identicalUnitCount }) }}</Badge><Badge :variant="conflictUnits.length ? 'destructive' : 'secondary'">{{ t('skills.copyConflictCount', { count: conflictUnits.length }) }}</Badge></div>
      </div>
      <div v-if="conflictUnits.length" class="overflow-hidden rounded-2xl border bg-card">
        <div class="border-b px-4 py-3"><strong class="text-sm">{{ t('skills.copyConflictsTitle') }}</strong><p class="mt-1 text-xs text-muted-foreground">{{ t('skills.copyConflictsDescription') }}</p></div>
        <ScrollArea class="h-[min(28rem,48svh)]">
          <div v-for="unit in conflictUnits" :key="unit.id" class="grid gap-3 border-b p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2"><Icon name="askx-status:warning" class="size-4 shrink-0 text-warning" /><strong class="truncate text-sm">{{ unit.skillName }}</strong><Badge variant="outline">{{ targetLabel(unit.target) }}</Badge></div>
              <p class="mt-1 pl-6 text-xs text-muted-foreground">{{ versionRelationLabel(unit) }}</p>
              <code class="mt-1 block truncate pl-6 font-mono text-[9px] text-muted-foreground">{{ unit.destinationPath }}</code>
            </div>
            <div class="flex gap-2">
              <Button size="36" :variant="conflictChoices[unitKey(unit.skillId, unit.target)] === 'keep' ? 'primary' : 'outline'" :disabled="busy" @click="chooseConflict(unit, 'keep')"><Icon name="askx-status:prohibited" />{{ t('skills.copyKeepTarget') }}</Button>
              <Button size="36" :variant="conflictChoices[unitKey(unit.skillId, unit.target)] === 'replace' ? 'destructive' : 'outline'" :disabled="busy" @click="chooseConflict(unit, 'replace')"><Icon name="askx-actions:delete" />{{ t('skills.copyReplaceTarget') }}</Button>
            </div>
          </div>
        </ScrollArea>
      </div>
      <div v-else class="grid min-h-48 place-items-center rounded-2xl border border-dashed bg-success-soft p-8 text-center"><div><Icon name="askx-status:check" class="mx-auto size-8 text-success" /><h4 class="mt-3 font-semibold">{{ t('skills.copyNoConflictsTitle') }}</h4><p class="mt-2 text-sm text-muted-foreground">{{ t('skills.copyNoConflictsDescription') }}</p></div></div>
      <p v-if="unresolvedConflictCount" class="flex items-center gap-2 text-sm text-destructive"><Icon name="askx-status:warning" class="size-4" />{{ t('skills.copyUnresolvedConflicts', { count: unresolvedConflictCount }) }}</p>
    </section>

    <section v-else-if="step === 'result' && receipt" class="grid gap-4">
      <div class="rounded-2xl bg-gradient-to-br from-primary/12 via-primary/4 to-transparent p-6 text-center"><Icon name="askx-status:check" class="mx-auto size-9 text-primary" /><h3 class="mt-3 text-xl font-semibold">{{ t('skills.copyResultTitle') }}</h3><p class="mt-2 text-sm text-muted-foreground">{{ t('skills.copyBatchCompleted', resultCounts) }}</p></div>
      <div class="grid gap-3 sm:grid-cols-3"><div class="rounded-2xl border bg-card p-4"><span class="text-xs text-muted-foreground">{{ t('skills.copyApplied') }}</span><strong class="mt-2 block text-2xl">{{ resultCounts.applied }}</strong></div><div class="rounded-2xl border bg-card p-4"><span class="text-xs text-muted-foreground">{{ t('skills.copySkippedLabel') }}</span><strong class="mt-2 block text-2xl">{{ resultCounts.skipped }}</strong></div><div class="rounded-2xl border bg-card p-4"><span class="text-xs text-muted-foreground">{{ t('skills.copyFailedLabel') }}</span><strong class="mt-2 block text-2xl">{{ resultCounts.failed }}</strong></div></div>
      <ScrollArea v-if="resultCounts.failed" class="h-[min(18rem,36svh)] rounded-2xl border bg-card"><div v-for="result in receipt.results.filter((entry) => entry.status === 'failed')" :key="`${result.skillId}:${targetKey(result.target)}`" class="border-b p-4 last:border-b-0"><strong class="text-sm">{{ result.skillName }} · {{ targetLabel(result.target) }}</strong><p class="mt-1 text-xs text-destructive">{{ result.warnings.join('；') }}</p></div></ScrollArea>
    </section>

        <template #footer>
      <template v-if="step === 'skills'">
        <p class="text-xs text-muted-foreground">{{ t('skills.copySelectedSkills', { count: selectedSkillIds.length }) }}</p>
        <Button size="48" :disabled="!selectedSkillIds.length" @click="step = 'targets'"><Icon name="askx-navigation:arrow-right" />{{ t('skills.copyNextTargets') }}</Button>
      </template>
      <template v-else-if="step === 'targets'">
        <Button variant="ghost" size="48" @click="step = 'skills'"><Icon name="askx-navigation:arrow-left" />{{ t('skills.back') }}</Button>
        <Button size="48" :disabled="!selectedTargets.length || busy" @click="preparePlan()"><Icon name="askx-navigation:arrow-right" />{{ busy ? t('skills.copyDetectingConflicts') : t('skills.copyReviewConflicts') }}</Button>
      </template>
      <template v-else-if="step === 'review'">
        <Button variant="ghost" size="48" :disabled="busy" @click="step = 'targets'"><Icon name="askx-navigation:arrow-left" />{{ t('skills.back') }}</Button>
        <Button size="48" :disabled="busy || Boolean(unresolvedConflictCount)" @click="applyPlan"><Icon name="askx-actions:external-link" />{{ busy ? t('skills.copying') : t('skills.copyExecute') }}</Button>
      </template>
      <template v-else>
        <span />
        <Button size="48" @click="open = false">{{ t('skills.copyCloseResult') }}</Button>
      </template>
        </template>
      </CsResponsiveOverlayDialogDrawer>
      <TooltipContent side="top" :side-offset="8" class="max-w-[300px]">{{ t('skills.copyManagerTip') }}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
