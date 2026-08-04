<script setup lang="ts">
import { MAX_CUSTOM_SKILL_DIRECTORIES } from '@askx/module-skills/skill-types'
import type { SkillPlatformId, SkillPlatformStatus } from '@askx/module-skills/skill-types'
import { skillPlatformPresentations } from '@/lib/skillPlatformPresentation'

/** 平台根目录软链接入选择属性。 */
interface Props {
  /** AskX 当前支持的全部平台状态。 */
  platforms: SkillPlatformStatus[]
  /** 第一步选择的扫描来源平台，用于标记默认项。 */
  sourcePlatforms: SkillPlatformId[]
  /** 当前明确选择建立软链的平台。 */
  selected: SkillPlatformId[]
  /** 第一步选择的自定义扫描来源。 */
  sourceDirectories: Array<{ name: string; path: string }>
  /** 当前明确选择建立软链的自定义使用目录。 */
  directories: Array<{ name: string; path: string }>
  /** 是否正在保存或重新扫描。 */
  busy?: boolean
  /** 是否正在等待系统目录选择器。 */
  pickingDirectories?: boolean
}

const props = withDefaults(defineProps<Props>(), { busy: false, pickingDirectories: false })
const emit = defineEmits<{
  /** 更新软链接入平台。 */
  'update:selected': [value: SkillPlatformId[]]
  /** 更新自定义软链使用目录。 */
  'update:directories': [value: Array<{ name: string; path: string }>]
  /** 打开系统目录选择器补充软链使用目录。 */
  'select-directories': []
}>()
const { t } = useI18n()

/**
 * 切换一个平台的软链接入选择。
 * @param platform 要切换的平台状态。
 */
function togglePlatform(platform: SkillPlatformStatus): void {
  if (!platform.linkSupported) return
  emit('update:selected', props.selected.includes(platform.id)
    ? props.selected.filter((entry) => entry !== platform.id)
    : [...props.selected, platform.id])
}

/**
 * 从本次软链目标中移除一个自定义目录。
 * @param path 要移除的目录绝对路径。
 */
function removeDirectory(path: string): void {
  emit('update:directories', props.directories.filter((directory) => directory.path !== path))
}

/** 判断自定义软链目录是否也来自第一步扫描来源。 */
function isSourceDirectory(path: string): boolean {
  return props.sourceDirectories.some((directory) => directory.path === path)
}
</script>

<template>
  <section class="relative overflow-hidden rounded-[28px] border bg-card p-5 shadow-sm sm:p-8">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/10 to-transparent" />
    <div class="relative max-w-3xl">
      <Badge variant="secondary" class="mb-4 gap-1.5"><Icon name="askx-status:lock" class="size-3.5" />{{ t('skills.linkOptional') }}</Badge>
      <h2 class="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{{ t('skills.linkSelectionTitle') }}</h2>
      <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ t('skills.linkSelectionDescription') }}</p>
    </div>

    <div class="relative mt-7 overflow-hidden rounded-2xl border bg-background/75">
      <button
        v-for="platform in platforms"
        :key="platform.id"
        type="button"
        class="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b px-4 py-4 text-left transition-colors last:border-b-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/40 sm:px-5"
        :class="[
          selected.includes(platform.id) ? 'bg-ds-fill-brand-transparent-5' : 'bg-muted/10',
          platform.linkSupported ? 'hover:bg-muted/40' : 'cursor-not-allowed opacity-50',
        ]"
        :disabled="!platform.linkSupported"
        :aria-pressed="selected.includes(platform.id)"
        @click="togglePlatform(platform)"
      >
        <span class="grid size-11 shrink-0 place-items-center rounded-xl border bg-card text-foreground shadow-sm"><Icon :name="skillPlatformPresentations[platform.id].icon" class="size-5.5" aria-hidden="true" /></span>
        <span class="min-w-0">
          <strong class="block truncate text-sm text-foreground sm:text-base">{{ skillPlatformPresentations[platform.id].name }}</strong>
          <span class="mt-1 block truncate font-mono text-[10px] text-muted-foreground sm:text-[11px]">{{ platform.skillsDir }}</span>
          <span class="mt-1.5 block text-xs text-muted-foreground">
            {{ !platform.linkSupported
              ? t('skills.linkSelectionItemBlocked')
              : sourcePlatforms.includes(platform.id)
                ? t('skills.linkSelectionItemSource')
                : t('skills.linkSelectionItemAdditional') }}
          </span>
        </span>
        <span class="grid size-7 shrink-0 place-items-center rounded-full border transition" :class="selected.includes(platform.id) ? 'border-primary bg-primary text-ds-text-white' : 'bg-card text-muted-foreground'">
          <Icon name="askx-status:check" :class="['size-3.5', { 'text-transparent': !selected.includes(platform.id) }]" />
        </span>
      </button>
    </div>

    <section class="relative mt-5 overflow-hidden rounded-2xl border border-dashed bg-muted/15 p-4 sm:p-5">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 items-start gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-ds-fill-brand-transparent-10 text-primary"><Icon name="askx-objects:folder" class="size-5" aria-hidden="true" /></span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-semibold sm:text-base">{{ t('skills.linkCustomFolderTitle') }}</h3>
              <Badge variant="outline">{{ directories.length }}/{{ MAX_CUSTOM_SKILL_DIRECTORIES }}</Badge>
            </div>
            <p class="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{{ t('skills.linkCustomFolderDescription', { max: MAX_CUSTOM_SKILL_DIRECTORIES }) }}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="40"
          :disabled="busy || pickingDirectories || directories.length >= MAX_CUSTOM_SKILL_DIRECTORIES"
          @click="emit('select-directories')"
        >
          <Icon name="askx-actions:upload" :class="['size-4', { 'animate-pulse': pickingDirectories }]" />
          {{ pickingDirectories ? t('skills.choosingFolders') : t('skills.addCustomFolder') }}
        </Button>
      </div>

      <div v-if="directories.length" class="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2">
        <div v-for="directory in directories" :key="directory.path" class="flex min-w-0 items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-xs">
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon name="askx-objects:folder" class="size-4" aria-hidden="true" /></span>
          <span class="min-w-0 flex-1"><span class="flex items-center gap-2"><strong class="block truncate text-xs text-foreground">{{ directory.name }}</strong><Badge v-if="isSourceDirectory(directory.path)" variant="secondary" class="shrink-0">{{ t('skills.linkSourceBadge') }}</Badge></span><code class="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground sm:text-[10px]" :title="directory.path">{{ directory.path }}</code></span>
          <Button variant="ghost" size="icon-sm" :aria-label="t('skills.removeFolder', { name: directory.name })" @click="removeDirectory(directory.path)"><Icon name="askx-actions:close" class="size-3.5" /></Button>
        </div>
      </div>
      <p v-else class="mt-4 border-t pt-4 text-xs text-muted-foreground">{{ t('skills.linkNoCustomFolders') }}</p>
    </section>

    <div class="relative mt-5 flex items-start gap-3 rounded-2xl border border-dashed bg-muted/15 p-4 text-xs leading-5 text-muted-foreground">
      <Icon name="askx-status:info" class="mt-0.5 size-4 shrink-0 text-primary" />
      <p>{{ selected.length || directories.length ? t('skills.linkSelectedCount', { platformCount: selected.length, directoryCount: directories.length }) : t('skills.linkSkippedHint') }}</p>
    </div>
  </section>
</template>
