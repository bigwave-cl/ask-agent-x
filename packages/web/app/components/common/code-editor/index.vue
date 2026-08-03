<script setup lang="ts">
import type { CodeHighlightSegment } from '@/lib/codeHighlight'
import { createCodeEditorLines } from './codeEditorLines'

defineOptions({ name: 'CsCodeEditor', inheritAttrs: false })

/** 代码编辑器属性。 */
interface Props {
  /** 文件名，用于语法兜底识别。 */
  filename?: string
  /** 显式代码语言。 */
  language?: string
  /** textarea 无障碍名称。 */
  label: string
  /** 切换语言并等待语法渲染时的提示。 */
  loadingLabel: string
  /** 是否只读。 */
  readonly?: boolean
  /** 是否禁用。 */
  disabled?: boolean
  /** 输入占位文案。 */
  placeholder?: string
}

/** 代码编辑器属性及默认值。 */
const props = withDefaults(defineProps<Props>(), {
  filename: '',
  language: '',
  readonly: false,
  disabled: false,
  placeholder: '',
})
/** 编辑器原始文本。 */
const modelValue = defineModel<string>({ default: '' })
/** 调用方透传的原生属性。 */
const attrs = useAttrs()
/** 是否正在进行输入法组合输入。 */
const isComposing = ref(false)
/** 当前是否正在等待新语言完成首次渲染。 */
const languageTransition = ref(true)
/** 根节点接收的调用方 class。 */
const rootClass = computed(() => attrs.class)
/** 除 class 外透传给 textarea 的原生属性。 */
const textareaAttrs = computed(() => {
  const { class: _class, ...remainingAttrs } = attrs
  return remainingAttrs
})
/** 是否允许异步高亮。 */
const highlightEnabled = computed(() => !props.disabled && !isComposing.value)
/** 异步高亮结果与状态。 */
const { result, status, refresh } = useCodeHighlight({
  source: modelValue,
  language: () => props.language,
  filename: () => props.filename,
  enabled: highlightEnabled,
  priority: 'interactive',
  debounceMs: 80,
})
/** 是否已经显示与当前文本一致的高亮镜像。 */
const highlightReady = computed(() => status.value === 'ready' && result.value.highlighted)
/** 是否展示阻止误编辑的语言加载反馈。 */
const languageLoading = computed(() => languageTransition.value && status.value === 'loading')
/** 未完成高亮时用于保持输入布局稳定的纯文本片段。 */
const plainSegments = computed<CodeHighlightSegment[]>(() => [{ value: modelValue.value, scopes: [] }])
/** 与 textarea 软换行宽度一致的逻辑代码行。 */
const editorLines = computed(() => createCodeEditorLines(highlightReady.value ? result.value.segments : plainSegments.value))

/** 暂停组合输入期间的异步高亮。 */
function handleCompositionStart(): void {
  isComposing.value = true
}

/** 在组合输入完成后刷新最终文本高亮。 */
function handleCompositionEnd(): void {
  isComposing.value = false
  refresh()
}

watch(() => [props.language, props.filename], () => {
  languageTransition.value = true
})
watch(status, (nextStatus) => {
  if (nextStatus !== 'loading') languageTransition.value = false
})
</script>

<template>
  <div
    :class="[
      'code-editor relative min-h-48 overflow-hidden rounded-xl border bg-background transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30',
      rootClass,
    ]"
    :data-highlight-status="status"
    :data-language-loading="languageLoading"
  >
    <div class="absolute inset-0">
      <ScrollArea type="always" orientation="vertical" class="size-full" viewport-class="overflow-x-hidden overscroll-contain">
        <div class="relative min-h-full w-full">
          <span aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-0 w-12 border-r border-ds-border-subtle-10 bg-ds-fill-bw-transparent-3" />
          <pre
            aria-hidden="true"
            class="code-editor__mirror pointer-events-none relative m-0 min-h-full w-full whitespace-pre-wrap bg-transparent py-4 font-mono text-xs leading-6 text-foreground [overflow-wrap:anywhere] [tab-size:2]"
          ><span v-for="(line, lineIndex) in editorLines" :key="lineIndex" class="grid min-h-6 grid-cols-[3rem_minmax(0,1fr)]"><span class="select-none pr-3 text-right text-[10px] leading-6 text-muted-foreground/55">{{ lineIndex + 1 }}</span><code class="code-editor__mirror-code hljs block min-w-0 whitespace-pre-wrap pl-3 pr-4 [overflow-wrap:anywhere]" :class="highlightReady ? 'opacity-100' : 'opacity-0'"><template v-if="line.segments.length"><span v-for="(segment, segmentIndex) in line.segments" :key="segmentIndex" :class="segment.scopes">{{ segment.value }}</span></template><span v-else>&#8203;</span></code></span></pre>

          <textarea
            v-bind="textareaAttrs"
            v-model="modelValue"
            :aria-label="label"
            :aria-busy="status === 'loading'"
            :readonly="readonly"
            :disabled="disabled"
            :placeholder="placeholder"
            spellcheck="false"
            wrap="soft"
            class="absolute inset-0 size-full resize-none overflow-hidden whitespace-pre-wrap bg-transparent py-4 pl-[3.75rem] pr-4 font-mono text-xs leading-6 outline-none [overflow-wrap:anywhere] [tab-size:2] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            :class="highlightReady ? 'code-editor__input--highlighted' : 'text-foreground'"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
          />
        </div>
      </ScrollArea>
    </div>

    <div
      v-if="languageLoading"
      class="absolute inset-0 z-10 grid place-items-center bg-background/88 p-6 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
    >
      <div class="grid w-full max-w-sm gap-5">
        <div class="mx-auto flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm">
          <Icon name="askx-status:loading" class="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
          <span>{{ loadingLabel }}</span>
        </div>
        <div class="grid gap-3 opacity-70" aria-hidden="true">
          <span class="h-2.5 w-3/4 animate-pulse rounded-full bg-ds-fill-brand-transparent-20 motion-reduce:animate-none" />
          <span class="h-2.5 w-full animate-pulse rounded-full bg-ds-fill-bw-transparent-5 [animation-delay:80ms] motion-reduce:animate-none" />
          <span class="h-2.5 w-5/6 animate-pulse rounded-full bg-ds-fill-bw-transparent-5 [animation-delay:160ms] motion-reduce:animate-none" />
          <span class="h-2.5 w-2/3 animate-pulse rounded-full bg-ds-fill-bw-transparent-5 [animation-delay:240ms] motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.code-editor__input--highlighted {
  color: transparent;
  caret-color: var(--ds-color-text-primary);
  -webkit-text-fill-color: transparent;
}

.code-editor__input--highlighted::selection {
  background: color-mix(in srgb, var(--ds-color-brand-default) 28%, transparent);
}

@media (prefers-reduced-motion: no-preference) {
  .code-editor__mirror-code {
    transition: opacity 120ms ease;
  }
}
</style>
