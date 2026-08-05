<script setup lang="ts">
import type { SkillStatsReport } from '@askx/module-skills/skill-manager-registry'

/** Skill 统计属性。 */
interface Props {
  /** 当前是否显示统计页。 */ active: boolean
  /** 共享统一源中的用户 Skill 总数。 */ sharedTotal: number
}

const props = defineProps<Props>()
const { t } = useI18n()
const toast = useToast()
/** 已加载的统计报告；组件生命周期内复用。 */
const report = ref<SkillStatsReport | null>(null)
/** 首次异步加载状态。 */
const loading = ref(false)
/** Registry 当前是否不可读取。 */
const failed = ref(false)

/** 首次进入统计页时异步读取 Registry。 */
async function loadStats(): Promise<void> {
  if (report.value || loading.value) return
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

watch(() => props.active, active => { if (active) void loadStats() }, { immediate: true })
</script>

<template>
  <section class="overflow-hidden rounded-[24px] border bg-card shadow-sm">
    <header class="border-b bg-gradient-to-r from-primary/10 via-transparent to-transparent px-5 py-6 sm:px-7">
      <p class="text-[10px] font-medium uppercase tracking-[0.18em] text-primary">{{ t('skills.statsEyebrow') }}</p>
      <h2 class="mt-2 text-2xl font-semibold">{{ t('skills.statsTitle') }}</h2>
      <p class="mt-2 text-sm text-muted-foreground">{{ t('skills.statsDescription') }}</p>
    </header>
    <div v-if="loading" class="grid gap-4 p-6 sm:grid-cols-4"><Skeleton v-for="index in 4" :key="index" class="h-24 rounded-xl" /></div>
    <div v-else-if="failed" class="grid min-h-56 place-items-center p-6 text-center">
      <div class="max-w-md"><Icon name="askx-status:warning" class="mx-auto size-8 text-warning" /><h3 class="mt-3 font-semibold">{{ t('skills.statsUnavailableTitle') }}</h3><p class="mt-2 text-sm leading-6 text-muted-foreground">{{ t('skills.statsUnavailableDescription') }}</p><Button variant="outline" size="40" class="mt-4" @click="loadStats"><Icon name="askx-actions:refresh" />{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="report" class="grid gap-6 p-5 sm:p-7">
      <div class="grid gap-3 sm:grid-cols-4">
        <div v-for="item in [
          { label: t('skills.statsManaged'), value: `${report.totalSkills}/${sharedTotal}` },
          { label: t('skills.statsUsage'), value: report.totalUsage },
          { label: t('skills.statsTargets'), value: report.totalTargets },
          { label: t('skills.statsIssues'), value: report.issueTargets },
        ]" :key="item.label" class="rounded-xl border bg-background px-4 py-4"><span class="text-xs text-muted-foreground">{{ item.label }}</span><strong class="mt-2 block text-2xl">{{ item.value }}</strong></div>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="rounded-xl border p-4"><h3 class="text-sm font-semibold">{{ t('skills.statsVersionDistribution') }}</h3><div class="mt-3 flex flex-wrap gap-2"><Badge v-for="(count, version) in report.versions" :key="version" variant="secondary">{{ version }} · {{ count }}</Badge><span v-if="!Object.keys(report.versions).length" class="text-xs text-muted-foreground">{{ t('skills.statsEmpty') }}</span></div></section>
        <section class="rounded-xl border p-4"><h3 class="text-sm font-semibold">{{ t('skills.statsTargetDistribution') }}</h3><div class="mt-3 flex flex-wrap gap-2"><Badge v-for="(count, status) in report.targetStatuses" :key="status" :variant="['stale', 'conflict', 'failed'].includes(status) ? 'destructive' : 'secondary'">{{ status }} · {{ count }}</Badge><span v-if="!Object.keys(report.targetStatuses).length" class="text-xs text-muted-foreground">{{ t('skills.statsNoTargets') }}</span></div></section>
      </div>
      <div class="overflow-hidden rounded-xl border">
        <div v-for="item in report.items" :key="item.skillId" class="grid gap-2 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_7rem_7rem] sm:items-start">
          <div class="min-w-0"><strong class="block truncate text-sm">{{ item.name }}</strong><span class="font-mono text-[10px] text-muted-foreground">{{ item.skillId }}</span><div class="mt-2 flex flex-wrap gap-1.5"><span v-for="target in item.targets" :key="target.key" class="max-w-64 truncate rounded-lg border bg-muted/25 px-2 py-1 text-[9px] text-muted-foreground" :title="target.path">{{ target.kind }} · {{ target.status }} · {{ target.path }}</span></div></div>
          <span class="text-xs text-muted-foreground">{{ item.version || t('skills.unmanagedVersion') }}</span>
          <span class="text-xs">{{ t('skills.statsUsageValue', { count: item.usageCount }) }}</span>
        </div>
        <p v-if="!report.items.length" class="p-10 text-center text-sm text-muted-foreground">{{ t('skills.statsEmpty') }}</p>
      </div>
    </div>
  </section>
</template>
