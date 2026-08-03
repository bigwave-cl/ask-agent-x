<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { ScrollArea } from '@/components/ui/scroll-area'

defineOptions({ name: 'BusMdcRenderCodeBlock' })

/** MDC 代码块属性。 */
interface Props {
  /** 原始代码。 */
  value: string
  /** Markdown fenced code 声明的语言。 */
  language: string
}

/** MDC 代码块属性。 */
const props = defineProps<Props>()
/** 高亮完成事件。 */
const emit = defineEmits<{
  /** 渐进高亮结果已经渲染。 */
  resolve: []
}>()
/** 用于可视区检测的代码块容器。 */
const containerElement = ref<HTMLElement | null>(null)
/** 代码块是否已经接近可视区。 */
const isNearViewport = ref(false)
/** 当前代码块的异步高亮结果。 */
const { result, status } = useCodeHighlight({
  source: () => props.value,
  language: () => props.language,
  enabled: isNearViewport,
  priority: 'visible-preview',
  debounceMs: 0,
})

useIntersectionObserver(
  containerElement,
  ([entry]) => {
    if (entry?.isIntersecting) isNearViewport.value = true
  },
  { rootMargin: '200px' },
)

watch(status, (currentStatus) => {
  if (currentStatus === 'ready' || currentStatus === 'failed' || currentStatus === 'skipped') {
    nextTick(() => emit('resolve'))
  }
})
</script>

<template>
  <div ref="containerElement" :data-highlight-status="status">
    <ScrollArea orientation="horizontal" type="auto" class="mdc-render-code" viewport-class="mdc-render-scroll-viewport">
      <pre :data-language="result.language || language || undefined"><code class="hljs"><span v-for="(segment, index) in result.segments" :key="index" :class="segment.scopes">{{ segment.value }}</span></code></pre>
    </ScrollArea>
  </div>
</template>
