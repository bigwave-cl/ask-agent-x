<script setup lang="ts">
import type { SkillStatsReport } from '@askx/module-skills/skill-manager-registry'
import type {
  SkillManagementBatchPlan,
  SkillManagementBatchReceipt,
  SkillManagementBatchSelection,
  SkillManagementStatusItem,
} from '@askx/module-skills/skill-management-manager'

/** Skill 统计属性。 */
interface Props {
  /** 当前是否显示统计页。 */ active: boolean
  /** 共享统一源和本地专属中的用户 Skill 总数。 */ sharedTotal: number
}

const props = defineProps<Props>()
const emit = defineEmits<{ /** Skill 管理状态已经更新。 */ updated: [] }>()
const { t, locale } = useI18n()
const toast = useToast()
/** 已加载的统计报告；组件生命周期内复用。 */
const report = ref<SkillStatsReport | null>(null)
/** 首次异步加载状态。 */
const loading = ref(false)
/** Registry 当前是否不可读取。 */
const failed = ref(false)
/** 批量管理弹层是否打开。 */
const managerOpen = ref(false)
/** 弹层列表搜索词。 */
const query = ref('')
/** 打开弹层时实际已管理的记录。 */
const initialManagedIds = ref<string[]>([])
/** 弹层草稿中计划保留为已管理的记录。 */
const draftManagedIds = ref<string[]>([])
/** 当前是否正在生成并应用批量计划。 */
const saving = ref(false)

/** 按显式使用次数降序排列的 Skill 排行。 */
const rankedItems = computed(() => [...(report.value?.items ?? [])]
  .sort((left, right) => right.usageCount - left.usageCount || left.name.localeCompare(right.name)))

/** 全部用户 Skill 管理状态。 */
const managementItems = computed(() => report.value
  ? [...report.value.management.managed, ...report.value.management.unmanaged]
  : [])
/** 当前草稿中的已管理集合。 */
const draftManagedSet = computed(() => new Set(draftManagedIds.value))
/** 搜索过滤后的已管理 Skill。 */
const managedDraftItems = computed(() => managementItems.value.filter(item => draftManagedSet.value.has(item.recordId) && matchesQuery(item)))
/** 搜索过滤后的未管理 Skill。 */
const unmanagedDraftItems = computed(() => managementItems.value.filter(item => !draftManagedSet.value.has(item.recordId) && matchesQuery(item)))
/** 最终保存时需要执行的增删变更。 */
const pendingSelections = computed<SkillManagementBatchSelection[]>(() => {
  const initial = new Set(initialManagedIds.value)
  const draft = draftManagedSet.value
  return managementItems.value.flatMap(item => initial.has(item.recordId) === draft.has(item.recordId)
    ? []
    : [{ recordId: item.recordId, action: draft.has(item.recordId) ? 'manage' as const : 'remove' as const }])
})

/** 读取 Registry 与实际目录的联合统计。 */
async function loadStats(force = false): Promise<void> {
  if ((!force && report.value) || loading.value) return
  loading.value = true
  failed.value = false
  try {
    report.value = await $fetch<SkillStatsReport>('/api/skills/stats')
  } catch {
    failed.value = true
    toast.error(t('skills.statsLoadFailed'))
  } finally {
    loading.value = false
  }
}

/** 打开批量编辑弹层并从服务端状态重建草稿。 */
function openManager(): void {
  if (!report.value) return
  const managedIds = report.value.management.managed.map(item => item.recordId)
  initialManagedIds.value = [...managedIds]
  draftManagedIds.value = [...managedIds]
  query.value = ''
  managerOpen.value = true
}

/** 判断 Skill 是否匹配当前搜索词。 */
function matchesQuery(item: SkillManagementStatusItem): boolean {
  const keyword = query.value.trim().toLocaleLowerCase()
  return !keyword || item.name.toLocaleLowerCase().includes(keyword) || item.path.toLocaleLowerCase().includes(keyword)
}

/** 在两个管理列表之间移动一项，仅修改弹层草稿。 */
function moveItem(recordId: string, managed: boolean): void {
  const next = new Set(draftManagedIds.value)
  if (managed) next.add(recordId)
  else next.delete(recordId)
  draftManagedIds.value = [...next]
}

/** 返回管理状态的用户文案 key。 */
function stateKey(item: SkillManagementStatusItem): string {
  if (item.managed && !item.registryRegistered) return 'skills.managementStates.registryMissing'
  return `skills.managementStates.${item.state}`
}

/** 格式化最近一次显式使用时间。 */
function formatLastUsedAt(value?: string): string {
  if (!value) return t('skills.statsNeverUsed')
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/** 保存全部草稿，生成一份批量计划并按 Skill 独立处理。 */
async function saveManagement(): Promise<void> {
  if (!pendingSelections.value.length || saving.value) return
  saving.value = true
  try {
    const plan = await $fetch<SkillManagementBatchPlan>('/api/skills/management/batch-plan', {
      method: 'POST',
      body: { selections: pendingSelections.value },
    })
    const receipt = await $fetch<SkillManagementBatchReceipt>('/api/skills/management/batch-apply', {
      method: 'POST',
      body: { plan, consent: { planHash: plan.hash, confirmedAt: new Date().toISOString() } },
    })
    const failedCount = receipt.results.filter(result => result.status === 'failed').length
    await loadStats(true)
    emit('updated')
    managerOpen.value = false
    if (failedCount) toast.warning(t('skills.managementBatchPartial', { success: receipt.results.length - failedCount, failed: failedCount }))
    else toast.success(t('skills.managementBatchCompleted', { count: receipt.results.length }))
  } catch {
    toast.error(t('skills.managementActionFailed'))
  } finally {
    saving.value = false
  }
}

watch(() => props.active, active => { if (active) void loadStats() }, { immediate: true })
</script>

<template>
  <div class="contents">
    <section class="overflow-hidden rounded-[24px] border bg-card shadow-sm">
      <header class="flex flex-col gap-4 border-b bg-gradient-to-r from-primary/10 via-transparent to-transparent px-5 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-7">
        <div>
          <p class="text-[10px] font-medium uppercase tracking-[0.18em] text-primary">{{ t('skills.statsEyebrow') }}</p>
          <h2 class="mt-2 text-2xl font-semibold">{{ t('skills.statsTitle') }}</h2>
          <p class="mt-2 text-sm text-muted-foreground">{{ t('skills.statsDescription') }}</p>
        </div>
        <Button v-if="report" size="40" class="shrink-0" @click="openManager">
          <Icon name="askx-actions:adjust" />{{ t('skills.configureManagementScope') }}
        </Button>
      </header>
      <div v-if="loading" class="grid gap-4 p-6 sm:grid-cols-4"><Skeleton v-for="index in 4" :key="index" class="h-24 rounded-xl" /></div>
      <div v-else-if="failed" class="grid min-h-56 place-items-center p-6 text-center">
        <div class="max-w-md"><Icon name="askx-status:warning" class="mx-auto size-8 text-warning" /><h3 class="mt-3 font-semibold">{{ t('skills.statsUnavailableTitle') }}</h3><p class="mt-2 text-sm leading-6 text-muted-foreground">{{ t('skills.statsUnavailableDescription') }}</p><Button variant="outline" size="40" class="mt-4" @click="loadStats(true)"><Icon name="askx-actions:refresh" />{{ t('common.retry') }}</Button></div>
      </div>
      <div v-else-if="report" class="grid gap-6 p-5 sm:p-7">
        <div class="grid gap-3 sm:grid-cols-4">
          <div v-for="item in [
            { label: t('skills.statsManaged'), value: `${report.management.managed.length}/${sharedTotal}` },
            { label: t('skills.statsUnmanaged'), value: report.management.unmanaged.length },
            { label: t('skills.statsUsage'), value: report.totalUsage },
            { label: t('skills.statsIssues'), value: report.issueTargets },
          ]" :key="item.label" class="rounded-xl border bg-background px-4 py-4"><span class="text-xs text-muted-foreground">{{ item.label }}</span><strong class="mt-2 block text-2xl">{{ item.value }}</strong></div>
        </div>
        <section class="overflow-hidden rounded-2xl border bg-background">
          <header class="flex items-center justify-between gap-4 border-b bg-muted/20 px-5 py-4">
            <div><h3 class="text-sm font-semibold">{{ t('skills.statsRankingTitle') }}</h3><p class="mt-1 text-xs text-muted-foreground">{{ t('skills.statsRankingDescription') }}</p></div>
            <Badge variant="secondary">{{ rankedItems.length }}</Badge>
          </header>
          <ScrollArea v-if="rankedItems.length" type="hover" orientation="horizontal" class="w-full">
            <table class="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead class="bg-muted/15 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr><th class="w-24 px-5 py-3 font-medium">{{ t('skills.statsRank') }}</th><th class="px-4 py-3 font-medium">{{ t('skills.statsSkill') }}</th><th class="w-32 px-4 py-3 font-medium">{{ t('skills.statsVersion') }}</th><th class="w-28 px-4 py-3 text-center font-medium">{{ t('skills.statsTargetCount') }}</th><th class="w-48 px-4 py-3 font-medium">{{ t('skills.statsLastUsed') }}</th><th class="w-28 px-5 py-3 text-right font-medium">{{ t('skills.statsUsageCount') }}</th></tr>
              </thead>
              <tbody class="divide-y">
                <tr v-for="(item, index) in rankedItems" :key="item.skillId" class="transition-colors hover:bg-muted/20" :class="index === 0 ? 'bg-warning/5' : index === 1 ? 'bg-muted/10' : index === 2 ? 'bg-primary/5' : ''">
                  <td class="px-5 py-3.5">
                    <span v-if="index < 3" class="inline-flex items-center gap-2.5">
                      <span class="h-7 w-1 rounded-full" :class="index === 0 ? 'bg-warning' : index === 1 ? 'bg-ds-text-tertiary' : 'bg-primary'" />
                      <strong class="font-mono text-lg leading-none" :class="index === 0 ? 'text-warning' : index === 1 ? 'text-ds-text-secondary' : 'text-ds-text-brand'">{{ String(index + 1).padStart(2, '0') }}</strong>
                    </span>
                    <span v-else class="pl-3.5 font-mono text-xs text-muted-foreground">{{ String(index + 1).padStart(2, '0') }}</span>
                  </td>
                  <td class="px-4 py-3.5"><strong class="block truncate">{{ item.name }}</strong><span class="mt-1 block truncate font-mono text-[10px] text-muted-foreground">{{ item.skillId }}</span></td>
                  <td class="px-4 py-3.5"><Badge variant="outline">{{ item.version }}</Badge></td>
                  <td class="px-4 py-3.5 text-center font-mono text-xs">{{ item.targetCount }}</td>
                  <td class="px-4 py-3.5 text-xs text-muted-foreground">{{ formatLastUsedAt(item.lastUsedAt) }}</td>
                  <td class="px-5 py-3.5 text-right"><strong class="font-mono text-base" :class="index < 3 ? 'text-primary' : ''">{{ item.usageCount }}</strong></td>
                </tr>
              </tbody>
            </table>
          </ScrollArea>
          <p v-else class="grid min-h-36 place-items-center px-6 text-center text-sm text-muted-foreground">{{ t('skills.statsEmpty') }}</p>
        </section>
      </div>
    </section>

    <CsResponsiveOverlayDialogDrawer
      v-model:open="managerOpen"
      :title="t('skills.skillManagementScope')"
      :description="t('skills.managementScopeDescription')"
      :dismissible="!saving"
      :close-disabled="saving"
      :close-label="t('common.cancel')"
      :dialog="{ content: { class: 'sm:max-w-[68rem]' } }"
    >
      <template #trigger><button type="button" tabindex="-1" aria-hidden="true" class="sr-only">{{ t('skills.configureManagementScope') }}</button></template>
      <div class="grid gap-4 p-5 sm:p-6">
        <div class="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><strong class="text-sm">{{ t('skills.managementDraftTitle') }}</strong><p class="mt-1 text-xs leading-5 text-muted-foreground">{{ t('skills.managementDraftDescription') }}</p></div>
          <div class="relative shrink-0 sm:w-72"><Icon name="askx-actions:search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input v-model="query" class="pl-9" :placeholder="t('skills.searchManagedSkills')" /></div>
        </div>

        <div class="grid min-h-0 gap-4 lg:grid-cols-2">
          <section class="overflow-hidden rounded-2xl border bg-background">
            <header class="flex items-center justify-between border-b bg-primary/5 px-4 py-3"><div><h3 class="text-sm font-semibold">{{ t('skills.managedSkillsTitle') }}</h3><p class="mt-1 text-xs text-muted-foreground">{{ t('skills.managedSkillsDescription') }}</p></div><Badge variant="secondary">{{ managedDraftItems.length }}</Badge></header>
            <ScrollArea type="hover" class="h-[min(50vh,420px)]">
              <div v-if="managedDraftItems.length" class="divide-y">
                <button v-for="item in managedDraftItems" :key="item.recordId" type="button" class="group flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-ds-fill-brand-transparent-5 focus-visible:bg-ds-fill-brand-transparent-5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30" :aria-label="t('skills.moveToUnmanaged', { name: item.name })" @click="moveItem(item.recordId, false)">
                  <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon name="askx-status:check" class="size-4" /></span>
                  <div class="min-w-0 flex-1"><div class="flex items-center gap-2"><strong class="truncate text-sm">{{ item.name }}</strong><Badge variant="outline">{{ item.scope === 'local' ? t('skills.localSkillsTab') : t('skills.sharedSkillsTab') }}</Badge></div><p class="mt-1 truncate font-mono text-[10px] text-muted-foreground" :title="item.path">{{ item.version || t('skills.unmanagedVersion') }} · {{ item.path }}</p></div>
                  <span class="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary"><Icon name="askx-navigation:arrow-right" class="size-4" /></span>
                </button>
              </div>
              <p v-else class="grid h-40 place-items-center px-6 text-center text-sm text-muted-foreground">{{ t('skills.noManagedSkills') }}</p>
            </ScrollArea>
          </section>

          <section class="overflow-hidden rounded-2xl border bg-background">
            <header class="flex items-center justify-between border-b bg-muted/25 px-4 py-3"><div><h3 class="text-sm font-semibold">{{ t('skills.unmanagedSkillsTitle') }}</h3><p class="mt-1 text-xs text-muted-foreground">{{ t('skills.unmanagedSkillsDescription') }}</p></div><Badge variant="outline">{{ unmanagedDraftItems.length }}</Badge></header>
            <ScrollArea type="hover" class="h-[min(50vh,420px)]">
              <div v-if="unmanagedDraftItems.length" class="divide-y">
                <button v-for="item in unmanagedDraftItems" :key="item.recordId" type="button" class="group flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-ds-fill-brand-transparent-5 focus-visible:bg-ds-fill-brand-transparent-5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30" :aria-label="t('skills.moveToManaged', { name: item.name })" @click="moveItem(item.recordId, true)">
                  <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon name="askx-objects:skills" class="size-4" /></span>
                  <div class="min-w-0 flex-1"><div class="flex items-center gap-2"><strong class="truncate text-sm">{{ item.name }}</strong><Badge variant="outline">{{ t(stateKey(item)) }}</Badge></div><p class="mt-1 truncate font-mono text-[10px] text-muted-foreground" :title="item.path">{{ item.path }}</p></div>
                  <span class="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary"><Icon name="askx-navigation:arrow-left" class="size-4" /></span>
                </button>
              </div>
              <p v-else class="grid h-40 place-items-center px-6 text-center text-sm text-muted-foreground">{{ t('skills.noUnmanagedSkills') }}</p>
            </ScrollArea>
          </section>
        </div>
      </div>
      <template #footer>
        <div class="mr-auto flex items-center gap-2 text-xs text-muted-foreground"><Badge :variant="pendingSelections.length ? 'secondary' : 'outline'">{{ pendingSelections.length }}</Badge>{{ t('skills.pendingManagementChanges') }}</div>
        <Button variant="ghost" size="48" :disabled="saving" @click="managerOpen = false">{{ t('common.cancel') }}</Button>
        <Button size="48" :disabled="saving || !pendingSelections.length" @click="saveManagement"><Icon name="askx-actions:confirm" :class="{ 'animate-pulse': saving }" />{{ saving ? t('common.saving') : t('skills.saveManagementConfiguration') }}</Button>
      </template>
    </CsResponsiveOverlayDialogDrawer>
  </div>
</template>
