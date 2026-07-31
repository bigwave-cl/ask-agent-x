<script setup lang="ts">
defineOptions({ name: 'BusMdcRenderImage' })

/** MDC 图片节点属性。 */
interface Props {
  /** 图片地址。 */
  src: string
  /** 图片替代文本。 */
  alt?: string
  /** 图片标题。 */
  title?: string
}

/** 图片加载后的自然尺寸。 */
interface ResolvedImageSize {
  /** 图片自然宽度。 */
  width: number
  /** 图片自然高度。 */
  height: number
}

/** MDC 图片节点属性及默认值。 */
const props = withDefaults(defineProps<Props>(), {
  alt: '',
  title: '',
})

/** MDC 图片节点事件。 */
const emit = defineEmits<{
  /** 图片加载或失败后的布局刷新事件。 */
  resolve: []
}>()

/** 图片加载后的自然尺寸。 */
const resolvedSize = ref<ResolvedImageSize | null>(null)
/** 图片是否仍在加载。 */
const isLoading = ref(true)
/** 图片是否加载失败。 */
const hasError = ref(false)
/** 图片是否已经取得有效自然尺寸。 */
const hasResolvedSize = computed(() => Boolean(resolvedSize.value))
/** 图片容器尺寸：加载前保持正方形，加载后使用自然比例。 */
const imageFrameStyle = computed(() => {
  const size = resolvedSize.value
  if (!size) return undefined

  return {
    aspectRatio: `${size.width} / ${size.height}`,
    ...(size.width >= size.height
      ? { width: `${size.width}px`, height: 'auto' }
      : { width: 'auto', height: `${size.height}px` }),
  }
})

/** 图片地址变化时恢复加载占位。 */
watch(() => props.src, () => {
  resolvedSize.value = null
  isLoading.value = true
  hasError.value = false
})

/**
 * 记录图片自然尺寸并通知外层刷新布局。
 *
 * @param event 图片加载事件。
 */
async function handleImageLoad(event: Event) {
  const image = event.target as HTMLImageElement | null
  if (!image?.naturalWidth || !image.naturalHeight) return

  resolvedSize.value = {
    width: image.naturalWidth,
    height: image.naturalHeight,
  }
  isLoading.value = false
  hasError.value = false
  await nextTick()
  emit('resolve')
}

/** 图片加载失败后显示本地占位并通知外层刷新布局。 */
function handleImageError() {
  isLoading.value = false
  hasError.value = true
  emit('resolve')
}
</script>

<template>
  <span
    class="mdc-render-image relative flex max-h-[334px] max-w-[min(334px,100%)] items-center justify-center overflow-hidden rounded-lg bg-muted/35"
    :class="!hasResolvedSize && 'aspect-square w-[334px] max-w-full'"
    :style="imageFrameStyle"
  >
    <span v-if="isLoading" class="absolute inset-0 flex items-center justify-center text-muted-foreground" aria-hidden="true">
      <Icon name="askx-status:loading" class="size-6 animate-spin" />
    </span>
    <span
      v-if="hasError"
      class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground"
      :role="alt ? 'img' : undefined"
      :aria-label="alt || undefined"
    >
      <Icon name="askx-objects:image" class="size-7" aria-hidden="true" />
      <span v-if="alt" class="max-w-full truncate">{{ alt }}</span>
    </span>
    <img
      :src="src"
      :alt="alt"
      :title="title || undefined"
      class="block h-auto max-h-[334px] w-auto max-w-[334px] rounded-lg object-contain"
      :class="(isLoading || hasError) && 'invisible'"
      loading="lazy"
      decoding="async"
      @load="handleImageLoad"
      @error="handleImageError"
    >
  </span>
</template>
