<script setup lang="ts">
import type { SkillDecision, SkillPlanOperation, SkillsBatchPlan } from '@askx/module-skills/skill-types'
import { skillPlatformPresentations } from '@/lib/skillPlatformPresentation'

/** 操作确认属性。 */
interface Props {
  /** 后端生成的不可变计划。 */
  plan: SkillsBatchPlan
}

const props = defineProps<Props>()
const { t } = useI18n()

/** 保存配置后会进入 AskX 统一源的 Skill 计划单元。 */
const acquiredSkillUnits = computed(() => props.plan.units.filter((unit) => !['keep', 'archive'].includes(unit.decision.kind)))

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
  if (operation.kind === 'bind-custom-root') return t('skills.operationBindCustomRoot', { name: operation.name, path: operation.path, target: operation.target })
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

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div class="grid gap-3">
        <article v-if="plan.mode === 'connect'" class="overflow-hidden rounded-2xl border border-primary/20 bg-primary/5">
          <header class="flex items-center justify-between gap-4 border-b border-primary/15 px-4 py-4 sm:px-5">
            <div class="flex items-center gap-3"><span class="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Icon name="askx-objects:branch" class="size-4" /></span><div><strong class="block text-sm">{{ t('skills.confirmPlatformsTitle') }}</strong><span class="text-xs text-muted-foreground">{{ t('skills.confirmPlatformsDescription') }}</span></div></div>
            <Badge variant="secondary">{{ plan.platformOperations.length + plan.customLinkOperations.length }}</Badge>
          </header>
          <ul v-if="plan.platformOperations.length" class="grid divide-y divide-primary/10">
            <li v-for="operation in plan.platformOperations" :key="operation.platform" class="flex min-w-0 items-center gap-3 px-4 py-3 sm:px-5">
              <span class="grid size-9 shrink-0 place-items-center rounded-xl border bg-card shadow-xs"><Icon :name="skillPlatformPresentations[operation.platform].icon" class="size-4.5" aria-hidden="true" /></span>
              <span class="min-w-0 flex-1"><strong class="block text-sm">{{ skillPlatformPresentations[operation.platform].name }}</strong><code class="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground" :title="operation.path">{{ operation.path }}</code></span>
              <Icon name="askx-navigation:arrow-right" class="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <code class="max-w-[42%] truncate font-mono text-[9px] text-muted-foreground" :title="operation.target">{{ operation.target }}</code>
            </li>
          </ul>
          <ul v-if="plan.customLinkOperations.length" class="grid divide-y divide-primary/10 border-t border-primary/15">
            <li v-for="operation in plan.customLinkOperations" :key="operation.id" class="flex min-w-0 items-center gap-3 px-4 py-3 sm:px-5">
              <span class="grid size-9 shrink-0 place-items-center rounded-xl border bg-card text-primary shadow-xs"><Icon name="askx-objects:folder" class="size-4.5" aria-hidden="true" /></span>
              <span class="min-w-0 flex-1"><strong class="block text-sm">{{ operation.name }}</strong><code class="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground" :title="operation.path">{{ operation.path }}</code></span>
              <Icon name="askx-navigation:arrow-right" class="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <code class="max-w-[42%] truncate font-mono text-[9px] text-muted-foreground" :title="operation.target">{{ operation.target }}</code>
            </li>
          </ul>
          <p v-if="!plan.platformOperations.length && !plan.customLinkOperations.length" class="px-5 py-5 text-sm text-muted-foreground">{{ t('skills.confirmNoPlatforms') }}</p>
        </article>
        <article v-else class="overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div class="flex items-start gap-3"><span class="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Icon name="askx-actions:flip-vertical" class="size-4" /></span><div><strong class="block text-sm">{{ t('skills.syncPlanTitle') }}</strong><p class="mt-1 text-xs leading-5 text-muted-foreground">{{ t('skills.syncPlanDescription') }}</p></div></div>
        </article>
        <article class="overflow-hidden rounded-2xl border bg-card">
          <header class="flex items-center justify-between gap-4 border-b bg-muted/15 px-4 py-4 sm:px-5">
            <div class="flex items-center gap-3"><span class="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name="askx-objects:skills" class="size-4" /></span><div><strong class="block text-sm">{{ t('skills.confirmSkillsTitle') }}</strong><span class="text-xs text-muted-foreground">{{ t('skills.confirmSkillsDescription') }}</span></div></div>
            <Badge variant="secondary">{{ t('skills.confirmSkillsCount', { count: acquiredSkillUnits.length }) }}</Badge>
          </header>
          <ul v-if="acquiredSkillUnits.length" class="grid divide-y sm:grid-cols-2 sm:[&>li:nth-child(odd)]:border-r">
            <li v-for="(unit, index) in acquiredSkillUnits" :key="unit.id" class="min-w-0 px-4 py-3.5 sm:px-5">
              <div class="flex min-w-0 items-center gap-3">
                <span class="font-mono text-[9px] text-primary">{{ String(index + 1).padStart(2, '0') }}</span>
                <strong class="min-w-0 flex-1 truncate text-sm" :title="unit.skillName">{{ unit.skillName }}</strong>
                <Badge variant="outline" class="shrink-0">{{ t(`skills.${decisionKeys[unit.decision.kind]}`) }}</Badge>
              </div>
              <details v-if="unit.operations.length || unit.warnings.length" class="group mt-2 text-xs text-muted-foreground">
                <summary class="cursor-pointer select-none text-[10px] text-primary/80">{{ t('skills.confirmSkillDetails') }}</summary>
                <ul class="mt-2 grid gap-1.5"><li v-for="(operation, operationIndex) in unit.operations" :key="`${operation.kind}:${operationIndex}`" class="flex items-start gap-2"><Icon name="askx-navigation:arrow-right" class="mt-0.5 size-3 shrink-0 text-primary" /><span class="break-all">{{ operationText(operation) }}</span></li></ul>
                <p v-for="warning in unit.warnings" :key="warning" class="mt-2 flex items-start gap-2 text-warning"><Icon name="askx-status:warning" class="mt-0.5 size-3 shrink-0" />{{ warning }}</p>
              </details>
            </li>
          </ul>
          <div v-else class="p-8 text-center"><Icon name="askx-objects:skills" class="mx-auto size-8 text-primary" /><h3 class="mt-4 font-semibold">{{ t('skills.noFilesFound') }}</h3><p class="mt-2 text-sm text-muted-foreground">{{ t(plan.mode === 'sync' ? 'skills.noSyncFilesDescription' : 'skills.noFilesDescription') }}</p></div>
        </article>
      </div>

      <aside class="h-fit rounded-2xl border bg-muted/25 p-5 lg:sticky lg:top-20">
        <span class="text-xs font-medium">{{ t('skills.confirmTechnicalDetails') }}</span>
        <code class="mt-3 block break-all rounded-xl border bg-background p-3 font-mono text-[10px] leading-5 text-muted-foreground">{{ plan.hash }}</code>
        <Separator class="my-5" />
        <div class="grid gap-3 text-xs"><p class="flex justify-between"><span class="text-muted-foreground">SETTINGS REV</span><strong>#{{ plan.settingsRevision }}</strong></p><p class="flex justify-between"><span class="text-muted-foreground">MANIFEST REV</span><strong>#{{ plan.manifestRevision }}</strong></p><p class="flex justify-between"><span class="text-muted-foreground">SKILLS</span><strong>{{ acquiredSkillUnits.length }}</strong></p></div>
      </aside>
    </div>

  </section>
</template>
