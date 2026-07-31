<script setup lang="ts">
import type { ManagedSkillHealth, ManagedSkillRecord, SkillsScanReport } from '@askx/module-skills/skill-types'

/** Skills 管理列表属性。 */
interface Props {
  /** manifest 中已接管的 Skill。 */
  managedSkills: ManagedSkillRecord[]
  /** 最新只读扫描报告。 */
  report: SkillsScanReport
  /** 受管 Skill 的只读健康状态。 */
  health: ManagedSkillHealth[]
}

const props = defineProps<Props>()
const emit = defineEmits<{ /** 发起重新扫描。 */ 'scan': [] }>()
const { t } = useI18n()
const managedNames = computed(() => new Set(props.managedSkills.map((skill) => skill.name)))
const unmanagedGroups = computed(() => props.report.groups.filter((group) => !managedNames.value.has(group.name)))
const conflictCount = computed(() => props.report.groups.filter((group) => group.status === 'conflict').length)
const driftCount = computed(() => props.health.filter((health) => health.drifted).length)
const brokenCount = computed(() => props.health.reduce((count, health) => count + health.brokenBindings, 0) + props.report.groups.filter((group) => group.status === 'broken').length)
const healthById = computed(() => new Map(props.health.map((health) => [health.skillId, health])))
</script>

<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 class="text-2xl font-semibold tracking-[-0.03em]">{{ t('skills.listTitle') }}</h2><p class="mt-2 text-sm text-muted-foreground">{{ t('skills.listDescription') }}</p></div>
      <Button variant="outline" size="40" @click="emit('scan')"><Icon name="askx-actions:refresh" />{{ t('skills.rescan') }}</Button>
    </header>
    <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div v-for="item in [{ key: 'managed', value: managedSkills.length }, { key: 'unmanaged', value: unmanagedGroups.length }, { key: 'conflicts', value: conflictCount }, { key: 'drifted', value: driftCount }, { key: 'brokenBindings', value: brokenCount }, { key: 'platforms', value: report.platforms.length }]" :key="item.key" class="rounded-2xl border bg-card p-4"><span class="text-xs text-muted-foreground">{{ t(`skills.${item.key}`) }}</span><strong class="mt-2 block text-2xl">{{ item.value }}</strong></div>
    </div>
    <div class="grid gap-3">
      <article v-for="skill in managedSkills" :key="skill.id" class="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 items-center gap-4"><span class="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon name="askx-objects:skills" class="size-5" /></span><div class="min-w-0"><strong class="block truncate">{{ skill.name }}</strong><span class="mt-1 block truncate font-mono text-[10px] text-muted-foreground">{{ skill.contentHash.slice(0, 18) }}</span></div></div>
        <div class="flex flex-wrap gap-2"><Badge v-if="healthById.get(skill.id)?.drifted" variant="destructive">{{ t('skills.drifted') }}</Badge><Badge v-if="healthById.get(skill.id)?.brokenBindings" variant="destructive">{{ t('skills.brokenBindings') }}</Badge><Badge v-for="binding in skill.bindings" :key="binding.path" variant="secondary">{{ binding.platform }}</Badge><Badge v-if="!skill.bindings.length" variant="outline">{{ t('skills.managed') }}</Badge></div>
      </article>
      <article v-for="group in unmanagedGroups" :key="group.id" class="flex items-center justify-between gap-4 rounded-2xl border border-dashed bg-muted/15 p-5"><div><strong class="block">{{ group.name }}</strong><span class="mt-1 block text-xs text-muted-foreground">{{ t(`skills.${group.status}`) }} · {{ t('skills.locations', { count: group.locations.length }) }}</span></div><Badge :variant="group.status === 'conflict' ? 'destructive' : 'outline'">{{ t('skills.unmanaged') }}</Badge></article>
    </div>
  </section>
</template>
