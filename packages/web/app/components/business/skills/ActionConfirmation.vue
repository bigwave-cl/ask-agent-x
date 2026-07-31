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
  { key: 'backupCount', value: props.plan.units.flatMap((unit) => unit.operations).filter((operation) => operation.kind === 'archive' || operation.kind === 'replace').length },
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
  if (operation.kind === 'keep') return t('skills.operationKeep')
  if (operation.kind === 'archive') return t('skills.operationArchive', { path: operation.path })
  if (operation.kind === 'copy-canonical') return t('skills.operationCopy', { source: operation.sourcePath, target: operation.targetPath })
  if (operation.kind === 'bind-platform') return t('skills.operationBind', { platform: operation.platform })
  if (operation.kind === 'select-source') return t('skills.operationSelectSource', { path: operation.sourcePath })
  if (operation.kind === 'replace') return t('skills.operationReplace', { path: operation.path })
  return t('skills.operationRename', { name: operation.name })
}
</script>

<template>
  <section class="grid gap-6">
    <header class="max-w-2xl">
      <Badge variant="secondary" class="mb-3 gap-1.5"><Icon name="askx-status:lock" class="size-3.5" />{{ t('skills.transactional') }}</Badge>
      <h2 class="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{{ t('skills.confirmTitle') }}</h2>
      <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ t('skills.confirmDescription') }}</p>
    </header>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div v-for="item in planSummary" :key="item.key" class="rounded-2xl border bg-card p-4"><span class="text-xs text-muted-foreground">{{ t(`skills.${item.key}`) }}</span><strong class="mt-2 block text-2xl">{{ item.value }}</strong></div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div class="grid gap-3">
        <article v-for="(unit, index) in plan.units" :key="unit.id" class="rounded-2xl border bg-card p-4 sm:p-5">
          <header class="flex items-center justify-between gap-4"><div class="flex items-center gap-3"><span class="font-mono text-[10px] text-primary">{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ unit.skillName }}</strong></div><Badge variant="outline">{{ t(`skills.${decisionKeys[unit.decision.kind]}`) }}</Badge></header>
          <ul class="mt-4 grid gap-2 text-xs text-muted-foreground"><li v-for="(operation, operationIndex) in unit.operations" :key="`${operation.kind}:${operationIndex}`" class="flex items-start gap-2"><Icon name="askx-navigation:arrow-right" class="mt-0.5 size-3 shrink-0 text-primary" /><span class="break-all">{{ operationText(operation) }}</span></li></ul>
          <p v-for="warning in unit.warnings" :key="warning" class="mt-3 flex items-start gap-2 text-xs text-warning"><Icon name="askx-status:warning" class="mt-0.5 size-3 shrink-0" />{{ warning }}</p>
        </article>
        <article v-if="!plan.units.length" class="rounded-2xl border border-dashed bg-card p-8 text-center"><Icon name="askx-objects:skills" class="mx-auto size-8 text-primary" /><h3 class="mt-4 font-semibold">{{ t('skills.noFilesFound') }}</h3><p class="mt-2 text-sm text-muted-foreground">{{ t('skills.noFilesDescription') }}</p></article>
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
