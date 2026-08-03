<script setup lang="ts">
import type { SkillCustomScanRoot, SkillDecision, SkillGroup, SkillLocation } from '@askx/module-skills/skill-types'
import type { AskxIconName } from '@/lib/iconCatalog'
import type { ResponsiveSelectOption } from '@/components/common/responsive-select/types'
import { getSkillPlatformPresentation } from '@/lib/skillPlatformPresentation'

/** Skill 修改状态的展示信息。 */
interface DecisionPresentation {
  /** 状态名称。 */
  label: string
  /** 保存后产生的结果说明。 */
  description: string
  /** 状态使用的本地图标。 */
  icon: AskxIconName
  /** 状态色彩语义。 */
  tone: 'primary' | 'neutral' | 'destructive'
}

/** Skill 决策卡属性。 */
interface Props {
  /** 同名 Skill 聚合分组。 */
  group: SkillGroup
  /** 当前用户决策。 */
  decision: SkillDecision
  /** 用户选择的额外扫描根目录。 */
  customRoots: SkillCustomScanRoot[]
}

const props = defineProps<Props>()
const emit = defineEmits<{ /** 更新当前分组决策。 */ 'update:decision': [value: SkillDecision] }>()
const { t } = useI18n()
/** 组件创建时的决策快照，用于稳定推导高级操作初值。 */
const initialDecision = props.decision
/** 首次打开高级操作时使用的重命名来源。 */
const initialRenameSource = initialDecision.kind === 'rename-and-adopt'
  ? props.group.locations.find(location => location.id === initialDecision.sourceLocationId)
  : props.group.locations.find(location => location.metadata.valid && !location.broken)
/** 重命名接管使用的目标名称，默认采用选中来源的 Skill 名称。 */
const renameName = ref(initialDecision.kind === 'rename-and-adopt' ? initialDecision.newName : initialRenameSource?.name ?? props.group.name)
/** 重命名接管当前选择的来源位置。 */
const renameSourceId = ref(initialRenameSource?.id ?? '')
/** 高级操作区域是否展开。 */
const advancedOpen = ref(props.decision.kind === 'rename-and-adopt')
/** 可用于重命名接管的来源选项。 */
const renameSourceOptions = computed<ResponsiveSelectOption[]>(() => props.group.locations
  .filter((location) => location.metadata.valid && !location.broken)
  .map((location) => ({ value: location.id, label: location.name, description: locationSourceName(location) })))
/** 当前选择的重命名来源。 */
const selectedRenameSource = computed(() => findLocation(renameSourceId.value))
/** 当前分组允许直接选择的修改状态。 */
const decisionOptions = computed<ResponsiveSelectOption[]>(() => {
  const kinds: SkillDecision['kind'][] = []
  if (props.group.status === 'unique') kinds.push('adopt')
  if (props.group.status === 'identical') kinds.push('merge')
  kinds.push('keep')
  if (!kinds.includes(props.decision.kind)) kinds.unshift(props.decision.kind)

  return kinds.map((kind) => {
    const presentation = getDecisionPresentation(kind)
    return {
      value: kind,
      label: presentation.label,
      description: presentation.description,
      disabled: kind === 'replace' || kind === 'rename-and-adopt',
    }
  })
})
/** 响应式选择器使用的当前修改状态。 */
const decisionModel = computed<string | undefined>({
  get: () => props.decision.kind,
  set: updateDecisionKind,
})
/** 当前修改状态的展示信息。 */
const currentDecisionPresentation = computed(() => getDecisionPresentation(props.decision.kind))

/** 返回位置来源的本地化名称。 */
function locationSourceName(location: SkillLocation): string {
  if (location.platform !== 'custom') return getSkillPlatformPresentation(location.platform).name
  return findCustomRoot(location)?.name ?? t('skills.customFolderSource')
}

/**
 * 查找自选扫描位置对应的根目录。
 * @param location Skill 扫描位置。
 * @returns 对应的自选根目录，非自选来源或数据缺失时返回 undefined。
 */
function findCustomRoot(location: SkillLocation): SkillCustomScanRoot | undefined {
  if (location.platform !== 'custom') return undefined
  return props.customRoots.find(root => root.id === location.customRootId)
}

/**
 * 返回自选来源需要展示的完整路径。
 * @param location Skill 扫描位置。
 * @returns 自选根目录路径，普通平台来源返回 undefined。
 */
function locationSourcePath(location: SkillLocation): string | undefined {
  if (location.platform !== 'custom') return undefined
  return findCustomRoot(location)?.path ?? location.path
}

/**
 * 根据位置标识查找当前 Skill 的扫描来源。
 * @param locationId 扫描位置标识。
 * @returns 匹配的扫描来源，不存在时返回 undefined。
 */
function findLocation(locationId: string | undefined): SkillLocation | undefined {
  return props.group.locations.find(location => location.id === locationId)
}

/**
 * 返回扫描来源对应的本地图标。
 * @param locationId 扫描位置标识。
 * @returns 平台或本地文件夹图标。
 */
function renameSourceIcon(locationId: string): AskxIconName {
  return getSkillPlatformPresentation(findLocation(locationId)?.platform ?? 'custom').icon
}

/**
 * 返回重命名来源的平台名称。
 * @param locationId 扫描位置标识。
 * @returns 平台或本地文件夹名称。
 */
function renameSourcePlatformName(locationId: string): string {
  const location = findLocation(locationId)
  return location ? locationSourceName(location) : t('skills.customFolderSource')
}

/**
 * 返回重命名来源的 Skill 名称。
 * @param locationId 扫描位置标识。
 * @returns 扫描位置中的 Skill 目录名称。
 */
function renameSourceSkillName(locationId: string): string {
  return findLocation(locationId)?.name ?? ''
}

/**
 * 返回修改状态的展示信息。
 * @param kind 修改状态类型。
 * @returns 对应的名称、结果说明、图标和色彩语义。
 */
function getDecisionPresentation(kind: SkillDecision['kind']): DecisionPresentation {
  const presentations: Record<SkillDecision['kind'], DecisionPresentation> = {
    adopt: { label: t('skills.adopt'), description: t('skills.adoptResult'), icon: 'askx-objects:hand', tone: 'primary' },
    merge: { label: t('skills.merge'), description: t('skills.mergeResult'), icon: 'askx-actions:flip-vertical', tone: 'primary' },
    keep: { label: t('skills.keep'), description: t('skills.keepResult'), icon: 'askx-status:prohibited', tone: 'neutral' },
    replace: { label: t('skills.replace'), description: t('skills.replaceResult'), icon: 'askx-actions:refresh', tone: 'primary' },
    'rename-and-adopt': { label: t('skills.rename'), description: t('skills.renameResult'), icon: 'askx-actions:adjust', tone: 'primary' },
    archive: { label: t('skills.archive'), description: t('skills.archiveResult'), icon: 'askx-actions:delete', tone: 'destructive' },
  }
  return presentations[kind]
}

/**
 * 返回修改状态图标容器的色彩类。
 * @param tone 修改状态色彩语义。
 * @returns Tailwind 色彩类。
 */
function decisionToneClass(tone: DecisionPresentation['tone']): string {
  if (tone === 'destructive') return 'bg-destructive/10 text-destructive'
  if (tone === 'primary') return 'bg-primary/12 text-primary'
  return 'bg-muted text-muted-foreground'
}

/**
 * 根据选择器值记录新的修改状态。
 * @param kind 用户选择的修改状态。
 */
function updateDecisionKind(kind: string | undefined): void {
  if (kind === 'adopt' || kind === 'merge') {
    selectCanonical(kind)
    return
  }
  if (kind === 'keep') {
    emit('update:decision', { kind: 'keep', groupId: props.group.id })
    return
  }
}

/** 选择接管或合并。 */
function selectCanonical(kind: 'adopt' | 'merge'): void {
  const source = props.group.locations.find((location) => location.metadata.valid && !location.broken)
  if (source) emit('update:decision', { kind, sourceLocationId: source.id })
}

/** 选择某个冲突版本覆盖其他副本。 */
function selectReplacement(sourceLocationId: string): void {
  renameSourceId.value = sourceLocationId
  const targetLocationIds = props.group.locations
    .filter((location) => location.id !== sourceLocationId && location.platform !== 'custom')
    .map((location) => location.id)
  emit('update:decision', targetLocationIds.length
    ? { kind: 'replace', sourceLocationId, targetLocationIds }
    : { kind: 'adopt', sourceLocationId })
}

/** 更新重命名接管决策。 */
function updateRename(): void {
  if (!renameSourceId.value || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(renameName.value)) return
  emit('update:decision', { kind: 'rename-and-adopt', sourceLocationId: renameSourceId.value, newName: renameName.value })
}

watch(() => props.decision.kind, (kind) => {
  if (kind === 'rename-and-adopt') advancedOpen.value = true
})

watch(renameSourceId, (locationId) => {
  const location = findLocation(locationId)
  if (!location) return
  renameName.value = location.name
}, { flush: 'sync' })

</script>

<template>
  <article class="border-b bg-card transition-colors last:border-b-0 hover:bg-muted/10">
    <div class="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,.55fr)_auto] lg:items-center lg:gap-5">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2"><strong class="truncate text-sm sm:text-base">{{ group.name }}</strong><Badge :variant="group.status === 'conflict' || group.status === 'broken' ? 'destructive' : 'secondary'">{{ t(`skills.${group.status}`) }}</Badge></div>
        <p class="mt-1 line-clamp-2 max-w-2xl text-xs leading-5 text-muted-foreground">{{ group.locations.find((location) => location.metadata.description)?.metadata.description ?? group.locations.find((location) => location.metadata.error)?.metadata.error ?? t('skills.noSkillDescription') }}</p>
      </div>

      <div class="flex min-w-0 flex-wrap items-center gap-1.5">
        <span v-for="location in group.locations" :key="location.id" class="flex max-w-full items-center gap-1.5 rounded-xl border bg-background px-2.5 py-1 text-[10px] text-muted-foreground" :title="locationSourcePath(location)">
          <Icon :name="getSkillPlatformPresentation(location.platform).icon" class="size-3 shrink-0" aria-hidden="true" />
          <span class="min-w-0">
            <span class="block truncate">{{ locationSourceName(location) }}</span>
            <span v-if="locationSourcePath(location)" class="block max-w-48 truncate font-mono text-[9px] leading-3 text-muted-foreground/75">{{ locationSourcePath(location) }}</span>
          </span>
        </span>
        <span class="font-mono text-[9px] text-muted-foreground/70">{{ group.hashes[0]?.slice(0, 8) ?? 'NO HASH' }}</span>
      </div>

      <div class="w-full min-w-0 lg:w-[180px] lg:justify-self-end">
        <CsResponsiveSelect
          v-model="decisionModel"
          :options="decisionOptions"
          :title="t('skills.decisionSelectTitle')"
          :placeholder="t('skills.decisionSelectPlaceholder')"
          :description="t('skills.decisionSelectDescription')"
          :close-label="t('skills.closeDecisionSelection')"
          :empty-text="t('skills.noDecisionOptions')"
          :clear-label="t('skills.clearDecision')"
          trigger-class="h-11 rounded-xl border-ds-border-subtle-5 bg-background/80 px-2.5 shadow-xs data-[size=default]:h-11"
          content-class="w-full md:w-[340px] md:max-w-[calc(100vw-2rem)]"
        >
          <template #value>
            <span class="flex min-w-0 items-center gap-2 text-left">
              <span class="grid size-7 shrink-0 place-items-center rounded-lg" :class="decisionToneClass(currentDecisionPresentation.tone)">
                <Icon :name="currentDecisionPresentation.icon" class="size-3.5" aria-hidden="true" />
              </span>
              <span class="truncate text-xs font-semibold text-foreground">{{ currentDecisionPresentation.label }}</span>
              <span class="ml-auto shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-medium text-warning">{{ t('skills.decisionPending') }}</span>
            </span>
          </template>
          <template #item="{ option }">
            <span class="flex min-w-0 flex-1 items-start gap-2.5 py-0.5 text-left">
              <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg" :class="decisionToneClass(getDecisionPresentation(option.value as SkillDecision['kind']).tone)">
                <Icon :name="getDecisionPresentation(option.value as SkillDecision['kind']).icon" class="size-3.5" aria-hidden="true" />
              </span>
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span class="flex items-center gap-2">
                  <strong class="text-xs">{{ option.label }}</strong>
                  <Badge v-if="option.value === group.recommendedAction" variant="secondary" class="h-5 px-1.5 text-[9px]">{{ t('skills.recommended') }}</Badge>
                </span>
                <span class="whitespace-normal text-[11px] leading-4 text-muted-foreground">{{ option.description }}</span>
              </span>
            </span>
          </template>
        </CsResponsiveSelect>
      </div>
    </div>

    <div v-if="group.status === 'conflict'" class="border-t border-warning/20 bg-warning/5 px-4 py-4 sm:px-5">
      <div class="flex items-center gap-2 text-xs font-medium text-warning"><Icon name="askx-status:warning" class="size-3.5" aria-hidden="true" />{{ t('skills.chooseVersion') }}</div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          v-for="location in group.locations"
          :key="location.id"
          type="button"
          class="relative min-h-12 w-full overflow-hidden rounded-xl border bg-background px-3 py-1.5 pr-9 text-left text-xs transition duration-200 hover:border-primary hover:bg-primary/3 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25 sm:w-[190px]"
          :class="(decision.kind === 'replace' || decision.kind === 'adopt') && decision.sourceLocationId === location.id ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : ''"
          :aria-pressed="(decision.kind === 'replace' || decision.kind === 'adopt') && decision.sourceLocationId === location.id"
          @click="selectReplacement(location.id)"
        >
          <span class="flex items-center gap-1.5"><Icon :name="getSkillPlatformPresentation(location.platform).icon" class="size-4 shrink-0" aria-hidden="true" /><strong class="block truncate">{{ location.name }}</strong></span>
          <span class="mt-0.5 flex min-w-0 items-center justify-between gap-2 pl-5 text-[10px] leading-4 text-muted-foreground">
            <span class="truncate" :title="locationSourcePath(location) ?? locationSourceName(location)">{{ locationSourceName(location) }}</span>
            <span class="shrink-0 font-mono text-[9px] text-muted-foreground/70">{{ location.contentHash?.slice(0, 8) }}</span>
          </span>
          <span
            v-if="(decision.kind === 'replace' || decision.kind === 'adopt') && decision.sourceLocationId === location.id"
            class="absolute right-0 top-0 grid size-7 origin-top-right place-items-center rounded-bl-xl bg-ds-brand-default text-ds-text-white shadow-sm animate-in fade-in zoom-in-50 duration-200"
            aria-hidden="true"
          >
            <Icon name="askx-status:check" class="size-3.5 animate-in zoom-in-50 duration-300" />
          </span>
        </button>
      </div>
    </div>

    <section v-if="group.status !== 'broken'" class="border-t bg-muted/15 px-4 py-3 sm:px-5">
      <button
        type="button"
        class="group flex w-full items-center gap-2 text-left text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
        :aria-expanded="advancedOpen"
        :aria-controls="`skill-advanced-${group.id}`"
        @click="advancedOpen = !advancedOpen"
      >
        <Icon name="askx-navigation:chevron-right" class="size-3.5 shrink-0 transition-transform duration-300 motion-reduce:transition-none" :class="advancedOpen ? 'rotate-90 text-primary' : ''" aria-hidden="true" />
        <span>{{ t('skills.advancedActions') }}</span>
      </button>

      <div
        :id="`skill-advanced-${group.id}`"
        class="grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none"
        :class="advancedOpen ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'"
        :aria-hidden="!advancedOpen"
        :inert="!advancedOpen"
      >
        <div class="min-h-0 overflow-hidden">
          <div class="grid w-full gap-2 pt-3 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center">
            <CsResponsiveSelect
              v-model="renameSourceId"
              :options="renameSourceOptions"
              :title="t('skills.selectRenameSource')"
              :placeholder="t('skills.selectRenameSource')"
              :close-label="t('skills.closeSourceSelection')"
              :empty-text="t('skills.noValidSource')"
              :clear-label="t('skills.clearSourceSelection')"
              trigger-class="h-10 min-w-0 data-[size=default]:h-10"
              content-class="w-full md:w-[270px] md:max-w-[calc(100vw-2rem)] [&_[data-slot=select-item]]:min-h-14 [&_[data-slot=select-item]]:px-2.5"
              @change="updateRename"
            >
              <template #value>
                <span v-if="selectedRenameSource" class="flex min-w-0 items-center gap-2 text-left">
                  <Icon :name="getSkillPlatformPresentation(selectedRenameSource.platform).icon" class="size-4 shrink-0 text-foreground" aria-hidden="true" />
                  <span class="grid min-w-0 flex-1 leading-none">
                    <strong class="truncate text-xs font-medium text-foreground">{{ selectedRenameSource.name }}</strong>
                    <span class="mt-1 truncate text-[9px] text-muted-foreground">{{ locationSourceName(selectedRenameSource) }}</span>
                  </span>
                </span>
              </template>
              <template #item="{ option }">
                <span class="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 text-left">
                  <span class="grid size-8 shrink-0 place-items-center rounded-lg border bg-background text-foreground">
                    <Icon :name="renameSourceIcon(option.value)" class="size-4" aria-hidden="true" />
                  </span>
                  <span class="grid min-w-0 flex-1 gap-0.5">
                    <strong class="truncate text-xs font-medium text-foreground">{{ renameSourceSkillName(option.value) }}</strong>
                    <span class="truncate text-[10px] leading-4 text-muted-foreground">{{ renameSourcePlatformName(option.value) }}</span>
                  </span>
                </span>
              </template>
            </CsResponsiveSelect>

            <Input v-model="renameName" class="h-10 rounded-xl px-3" :placeholder="t('skills.renamePlaceholder')" @input="updateRename" />

            <TooltipProvider :delay-duration="150">
              <Tooltip>
                <TooltipTrigger as-child>
                  <span class="inline-flex h-10">
                    <Button class="h-10 w-full px-4 sm:w-auto" variant="outline" size="40" :disabled="!renameSourceId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(renameName)" @click="updateRename">
                      <Icon name="askx-actions:adjust" class="size-4" aria-hidden="true" />
                      {{ t('skills.rename') }}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" :side-offset="8" class="max-w-[300px]">{{ t('skills.renameResult') }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </section>

  </article>
</template>
