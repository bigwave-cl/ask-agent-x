<script setup lang="ts">
import type { SkillsBatchMode, SkillsBatchReceipt } from '@askx/module-skills/skill-types'

/** 执行结果属性。 */
interface Props {
  /** 批量事务回执。 */
  receipt: SkillsBatchReceipt
  /** 当前批次是平台接入还是只同步统一源。 */
  mode: SkillsBatchMode
}

const props = defineProps<Props>()
const { t } = useI18n()

/** 是否存在未接入成功的平台。 */
const hasPlatformFailures = computed(() => props.receipt.platformResults.some((result) => result.status === 'failed'))

/** 状态对应的本地图标。 */
const statusIcons = {
  applied: 'askx-status:check',
  skipped: 'askx-status:info',
  'rolled-back': 'askx-status:warning',
  failed: 'askx-status:error',
} as const

/** 状态对应的翻译 key。 */
const statusKeys = { applied: 'applied', skipped: 'skipped', 'rolled-back': 'rolledBack', failed: 'failed' } as const
</script>

<template>
  <section class="overflow-hidden rounded-[28px] border bg-card shadow-sm">
    <header class="relative overflow-hidden border-b p-6 sm:p-9">
      <div class="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-primary/15 blur-3xl" />
      <div class="relative max-w-2xl"><span class="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg"><Icon :name="hasPlatformFailures ? 'askx-status:warning' : 'askx-status:check'" class="size-5" /></span><h2 class="mt-6 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{{ t(mode === 'sync' ? 'skills.syncResultTitle' : hasPlatformFailures ? 'skills.resultPartialTitle' : 'skills.resultTitle') }}</h2><p class="mt-2 text-sm leading-6 text-muted-foreground">{{ t(mode === 'sync' ? 'skills.syncResultDescription' : hasPlatformFailures ? 'skills.resultPartialDescription' : 'skills.resultDescription') }}</p></div>
    </header>
    <div class="grid gap-3 p-4 sm:p-6">
      <article v-for="result in receipt.platformResults ?? []" :key="result.platform" class="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Icon name="askx-objects:branch" class="size-4" /></span>
        <div class="min-w-0 flex-1"><strong class="block text-sm uppercase">{{ result.platform }}</strong><span class="mt-1 block truncate font-mono text-[9px] text-muted-foreground" :title="result.path">{{ result.path }} → {{ result.target }}</span></div>
        <Badge :variant="result.status === 'applied' ? 'secondary' : 'destructive'">{{ t(`skills.${statusKeys[result.status]}`) }}</Badge>
        <ul v-if="result.warnings.length" class="basis-full text-xs text-destructive"><li v-for="warning in result.warnings" :key="warning">{{ warning }}</li></ul>
      </article>
      <article v-for="result in receipt.results" :key="result.receiptId" class="rounded-2xl border bg-background p-4">
        <div class="flex items-start justify-between gap-4"><div class="flex items-center gap-3"><span class="grid size-8 place-items-center rounded-full bg-muted"><Icon :name="statusIcons[result.status]" class="size-4" /></span><div><strong class="block text-sm">{{ result.skillName }}</strong><span class="mt-0.5 block font-mono text-[9px] text-muted-foreground">{{ result.receiptId }}</span></div></div><Badge :variant="result.status === 'failed' || result.status === 'rolled-back' ? 'destructive' : 'secondary'">{{ t(`skills.${statusKeys[result.status]}`) }}</Badge></div>
        <ul v-if="result.warnings.length" class="mt-3 grid gap-1 border-t pt-3 text-xs text-muted-foreground"><li v-for="warning in result.warnings" :key="warning">{{ warning }}</li></ul>
      </article>
      <p v-if="!receipt.results.length" class="rounded-xl bg-muted/40 p-5 text-center text-sm text-muted-foreground">{{ t(mode === 'sync' ? 'skills.syncNoChanges' : 'skills.emptyCanonicalConnected') }}</p>
    </div>
  </section>
</template>
