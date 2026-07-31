<script setup lang="ts">
import type { SkillPlatformId, SkillPlatformStatus } from '@askx/module-skills/skill-types'
import { skillPlatformPresentations } from '@/lib/skillPlatformPresentation'

/** 平台选择组件属性。 */
interface Props {
  /** 三个平台的预检测状态。 */
  platforms: SkillPlatformStatus[]
  /** 当前选择的平台。 */
  selected: SkillPlatformId[]
  /** 用户额外选择的本地扫描目录。 */
  directories: Array<{ name: string; path: string }>
  /** 是否正在保存或扫描。 */
  busy?: boolean
  /** 是否正在等待系统目录选择器。 */
  pickingDirectories?: boolean
}

const props = withDefaults(defineProps<Props>(), { busy: false, pickingDirectories: false })
const emit = defineEmits<{
  /** 更新平台选择。 */
  'update:selected': [value: SkillPlatformId[]]
  /** 打开系统目录选择器。 */
  'select-directories': []
  /** 移除一个额外扫描目录。 */
  'remove-directory': [path: string]
}>()
const { t } = useI18n()

/** 切换一个平台选择。 */
function togglePlatform(platform: SkillPlatformId): void {
  const next = props.selected.includes(platform)
    ? props.selected.filter((entry) => entry !== platform)
    : [...props.selected, platform]
  emit('update:selected', next)
}
</script>

<template>
  <section class="relative overflow-hidden rounded-[28px] border bg-card p-5 shadow-sm sm:p-8">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/10 to-transparent" />
    <div class="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="max-w-2xl">
        <Badge variant="secondary" class="mb-4 gap-1.5"><Icon name="askx-objects:agent" class="size-3.5" />{{ t('skills.safeRead') }}</Badge>
        <h2 class="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{{ t('skills.platformTitle') }}</h2>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ t('skills.platformDescription') }}</p>
      </div>
      <span class="font-mono text-xs text-muted-foreground">{{ t('skills.selectedCount', { count: selected.length }) }}</span>
    </div>

    <div class="relative mt-7 overflow-hidden rounded-2xl border bg-background/75">
      <button
        v-for="platform in platforms"
        :key="platform.id"
        type="button"
        class="group relative grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/40 sm:px-5"
        :class="selected.includes(platform.id) ? 'bg-ds-fill-brand-transparent-5' : 'bg-muted/10 text-muted-foreground'"
        :aria-pressed="selected.includes(platform.id)"
        @click="togglePlatform(platform.id)"
      >
        <span v-if="selected.includes(platform.id)" class="absolute inset-y-3 left-0 w-0.5 rounded-full bg-primary" />
        <span class="grid size-11 shrink-0 place-items-center rounded-xl border bg-card text-foreground shadow-sm"><Icon :name="skillPlatformPresentations[platform.id].icon" class="size-5.5" aria-hidden="true" /></span>
        <span class="min-w-0 lg:grid lg:grid-cols-[minmax(12rem,1fr)_minmax(26rem,1.35fr)] lg:items-center lg:gap-6">
          <span class="min-w-0">
            <strong class="block truncate text-sm text-foreground sm:text-base">{{ skillPlatformPresentations[platform.id].name }}</strong>
            <span class="mt-1 block truncate font-mono text-[10px] text-muted-foreground sm:text-[11px]">{{ platform.skillsDir }}</span>
          </span>
          <span class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground lg:mt-0 lg:grid lg:grid-cols-3 lg:gap-3">
            <span class="flex min-w-0 items-center gap-2"><i class="size-1.5 shrink-0 rounded-full" :class="platform.installed ? 'bg-success' : 'bg-muted-foreground/40'" /><span class="truncate">{{ platform.installed ? t('skills.installed') : t('skills.unavailable') }}</span></span>
            <span class="flex min-w-0 items-center gap-2"><i class="size-1.5 shrink-0 rounded-full" :class="platform.skillsDirExists ? 'bg-success' : 'bg-muted-foreground/40'" /><span class="truncate">{{ platform.skillsDirExists ? t('skills.directoryReady') : t('skills.directoryMissing') }}</span></span>
            <span class="flex min-w-0 items-center gap-2"><i class="size-1.5 shrink-0 rounded-full" :class="platform.linkSupported ? 'bg-primary' : 'bg-warning'" /><span class="truncate">{{ platform.linkSupported ? t('skills.linkReady') : t('skills.linkBlocked') }}</span></span>
          </span>
        </span>
        <span class="grid size-6 shrink-0 place-items-center rounded-full border transition" :class="selected.includes(platform.id) ? 'border-primary bg-primary text-ds-text-white' : 'bg-card text-transparent'">
          <Icon name="askx-status:check" class="size-3" />
        </span>
      </button>
    </div>

    <section class="relative mt-5 overflow-hidden rounded-2xl border border-dashed bg-muted/15 p-4 sm:p-5">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 items-start gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-ds-fill-brand-transparent-10 text-primary"><Icon name="askx-objects:file" class="size-5" aria-hidden="true" /></span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2"><h3 class="text-sm font-semibold sm:text-base">{{ t('skills.customFolderTitle') }}</h3><Badge variant="outline">{{ t('skills.folderCount', { count: directories.length }) }}</Badge></div>
            <p class="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{{ t('skills.customFolderDescription') }}</p>
          </div>
        </div>
        <Button variant="outline" size="40" :disabled="busy || pickingDirectories || directories.length >= 20" @click="emit('select-directories')">
          <Icon name="askx-actions:upload" :class="['size-4', { 'animate-pulse': pickingDirectories }]" />
          {{ pickingDirectories ? t('skills.choosingFolders') : t('skills.chooseFolders') }}
        </Button>
      </div>

      <div v-if="directories.length" class="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2">
        <div v-for="directory in directories" :key="directory.path" class="group flex min-w-0 items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-xs">
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon name="askx-objects:layers" class="size-4" aria-hidden="true" /></span>
          <span class="min-w-0 flex-1"><strong class="block truncate text-xs text-foreground">{{ directory.name }}</strong><span class="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground sm:text-[10px]">{{ directory.path }}</span></span>
          <Button type="button" variant="ghost" size="icon-sm" :aria-label="t('skills.removeFolder', { name: directory.name })" @click="emit('remove-directory', directory.path)"><Icon name="askx-actions:close" class="size-3.5" /></Button>
        </div>
      </div>
      <p v-else class="mt-4 border-t pt-4 text-xs text-muted-foreground">{{ t('skills.noCustomFolders') }}</p>
    </section>

  </section>
</template>
