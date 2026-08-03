<script setup lang="ts">
import type { SkillDecision, SkillGroup, SkillsBatchMode, SkillsScanReport } from '@askx/module-skills/skill-types'
import Tabs from '@/components/ui/tabs/Tabs.vue'
import TabsList from '@/components/ui/tabs/TabsList.vue'
import TabsTrigger from '@/components/ui/tabs/TabsTrigger.vue'

/** 最终 Skill 清单筛选类型。 */
type SkillListFilter = 'all' | 'included' | 'review' | 'skipped'

/** 最终 Skill 清单筛选项。 */
interface SkillFilterOption {
  /** 筛选标识。 */
  id: SkillListFilter
  /** 当前语言的筛选文案。 */
  label: string
  /** 对应 Skill 数量。 */
  count: number
}

/** 扫描结果组件属性。 */
interface Props {
  /** 最新只读扫描报告。 */
  report: SkillsScanReport
  /** 每个分组的当前决策。 */
  decisions: SkillDecision[]
  /** 当前是平台接入还是只同步统一源。 */
  mode: SkillsBatchMode
}

const props = defineProps<Props>()
const emit = defineEmits<{
  /** 更新一个分组的决策。 */
  'update-decision': [groupId: string, decision: SkillDecision]
  /** 重新执行扫描。 */
  'rescan': []
}>()
const { t } = useI18n()
/** Skill 名称和描述搜索词。 */
const searchQuery = ref('')
/** 当前最终清单筛选条件。 */
const activeFilter = ref<SkillListFilter>('all')

/**
 * 返回分组对应的当前决策。
 * @param group 按名称聚合后的 Skill。
 * @returns 当前用户选择或安全的保留默认值。
 */
function groupDecision(group: SkillGroup): SkillDecision {
  return props.decisions.find((decision) => {
    if (decision.kind === 'keep') return decision.groupId === group.id
    if (decision.kind === 'archive') return decision.locationIds.some((id) => group.locations.some((location) => location.id === id))
    return group.locations.some((location) => location.id === decision.sourceLocationId)
  }) ?? { kind: 'keep', groupId: group.id }
}

/**
 * 判断一个决策是否会将 Skill 纳入统一源。
 * @param decision 当前 Skill 决策。
 * @returns 是否会生成或更新统一源。
 */
function decisionIncludesSkill(decision: SkillDecision): boolean {
  return decision.kind === 'adopt'
    || decision.kind === 'merge'
    || decision.kind === 'replace'
    || decision.kind === 'rename-and-adopt'
}

/**
 * 判断一个聚合 Skill 是否建议人工检查。
 * @param group 按名称聚合后的 Skill。
 * @returns 是否存在冲突、无效内容或失效链接。
 */
function groupNeedsReview(group: SkillGroup): boolean {
  return group.status === 'conflict' || group.status === 'invalid' || group.status === 'broken'
}

/** 最终会进入 AskX 统一源的 Skill 数量。 */
const includedCount = computed(() => props.report.groups.filter((group) => decisionIncludesSkill(groupDecision(group))).length)
/** 建议用户重点检查的 Skill 数量。 */
const reviewCount = computed(() => props.report.groups.filter(groupNeedsReview).length)
/** 当前选择保留或移入备份区的 Skill 数量。 */
const skippedCount = computed(() => props.report.groups.length - includedCount.value)
/** 最终 Skill 清单筛选项。 */
const filterOptions = computed<SkillFilterOption[]>(() => [
  { id: 'all', label: t('skills.filterAll'), count: props.report.groups.length },
  { id: 'included', label: t('skills.filterIncluded'), count: includedCount.value },
  { id: 'review', label: t('skills.filterReview'), count: reviewCount.value },
  { id: 'skipped', label: t('skills.filterSkipped'), count: skippedCount.value },
])
/** 搜索和筛选后的最终 Skill 清单。 */
const visibleGroups = computed<SkillGroup[]>(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  return props.report.groups.filter((group) => {
    const decision = groupDecision(group)
    const matchesFilter = activeFilter.value === 'all'
      || (activeFilter.value === 'included' && decisionIncludesSkill(decision))
      || (activeFilter.value === 'review' && groupNeedsReview(group))
      || (activeFilter.value === 'skipped' && !decisionIncludesSkill(decision))
    if (!matchesFilter) return false
    if (!query) return true
    return [group.name, ...group.locations.map((location) => location.metadata.description ?? location.metadata.error ?? '')]
      .some((value) => value.toLocaleLowerCase().includes(query))
  })
})
</script>

<template>
  <section class="relative overflow-hidden rounded-[28px] border bg-card p-5 shadow-sm sm:p-8">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/10 to-transparent" />
    <div class="relative grid gap-6">
      <header class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div class="min-w-0">
          <Badge variant="secondary" class="mb-3 gap-1.5"><Icon name="askx-status:check" class="size-3.5" />{{ t('skills.safeRead') }}</Badge>
          <h2 class="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{{ t(mode === 'sync' ? 'skills.syncScanTitle' : 'skills.scanTitle') }}</h2>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ t(mode === 'sync' ? 'skills.syncScanDescription' : 'skills.scanDescription') }}</p>
        </div>
        <Button variant="outline" size="40" class="justify-self-start sm:justify-self-end" @click="emit('rescan')"><Icon name="askx-actions:refresh" />{{ t('skills.rescan') }}</Button>
      </header>

      <section class="overflow-hidden rounded-[24px] border bg-background/75 shadow-sm">
        <header class="grid gap-4 border-b px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
          <div><div class="flex items-center gap-2"><h3 class="font-semibold">{{ t('skills.finalSkillList') }}</h3><Badge variant="secondary">{{ t('skills.skillCount', { count: report.groups.length }) }}</Badge></div><p class="mt-1 text-xs text-muted-foreground">{{ t('skills.finalSkillListDescription') }}</p></div>
          <div class="relative"><Icon name="askx-actions:search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input v-model="searchQuery" class="h-10 pl-9" :placeholder="t('skills.skillSearchPlaceholder')" /></div>
        </header>

        <Tabs v-model="activeFilter" class="border-b bg-muted/20 px-3">
          <TabsList variant="line" size="36" scrollable :aria-label="t('skills.skillFilters')">
            <TabsTrigger v-for="option in filterOptions" :key="option.id" :value="option.id">
              <span>{{ option.label }}</span>
              <span class="font-mono text-[9px] opacity-65">{{ option.count }}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div class="hidden grid-cols-[minmax(0,1fr)_minmax(13rem,.55fr)_auto] gap-5 border-b bg-muted/10 px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground lg:grid"><span>{{ t('skills.skillColumn') }}</span><span>{{ t('skills.sourcesColumn') }}</span><span>{{ t('skills.decisionColumn') }}</span></div>

        <BusSkillsSkillDecision
          v-for="group in visibleGroups"
          :key="group.id"
          :group="group"
          :decision="groupDecision(group)"
          :custom-roots="report.customRoots"
          @update:decision="emit('update-decision', group.id, $event)"
        />
        <div v-if="!report.groups.length" class="p-8 text-center"><Icon name="askx-objects:skills" class="mx-auto size-8 text-primary" /><h3 class="mt-4 font-semibold">{{ t('skills.noFilesFound') }}</h3><p class="mt-2 text-sm text-muted-foreground">{{ t(mode === 'sync' ? 'skills.noSyncFilesDescription' : 'skills.noFilesDescription') }}</p></div>
        <div v-else-if="!visibleGroups.length" class="p-8 text-center"><Icon name="askx-actions:search" class="mx-auto size-7 text-muted-foreground" /><h3 class="mt-3 font-semibold">{{ t('skills.noMatchingSkills') }}</h3><p class="mt-1 text-xs text-muted-foreground">{{ t('skills.noMatchingSkillsDescription') }}</p></div>
      </section>
    </div>
  </section>
</template>
