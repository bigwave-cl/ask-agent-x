<script setup lang="ts">
import type { SkillDecision, SkillGroup, SkillLocation, SkillPlatformId } from '@askx/module-skills/skill-types'
import { getSkillPlatformPresentation } from '@/lib/skillPlatformPresentation'

/** Skill 决策卡属性。 */
interface Props {
  /** 同名 Skill 聚合分组。 */
  group: SkillGroup
  /** 当前用户决策。 */
  decision: SkillDecision
  /** 默认管理平台。 */
  platforms: SkillPlatformId[]
}

const props = defineProps<Props>()
const emit = defineEmits<{ /** 更新当前分组决策。 */ 'update:decision': [value: SkillDecision] }>()
const { t } = useI18n()
const renameName = ref(`${props.group.name}-alt`)
const renameSourceId = ref(props.group.locations.find((location) => location.metadata.valid && !location.broken)?.id ?? '')
/** 可用于重命名接管的来源选项。 */
const renameSourceOptions = computed(() => props.group.locations
  .filter((location) => location.metadata.valid && !location.broken)
  .map((location) => ({ value: location.id, label: `${locationSourceName(location)} · ${location.name}` })))
/** 可以进入备份区的平台副本；额外扫描目录始终保持只读。 */
const archivableLocations = computed(() => props.group.locations.filter((location) => location.platform !== 'custom'))

/** 返回位置来源的本地化名称。 */
function locationSourceName(location: SkillLocation): string {
  return location.platform === 'custom' ? t('skills.customFolderSource') : getSkillPlatformPresentation(location.platform).name
}

/** 当前决策是否为指定类型。 */
function active(kind: SkillDecision['kind']): boolean {
  return props.decision.kind === kind
}

/** 选择接管或合并。 */
function selectCanonical(kind: 'adopt' | 'merge'): void {
  const source = props.group.locations.find((location) => location.metadata.valid && !location.broken)
  if (source) emit('update:decision', { kind, sourceLocationId: source.id, platforms: props.platforms })
}

/** 选择某个冲突版本覆盖其他副本。 */
function selectReplacement(sourceLocationId: string): void {
  const targetLocationIds = props.group.locations
    .filter((location) => location.id !== sourceLocationId && location.platform !== 'custom')
    .map((location) => location.id)
  emit('update:decision', targetLocationIds.length
    ? { kind: 'replace', sourceLocationId, targetLocationIds }
    : { kind: 'adopt', sourceLocationId, platforms: props.platforms })
}

/** 更新重命名接管决策。 */
function updateRename(): void {
  if (!renameSourceId.value || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(renameName.value)) return
  emit('update:decision', { kind: 'rename-and-adopt', sourceLocationId: renameSourceId.value, newName: renameName.value, platforms: props.platforms })
}

/**
 * 切换一个待移入备份区的平台副本。
 * @param locationId 扫描位置标识。
 * @param selected 是否选中。
 */
function toggleArchiveLocation(locationId: string, selected: boolean): void {
  const current = props.decision.kind === 'archive' ? props.decision.locationIds : archivableLocations.value.map((location) => location.id)
  const next = selected ? [...new Set([...current, locationId])] : current.filter((id) => id !== locationId)
  emit('update:decision', next.length ? { kind: 'archive', locationIds: next } : { kind: 'keep', groupId: props.group.id })
}
</script>

<template>
  <article class="border-b bg-card transition-colors last:border-b-0 hover:bg-muted/10">
    <div class="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,.55fr)_auto] lg:items-center lg:gap-5">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2"><strong class="truncate text-sm sm:text-base">{{ group.name }}</strong><Badge :variant="group.status === 'conflict' || group.status === 'broken' ? 'destructive' : 'secondary'">{{ t(`skills.${group.status}`) }}</Badge></div>
        <p class="mt-1 line-clamp-2 max-w-2xl text-xs leading-5 text-muted-foreground">{{ group.locations.find((location) => location.metadata.description)?.metadata.description ?? group.locations.find((location) => location.metadata.error)?.metadata.error ?? t('skills.noSkillDescription') }}</p>
      </div>

      <div class="flex min-w-0 flex-wrap items-center gap-1.5">
        <span v-for="location in group.locations" :key="location.id" class="flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[10px] text-muted-foreground"><Icon :name="getSkillPlatformPresentation(location.platform).icon" class="size-3 shrink-0" aria-hidden="true" /><span class="truncate">{{ locationSourceName(location) }}</span></span>
        <span class="font-mono text-[9px] text-muted-foreground/70">{{ group.hashes[0]?.slice(0, 8) ?? 'NO HASH' }}</span>
      </div>

      <div class="flex flex-wrap items-center gap-2 lg:justify-end">
        <Button v-if="group.status === 'unique'" size="36" :variant="active('adopt') ? 'default' : 'outline'" @click="selectCanonical('adopt')">{{ t('skills.adopt') }}</Button>
        <Button v-if="group.status === 'identical'" size="36" :variant="active('merge') ? 'default' : 'outline'" @click="selectCanonical('merge')">{{ t('skills.merge') }}</Button>
        <Button size="36" :variant="active('keep') ? 'secondary' : 'outline'" @click="emit('update:decision', { kind: 'keep', groupId: group.id })">{{ t('skills.keep') }}</Button>
        <Button v-if="archivableLocations.length" size="36" :variant="active('archive') ? 'destructive' : 'outline'" @click="emit('update:decision', { kind: 'archive', locationIds: archivableLocations.map((location) => location.id) })">{{ t('skills.archive') }}</Button>
      </div>
    </div>

    <div v-if="group.status === 'conflict'" class="border-t border-warning/20 bg-warning/5 px-4 py-4 sm:px-5">
      <div class="flex items-center gap-2 text-xs font-medium text-warning"><Icon name="askx-status:warning" class="size-3.5" aria-hidden="true" />{{ t('skills.chooseVersion') }}</div>
      <div class="mt-3 grid gap-2 sm:grid-cols-3">
        <button v-for="location in group.locations" :key="location.id" type="button" class="rounded-xl border bg-background p-3 text-left text-xs transition hover:border-primary" :class="(decision.kind === 'replace' || decision.kind === 'adopt') && decision.sourceLocationId === location.id ? 'border-primary ring-2 ring-primary/15' : ''" @click="selectReplacement(location.id)">
          <span class="flex items-center gap-2"><Icon :name="getSkillPlatformPresentation(location.platform).icon" class="size-4 shrink-0" aria-hidden="true" /><strong class="block">{{ locationSourceName(location) }}</strong></span>
          <span class="mt-1 block font-mono text-[10px] text-muted-foreground">{{ location.contentHash?.slice(0, 12) }}</span>
        </button>
      </div>
    </div>

    <details v-if="group.status !== 'broken'" class="border-t bg-muted/15 px-4 py-3 sm:px-5" :open="active('rename-and-adopt')">
      <summary class="cursor-pointer text-xs font-medium text-muted-foreground transition hover:text-foreground">{{ t('skills.advancedActions') }}</summary>
      <div class="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <CsResponsiveSelect v-model="renameSourceId" :options="renameSourceOptions" :title="t('skills.selectRenameSource')" :placeholder="t('skills.selectRenameSource')" :close-label="t('skills.closeSourceSelection')" :empty-text="t('skills.noValidSource')" :clear-label="t('skills.clearSourceSelection')" trigger-class="h-10" @change="updateRename" />
        <Input v-model="renameName" :placeholder="t('skills.renamePlaceholder')" @input="updateRename" />
        <Button variant="outline" size="40" :disabled="!renameSourceId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(renameName)" @click="updateRename">{{ t('skills.rename') }}</Button>
      </div>
    </details>

    <div v-if="decision.kind === 'archive'" class="border-t border-destructive/20 bg-destructive/5 px-4 py-4 sm:px-5">
      <p class="flex items-center gap-2 text-xs text-destructive"><Icon name="askx-status:warning" class="size-3.5" />{{ t('skills.archiveHint') }}</p>
      <p class="mt-3 text-xs font-medium">{{ t('skills.chooseArchiveCopies') }}</p>
      <div class="mt-2 grid gap-2 sm:grid-cols-3"><label v-for="location in archivableLocations" :key="location.id" class="flex cursor-pointer items-center gap-2 rounded-lg border bg-background p-3 text-xs"><Checkbox :model-value="decision.locationIds.includes(location.id)" @update:model-value="toggleArchiveLocation(location.id, Boolean($event))" /><span><span class="flex items-center gap-2"><Icon :name="getSkillPlatformPresentation(location.platform).icon" class="size-4 shrink-0" aria-hidden="true" /><strong class="block">{{ locationSourceName(location) }}</strong></span><span class="mt-0.5 block text-muted-foreground">{{ location.name }}</span></span></label></div>
    </div>
  </article>
</template>
