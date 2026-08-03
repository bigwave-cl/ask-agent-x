<script setup lang="ts">
import type { LocalOpenOption, LocalOpenResult, LocalOpenTarget } from '~~/shared/local-open'

/** 本地路径打开组件属性。 */
interface Props {
  /** 交给 Node 层打开的绝对路径。 */
  path: string
  /** 主按钮使用的打开方式。 */
  defaultTarget?: LocalOpenTarget
}

const props = withDefaults(defineProps<Props>(), { defaultTarget: 'system' })
const emit = defineEmits<{
  /** 路径成功交给本机程序处理。 */
  opened: [result: LocalOpenResult]
}>()
const { t } = useI18n()
const toast = useToast()

/** 当前主按钮使用的打开方式。 */
const selectedTarget = ref<LocalOpenTarget>(props.defaultTarget)
/** 打开方式选择面板状态。 */
const selectionOpen = ref(false)
/** 当前设备的打开方式检测结果。 */
const options = ref<LocalOpenOption[]>([
  { id: 'system', available: true },
  { id: 'cursor', available: false },
  { id: 'vscode', available: false },
])
/** 是否已从 Node 层读取工具状态。 */
const optionsResolved = ref(false)
/** 是否正在检测本地工具。 */
const resolvingOptions = ref(false)
/** 是否正在调起本地程序。 */
const opening = ref(false)

/** 当前主按钮图标。 */
const selectedIcon = computed(() => targetIcon(selectedTarget.value))
/** 当前主按钮文案。 */
const selectedLabel = computed(() => targetActionLabel(selectedTarget.value))

/** 返回打开方式对应的本地图标。 */
function targetIcon(target: LocalOpenTarget): string {
  if (target === 'cursor') return 'askx-platforms:cursor'
  if (target === 'vscode') return 'askx-objects:file-code'
  return 'askx-objects:folder-open'
}

/** 返回打开方式的名称。 */
function targetName(target: LocalOpenTarget): string {
  if (target === 'cursor') return 'Cursor'
  if (target === 'vscode') return 'VS Code'
  return t('common.systemFileManager')
}

/** 返回主按钮的动作文案。 */
function targetActionLabel(target: LocalOpenTarget): string {
  if (target === 'cursor') return t('common.openInCursor')
  if (target === 'vscode') return t('common.openInVscode')
  return t('common.openLocation')
}

/** 按需读取当前设备支持的打开方式。 */
async function resolveOptions(): Promise<void> {
  if (optionsResolved.value || resolvingOptions.value) return
  resolvingOptions.value = true
  try {
    const result = await $fetch<{ options: LocalOpenOption[] }>('/api/system/open-location/options')
    options.value = result.options
    optionsResolved.value = true
  } catch {
    toast.error(t('common.openLocationOptionsFailed'))
  } finally {
    resolvingOptions.value = false
  }
}

/** 将打开方式设置为主按钮动作。 */
function selectTarget(target: LocalOpenTarget): void {
  const option = options.value.find(item => item.id === target)
  if (!option?.available) return
  selectedTarget.value = target
  selectionOpen.value = false
}

/** 通过受保护 API 从 Node 层打开当前路径。 */
async function openPath(): Promise<void> {
  if (opening.value) return
  opening.value = true
  try {
    const result = await $fetch<LocalOpenResult>('/api/system/open-location', {
      method: 'POST',
      body: { path: props.path, target: selectedTarget.value },
    })
    toast.success(t('common.openLocationStarted', { target: targetName(result.target) }))
    emit('opened', result)
  } catch {
    toast.error(t('common.openLocationFailed'))
    optionsResolved.value = false
    await resolveOptions()
  } finally {
    opening.value = false
  }
}

watch(selectionOpen, (open) => {
  if (open) void resolveOptions()
})
</script>

<template>
  <div class="inline-flex max-w-full items-stretch" role="group" :aria-label="t('common.openLocationActions')">
    <Button variant="outline" size="36" class="min-w-0 rounded-r-none pr-3" :disabled="opening" @click="openPath">
      <Icon :name="opening ? 'askx-status:loading' : selectedIcon" class="size-4 shrink-0" :class="opening && 'animate-spin'" aria-hidden="true" />
      <span class="truncate">{{ opening ? t('common.openingLocation') : selectedLabel }}</span>
    </Button>
    <Popover v-model:open="selectionOpen">
      <PopoverTrigger as-child>
        <Button
          variant="outline"
          size="icon-lg"
          class="rounded-l-none border-l-0 px-0"
          :aria-label="t('common.chooseOpenMethod')"
          :aria-expanded="selectionOpen"
        >
          <Icon name="askx-navigation:chevron-down" class="size-3.5 transition-transform" :class="selectionOpen && 'rotate-180'" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" class="w-64 gap-1 p-1.5">
        <div class="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{{ t('common.openMethod') }}</div>
        <button
          v-for="option in options"
          :key="option.id"
          type="button"
          class="group flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-ds-fill-bw-transparent-5 focus-visible:bg-ds-fill-brand-transparent-10 focus-visible:ring-2 focus-visible:ring-ds-brand-focus disabled:pointer-events-none disabled:opacity-45"
          :disabled="!option.available"
          @click="selectTarget(option.id)"
        >
          <span class="grid size-7 shrink-0 place-items-center rounded-md bg-ds-fill-bw-transparent-3 text-muted-foreground transition-colors group-hover:text-foreground"><Icon :name="targetIcon(option.id)" class="size-4" aria-hidden="true" /></span>
          <span class="min-w-0 flex-1"><strong class="block truncate text-xs font-medium text-foreground">{{ targetName(option.id) }}</strong><span class="mt-0.5 block text-[10px] text-muted-foreground">{{ option.available ? t('common.openMethodReady') : t('common.openMethodUnavailable') }}</span></span>
          <Icon v-if="selectedTarget === option.id" name="askx-status:check" class="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        </button>
        <p v-if="resolvingOptions" class="px-2 py-1 text-[10px] text-muted-foreground">{{ t('common.detectingOpenMethods') }}</p>
      </PopoverContent>
    </Popover>
  </div>
</template>
