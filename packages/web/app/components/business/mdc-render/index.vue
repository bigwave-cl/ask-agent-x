<script setup lang="ts">
import { marked } from 'marked'
import RenderNode from './RenderNode.vue'
import { normalizeMarkdownTokens } from './markdownTokens'

defineOptions({ name: 'BusMdcRender' })

/** MDC 渲染器属性。 */
interface Props {
  /** 需要渲染的 Markdown 或纯文本内容。 */
  value: string
  /** 用于显式重建渲染根节点的缓存标识。 */
  cacheKey?: string
  /** 是否跳过 Markdown 解析并按纯文本渲染。 */
  plainText?: boolean
}

/** MDC 渲染器属性及默认值。 */
const props = withDefaults(defineProps<Props>(), {
  cacheKey: '',
  plainText: false,
})

/** MDC 渲染完成事件。 */
const emit = defineEmits<{
  /** 当前内容完成 DOM 更新后触发。 */
  resolve: []
}>()

/** 当前 Markdown 内容的受控解析结果。 */
const renderState = computed(() => {
  if (props.plainText) return { nodes: [], error: null }

  try {
    return {
      nodes: normalizeMarkdownTokens(marked.lexer(props.value, { gfm: true })),
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

/** 在当前渲染任务完成后通知使用侧。 */
function emitResolve() {
  nextTick(() => emit('resolve'))
}

onMounted(emitResolve)

watch(
  [() => props.value, () => props.cacheKey, () => props.plainText],
  emitResolve,
  { flush: 'post' },
)
</script>

<template>
  <div :key="cacheKey" class="mdc-render-wrap custom-typography min-w-0 max-w-full">
    <p v-if="plainText" class="m-0 whitespace-pre-wrap break-words">{{ value }}</p>
    <RenderNode v-else-if="renderState.nodes.length" :nodes="renderState.nodes" />
    <p v-else-if="renderState.error" data-render-error class="m-0 whitespace-pre-wrap break-words">{{ value }}</p>
  </div>
</template>
