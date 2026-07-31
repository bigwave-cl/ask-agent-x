<script setup lang="ts">
import type { SkillDecision, SkillGroup, SkillPlatformId, SkillsScanReport } from '@askx/module-skills/skill-types'
import { skillPlatformPresentations } from '@/lib/skillPlatformPresentation'

/** 扫描结果组件属性。 */
interface Props {
  /** 最新只读扫描报告。 */
  report: SkillsScanReport
  /** 每个分组的当前决策。 */
  decisions: SkillDecision[]
  /** 当前管理平台。 */
  platforms: SkillPlatformId[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  /** 更新一个分组的决策。 */
  'update-decision': [groupId: string, decision: SkillDecision]
  /** 重新执行扫描。 */
  'rescan': []
}>()
const { t } = useI18n()

/** 返回平台对应的副本。 */
function platformLocations(platform: SkillPlatformId) {
  return props.report.locations.filter((location) => location.platform === platform)
}

/** 返回一个额外目录中发现的 Skill。 */
function customRootLocations(rootId: string) {
  return props.report.locations.filter((location) => location.platform === 'custom' && location.customRootId === rootId)
}

/** 返回分组对应的当前决策。 */
function groupDecision(group: SkillGroup): SkillDecision {
  return props.decisions.find((decision) => {
    if (decision.kind === 'keep') return decision.groupId === group.id
    if (decision.kind === 'archive') return decision.locationIds.some((id) => group.locations.some((location) => location.id === id))
    return group.locations.some((location) => location.id === decision.sourceLocationId)
  }) ?? { kind: 'keep', groupId: group.id }
}
</script>

<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="max-w-2xl">
        <Badge variant="secondary" class="mb-3 gap-1.5"><Icon name="askx-status:check" class="size-3.5" />{{ t('skills.safeRead') }}</Badge>
        <h2 class="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{{ t('skills.scanTitle') }}</h2>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ t('skills.scanDescription') }}</p>
      </div>
      <Button variant="outline" size="40" @click="emit('rescan')"><Icon name="askx-actions:refresh" />{{ t('skills.rescan') }}</Button>
    </header>

    <div class="grid gap-4 lg:grid-cols-3">
      <article v-for="platform in report.platformStatuses" :key="platform.id" class="min-w-0 overflow-hidden rounded-2xl border bg-card">
        <header class="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
          <div class="flex min-w-0 items-center gap-2"><Icon :name="skillPlatformPresentations[platform.id].icon" class="size-4 shrink-0" aria-hidden="true" /><strong class="truncate text-sm">{{ skillPlatformPresentations[platform.id].name }}</strong><span class="font-mono text-[10px] text-muted-foreground">{{ platformLocations(platform.id).length }}</span></div>
          <i class="size-2 rounded-full" :class="platform.linkSupported ? 'bg-success' : 'bg-warning'" />
        </header>
        <ScrollArea class="h-[30rem]" viewport-class="overscroll-contain" type="always" :aria-label="platform.name">
          <div class="grid gap-2 p-3 pr-5">
            <div v-if="!platformLocations(platform.id).length" class="grid min-h-32 place-items-center rounded-xl border border-dashed bg-muted/15 px-4 text-center text-xs text-muted-foreground">{{ t('skills.platformEmpty') }}</div>
            <div v-for="location in platformLocations(platform.id)" :key="location.id" class="rounded-xl border bg-background p-3">
              <div class="flex items-start justify-between gap-3"><strong class="min-w-0 truncate text-sm">{{ location.name }}</strong><Badge :variant="location.broken || !location.metadata.valid ? 'destructive' : 'secondary'">{{ location.broken ? t('skills.broken') : location.metadata.valid ? t('skills.valid') : t('skills.invalid') }}</Badge></div>
              <p class="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{{ location.metadata.description ?? location.metadata.error }}</p>
              <span class="mt-3 block truncate font-mono text-[9px] text-muted-foreground">{{ location.contentHash?.slice(0, 16) ?? 'NO HASH' }}</span>
            </div>
          </div>
        </ScrollArea>
      </article>
    </div>

    <section v-if="report.customRoots.length" class="overflow-hidden rounded-2xl border bg-card">
      <header class="flex flex-col gap-2 border-b bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-2"><Icon name="askx-objects:file" class="size-4 text-primary" aria-hidden="true" /><strong class="text-sm">{{ t('skills.customFolderSource') }}</strong></div>
        <span class="font-mono text-[10px] text-muted-foreground">{{ t('skills.folderCount', { count: report.customRoots.length }) }}</span>
      </header>
      <div class="grid gap-2 p-3 sm:grid-cols-2">
        <article v-for="root in report.customRoots" :key="root.id" class="min-w-0 rounded-xl border bg-background p-3">
          <div class="flex min-w-0 items-center justify-between gap-3"><strong class="truncate text-sm">{{ root.name }}</strong><Badge variant="secondary">{{ t('skills.customFolderSkills', { count: customRootLocations(root.id).length }) }}</Badge></div>
          <p class="mt-1 truncate font-mono text-[9px] text-muted-foreground sm:text-[10px]">{{ root.path }}</p>
          <div v-if="customRootLocations(root.id).length" class="mt-3 flex flex-wrap gap-1.5">
            <span v-for="location in customRootLocations(root.id)" :key="location.id" class="max-w-full truncate rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground">{{ location.name }}</span>
          </div>
        </article>
      </div>
    </section>

    <div class="grid gap-3">
      <div class="flex items-center gap-3"><span class="font-mono text-[10px] text-primary">02 / DECISIONS</span><Separator class="flex-1" /></div>
      <BusSkillsSkillDecision
        v-for="group in report.groups"
        :key="group.id"
        :group="group"
        :decision="groupDecision(group)"
        :platforms="platforms"
        @update:decision="emit('update-decision', group.id, $event)"
      />
      <div v-if="!report.groups.length" class="rounded-2xl border border-dashed bg-card/70 p-8 text-center">
        <Icon name="askx-objects:skills" class="mx-auto size-8 text-primary" />
        <h3 class="mt-4 font-semibold">{{ t('skills.noFilesFound') }}</h3>
        <p class="mt-2 text-sm text-muted-foreground">{{ t('skills.noFilesDescription') }}</p>
      </div>
    </div>

  </section>
</template>
