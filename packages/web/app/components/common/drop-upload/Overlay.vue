<script setup lang="ts">
import type {
  DropUploadExpose,
  DropUploadOverlayProps,
  DropUploadValidationReason,
} from './dropUploadTypes'
import { useElementSize } from '@vueuse/core'
import { cn } from '@/lib/utils'
import { resolveDropUploadPayload, validateDropUploadPayload } from './dropUploadUtils'

defineOptions({ name: 'DropUploadOverlay' })

/** 覆盖层内容布局档位。 */
type DropUploadLayoutMode = 'full' | 'compact' | 'minimal'

/** 拖拽上传覆盖层属性。 */
const props = withDefaults(defineProps<DropUploadOverlayProps>(), {
  class: '',
  multiple: false,
  disabled: false,
  overlayHint: '',
  limitHint: '',
  fullWidth: false,
  stopPropagation: true,
})
/** 当前语言的上传提示文案。 */
const { t } = useI18n()
/** 项目统一 Toast。 */
const toast = useToast()
/** 覆盖层是否处于可见状态。 */
const isVisible = ref(false)
/** 覆盖层根元素。 */
const overlayRef = ref<HTMLElement | null>(null)
/** 覆盖层实际尺寸。 */
const { width: overlayWidth, height: overlayHeight } = useElementSize(overlayRef)
/** 下一帧显示动画编号。 */
let showFrameId: number | undefined

/** 实际显示的覆盖层提示。 */
const resolvedOverlayHint = computed(() => {
  return props.overlayHint || t('dropUpload.hint')
})
/** 当前配置对应的上传数量提示。 */
const resolvedLimitHint = computed(() => {
  if (props.limitHint) return props.limitHint
  const limitCount = props.multiple ? props.maxFiles : 1
  if (!limitCount || limitCount <= 0) return ''
  return t('dropUpload.limit', { count: limitCount })
})
/** 根据挂载区域宽高确定内容布局档位。 */
const layoutMode = computed<DropUploadLayoutMode>(() => {
  if (overlayWidth.value < 180 || overlayHeight.value < 96) return 'minimal'
  if (overlayWidth.value < 360 || overlayHeight.value < 200) return 'compact'
  return 'full'
})
/** 矮宽区域是否使用横向排列。 */
const isHorizontalLayout = computed(() => {
  return layoutMode.value !== 'full'
    && overlayHeight.value < 160
    && overlayWidth.value >= 180
})
/** 极小区域是否仍有足够空间展示上传图标。 */
const shouldShowIcon = computed(() => {
  return overlayWidth.value >= 120 && overlayHeight.value >= 64
})
/** 当前区域是否展示上传数量副提示。 */
const shouldShowLimitHint = computed(() => {
  return layoutMode.value !== 'minimal' && Boolean(resolvedLimitHint.value)
})
/** 覆盖层随布局档位变化的内边距类。 */
const resolvedOverlayPaddingClass = computed(() => {
  if (layoutMode.value === 'full') return 'p-4'
  if (layoutMode.value === 'compact') return 'p-2'
  return 'p-1'
})
/** 覆盖层内容区域类。 */
const resolvedContentClass = computed(() => {
  const sizeClass = layoutMode.value === 'full'
    ? 'gap-3 p-4'
    : layoutMode.value === 'compact'
      ? 'gap-2 p-2'
      : 'gap-1 p-1'
  const directionClass = isHorizontalLayout.value
    ? 'flex-row text-left'
    : 'flex-col text-center'
  const widthClass = props.fullWidth || layoutMode.value !== 'full'
    ? 'w-full'
    : 'w-4/5'

  return cn(
    'flex max-h-full min-w-0 items-center justify-center overflow-hidden rounded-[inherit] transition duration-200',
    sizeClass,
    directionClass,
    widthClass,
    isVisible.value ? 'scale-100' : 'scale-95',
    props.class,
  )
})
/** 上传图标容器类。 */
const resolvedIconClass = computed(() => {
  if (layoutMode.value === 'full') return 'size-16 [&>svg]:size-14'
  if (layoutMode.value === 'compact') return 'size-10 [&>svg]:size-9'
  return 'size-7 [&>svg]:size-6'
})
/** 提示文字组合类。 */
const resolvedTextGroupClass = computed(() => {
  return cn(
    'grid min-w-0 gap-0.5',
    isHorizontalLayout.value
      ? 'justify-items-start text-left'
      : 'justify-items-center text-center',
  )
})
/** 主提示文字类。 */
const resolvedTitleClass = computed(() => {
  if (layoutMode.value === 'full') return 'max-w-full break-words text-2xl font-extrabold leading-8 text-white'
  if (layoutMode.value === 'compact') return 'max-w-full break-words text-base font-extrabold leading-6 text-white'
  return 'line-clamp-2 max-w-full break-words text-xs font-extrabold leading-4 text-white'
})
/** 数量提示文字类。 */
const resolvedLimitClass = computed(() => {
  return cn(
    'max-w-full break-words font-medium text-white/70',
    layoutMode.value === 'full' ? 'text-sm leading-5' : 'text-xs leading-4',
  )
})

/**
 * 将校验结果转换为本地化错误文案。
 *
 * @param reason 校验失败原因。
 * @returns 无需反馈时返回空字符串。
 */
function resolveValidationMessage(reason: DropUploadValidationReason) {
  if (reason === 'single-count') return t('dropUpload.errors.singleCount')
  if (reason === 'max-count') {
    return t('dropUpload.errors.maxCount', { count: props.maxFiles || 0 })
  }
  return ''
}

/**
 * 报告拖拽校验错误。
 *
 * @param message 已本地化的错误文案。
 */
function reportError(message: string) {
  if (!message) return
  if (props.onError) {
    props.onError([message])
    return
  }
  toast.warning(message, { duration: 3000 })
}

/**
 * 处理覆盖层内的放置事件。
 *
 * @param event 原始拖拽事件。
 */
async function handleDrop(event: DragEvent) {
  event.preventDefault()
  if (props.stopPropagation) event.stopPropagation()
  if (props.disabled) return

  const payload = resolveDropUploadPayload(event)
  const validation = validateDropUploadPayload(payload, props)
  if (!validation.valid) {
    reportError(resolveValidationMessage(validation.reason))
    return
  }

  await props.onDrop?.(payload)
}

/** 显示覆盖层并触发进入动画。 */
function show() {
  if (showFrameId) cancelAnimationFrame(showFrameId)
  showFrameId = requestAnimationFrame(() => {
    isVisible.value = true
    showFrameId = undefined
  })
}

/** 隐藏覆盖层。 */
function hide() {
  if (showFrameId) cancelAnimationFrame(showFrameId)
  showFrameId = undefined
  isVisible.value = false
}

defineExpose<DropUploadExpose>({ show, hide })

onMounted(show)
onScopeDispose(hide)
</script>

<template>
  <div
    ref="overlayRef"
    role="region"
    :aria-label="resolvedOverlayHint"
    :data-layout="layoutMode"
    class="flex size-full items-center justify-center rounded-[inherit] bg-ds-overlay-scrim text-white backdrop-blur-[32px] transition-opacity duration-200"
    :class="[
      resolvedOverlayPaddingClass,
      isVisible ? 'opacity-100' : 'opacity-0',
    ]"
    @dragenter.prevent
    @dragover.prevent
    @dragleave.prevent
    @drop="handleDrop"
  >
    <div :class="resolvedContentClass">
      <span
        v-if="shouldShowIcon"
        class="inline-flex shrink-0 items-center justify-center text-white"
        :class="resolvedIconClass"
      >
        <Icon name="askx-actions:upload" />
      </span>
      <div :class="resolvedTextGroupClass">
        <span :class="resolvedTitleClass">{{ resolvedOverlayHint }}</span>
        <span v-if="shouldShowLimitHint" :class="resolvedLimitClass">
          {{ resolvedLimitHint }}
        </span>
      </div>
    </div>
  </div>
</template>
