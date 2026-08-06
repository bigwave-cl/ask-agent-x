<script setup lang="ts">
import { marked } from 'marked'
import RenderNode from './RenderNode.vue'
import { normalizeMarkdownTokens } from './markdownTokens'
import { useMarkdownTypewriter } from './useMarkdownTypewriter'

defineOptions({ name: 'BusMdcRender' })

/** MDC 渲染器属性。 */
interface Props {
  /** 需要渲染的 Markdown 或纯文本内容。 */
  value: string
  /** 用于显式重建渲染根节点的缓存标识。 */
  cacheKey?: string
  /** 是否跳过 Markdown 解析并按纯文本渲染。 */
  plainText?: boolean
  /** 是否启用节点级打字机效果。 */
  typewriter?: boolean
}

/** MDC 渲染器属性及默认值。 */
const props = withDefaults(defineProps<Props>(), {
  cacheKey: '',
  plainText: false,
  typewriter: false,
})

/** MDC 渲染完成事件。 */
const emit = defineEmits<{
  /** 当前内容完成 DOM 更新后触发。 */
  resolve: []
}>()

/** 当前已经提交给 marked 的 Markdown。 */
const committedValue = shallowRef(props.value)
/** 当前是否允许使用节点级打字机。 */
const isTypewriterEnabled = computed(() => props.typewriter && !props.plainText)
/** 当前 Markdown 内容的受控解析结果。 */
const renderState = computed(() => {
  if (props.plainText) return { nodes: [], error: null }

  try {
    return {
      nodes: normalizeMarkdownTokens(marked.lexer(committedValue.value, { gfm: true })),
      error: null,
    }
  }
  catch (error) {
    return {
      nodes: [],
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
})

/** 当前允许渲染的渐进安全节点。 */
const { visibleNodes } = useMarkdownTypewriter({
  sourceValue: computed(() => props.value),
  committedValue,
  nodes: computed(() => renderState.value.nodes),
  cacheKey: computed(() => props.cacheKey),
  isEnabled: isTypewriterEnabled,
})

/** 在当前渲染任务完成后通知使用侧。 */
function emitResolve() {
  nextTick(() => emit('resolve'))
}

onMounted(emitResolve)

watch(
  [visibleNodes, committedValue, () => props.cacheKey, () => props.plainText],
  emitResolve,
  { flush: 'post' },
)
</script>

<template>
  <div :key="cacheKey" class="mdc-render-wrap custom-typography min-w-0 max-w-full">
    <p v-if="plainText" class="m-0 whitespace-pre-wrap break-words">{{ value }}</p>
    <RenderNode v-else-if="visibleNodes.length" :nodes="visibleNodes" @resolve="emitResolve" />
    <p v-else-if="renderState.error" data-render-error class="m-0 whitespace-pre-wrap break-words">{{ committedValue }}</p>
  </div>
</template>
