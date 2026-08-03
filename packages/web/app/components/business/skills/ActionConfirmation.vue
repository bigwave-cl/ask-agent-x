<script setup lang="ts">
import type { SkillDecision, SkillPlanOperation, SkillsBatchPlan } from '@askx/module-skills/skill-types'

/** 操作确认属性。 */
interface Props {
  /** 后端生成的不可变计划。 */
  plan: SkillsBatchPlan
}

const props = defineProps<Props>()
const { t } = useI18n()

/** 确认页批次统计。 */
const planSummary = computed(() => [
  { key: 'adoptCount', value: props.plan.units.filter((unit) => unit.decision.kind === 'adopt').length },
  { key: 'mergeCount', value: props.plan.units.filter((unit) => unit.decision.kind === 'merge').length },
  { key: 'replaceCount', value: props.plan.units.filter((unit) => unit.decision.kind === 'replace').length },
  { key: 'renameCount', value: props.plan.units.filter((unit) => unit.decision.kind === 'rename-and-adopt').length },
  ...(props.plan.mode === 'connect' ? [{ key: 'backupCount', value: props.plan.platformOperations.length }] : []),
])

/** 决策类型对应的翻译 key。 */
const decisionKeys: Record<SkillDecision['kind'], string> = {
  adopt: 'adopt',
  merge: 'merge',
  replace: 'replace',
  'rename-and-adopt': 'rename',
  keep: 'keep',
  archive: 'archive',
}

/**
 * 将结构化计划操作转换为当前语言文案。
 * @param operation 领域层计划操作。
 */
function operationText(operation: SkillPlanOperation): string {
  if (operation.kind === 'keep') return t(props.plan.mode === 'sync' ? 'skills.syncOperationKeep' : 'skills.operationKeep')
  if (operation.kind === 'archive') return t('skills.operationArchive', { path: operation.path })
  if (operation.kind === 'copy-canonical') return t('skills.operationCopy', { source: operation.sourcePath, target: operation.targetPath })
  if (operation.kind === 'bind-platform') return t('skills.operationBind', { platform: operation.platform, path: operation.path, target: operation.target })
  if (operation.kind === 'select-source') return t(props.plan.mode === 'sync' ? 'skills.syncOperationSelectSource' : 'skills.operationSelectSource', { path: operation.sourcePath })
  if (operation.kind === 'replace') return t(props.plan.mode === 'sync' ? 'skills.syncOperationReplace' : 'skills.operationReplace', { path: operation.path })
  return t('skills.operationRename', { name: operation.name })
}
</script>

<template>
  <section class="grid gap-6">
    <header class="max-w-2xl">
      <Badge variant="secondary" class="mb-3 gap-1.5"><Icon name="askx-status:lock" class="size-3.5" />{{ t('skills.transactional') }}</Badge>
      <h2 class="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{{ t(plan.mode === 'sync' ? 'skills.syncConfirmTitle' : 'skills.confirmTitle') }}</h2>
      <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ t(plan.mode === 'sync' ? 'skills.syncConfirmDescription' : 'skills.confirmDescription') }}</p>
    </header>

    <div class="grid grid-cols-2 gap-3" :class="plan.mode === 'connect' ? 'sm:grid-cols-5' : 'sm:grid-cols-4'">
      <div v-for="item in planSummary" :key="item.key" class="rounded-2xl border bg-card p-4"><span class="text-xs text-muted-foreground">{{ t(`skills.${item.key}`) }}</span><strong class="mt-2 block text-2xl">{{ item.value }}</strong></div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div class="grid gap-3">
        <article v-if="plan.mode === 'connect'" class="overflow-hidden rounded-2xl border border-primary/20 bg-primary/5">
          <header class="flex items-center gap-3 border-b border-primary/15 px-4 py-3 sm:px-5"><span class="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground"><Icon name="askx-objects:branch" class="size-4" /></span><div><strong class="block text-sm">{{ t('skills.rootBindingTitle') }}</strong><span class="text-xs text-muted-foreground">{{ t('skills.rootBindingDescription') }}</span></div></header>
          <ul class="grid divide-y divide-primary/10">
            <li v-for="operation in plan.platformOperations" :key="operation.platform" class="grid gap-1 px-4 py-3 text-xs sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center sm:px-5"><strong class="uppercase tracking-[0.08em] text-primary">{{ operation.platform }}</strong><span class="break-all text-muted-foreground">{{ operationText(operation) }}</span></li>
          </ul>
        </article>
        <article v-else class="overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div class="flex items-start gap-3"><span class="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Icon name="askx-actions:flip-vertical" class="size-4" /></span><div><strong class="block text-sm">{{ t('skills.syncPlanTitle') }}</strong><p class="mt-1 text-xs leading-5 text-muted-foreground">{{ t('skills.syncPlanDescription') }}</p></div></div>
        </article>
        <article v-for="(unit, index) in plan.units" :key="unit.id" class="rounded-2xl border bg-card p-4 sm:p-5">
          <header class="flex items-center justify-between gap-4"><div class="flex items-center gap-3"><span class="font-mono text-[10px] text-primary">{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ unit.skillName }}</strong></div><Badge variant="outline">{{ t(`skills.${decisionKeys[unit.decision.kind]}`) }}</Badge></header>
          <ul class="mt-4 grid gap-2 text-xs text-muted-foreground"><li v-for="(operation, operationIndex) in unit.operations" :key="`${operation.kind}:${operationIndex}`" class="flex items-start gap-2"><Icon name="askx-navigation:arrow-right" class="mt-0.5 size-3 shrink-0 text-primary" /><span class="break-all">{{ operationText(operation) }}</span></li></ul>
          <p v-for="warning in unit.warnings" :key="warning" class="mt-3 flex items-start gap-2 text-xs text-warning"><Icon name="askx-status:warning" class="mt-0.5 size-3 shrink-0" />{{ warning }}</p>
        </article>
        <article v-if="!plan.units.length" class="rounded-2xl border border-dashed bg-card p-8 text-center"><Icon name="askx-objects:skills" class="mx-auto size-8 text-primary" /><h3 class="mt-4 font-semibold">{{ t('skills.noFilesFound') }}</h3><p class="mt-2 text-sm text-muted-foreground">{{ t(plan.mode === 'sync' ? 'skills.noSyncFilesDescription' : 'skills.noFilesDescription') }}</p></article>
      </div>

      <aside class="h-fit rounded-2xl border bg-muted/25 p-5 lg:sticky lg:top-20">
        <span class="text-xs font-medium">{{ t('skills.planHash') }}</span>
        <code class="mt-3 block break-all rounded-xl border bg-background p-3 font-mono text-[10px] leading-5 text-muted-foreground">{{ plan.hash }}</code>
        <Separator class="my-5" />
        <div class="grid gap-3 text-xs"><p class="flex justify-between"><span class="text-muted-foreground">SETTINGS REV</span><strong>#{{ plan.settingsRevision }}</strong></p><p class="flex justify-between"><span class="text-muted-foreground">MANIFEST REV</span><strong>#{{ plan.manifestRevision }}</strong></p><p class="flex justify-between"><span class="text-muted-foreground">UNITS</span><strong>{{ plan.units.length }}</strong></p></div>
      </aside>
    </div>

  </section>
</template>
