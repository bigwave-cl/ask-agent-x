import type { MaybeRefOrGetter, Ref } from 'vue'
import type { CodeHighlightPriority } from '@/lib/codeHighlightProtocol'
import type { CodeHighlightResult, CodeHighlightStatus } from '@/lib/codeHighlight'
import {
  createPlainCodeHighlightResult,
  getCodeHighlightSkipReason,
  resolveCodeHighlightLanguage,
} from '@/lib/codeHighlight'
import { getCodeHighlightWorkerClient } from '@/lib/codeHighlightClient'

/** useCodeHighlight 调用选项。 */
export interface UseCodeHighlightOptions {
  /** 需要高亮的原始代码。 */
  source: MaybeRefOrGetter<string>
  /** 显式语言。 */
  language?: MaybeRefOrGetter<string>
  /** 用于识别语言的文件名。 */
  filename?: MaybeRefOrGetter<string>
  /** 是否允许执行异步高亮。 */
  enabled?: MaybeRefOrGetter<boolean>
  /** 任务优先级。 */
  priority?: CodeHighlightPriority
  /** 连续输入后的调度延迟。 */
  debounceMs?: number
}

/** useCodeHighlight 返回状态。 */
export interface UseCodeHighlightReturn {
  /** 受控高亮结果。 */
  result: Ref<CodeHighlightResult>
  /** 当前异步运行状态。 */
  status: Ref<CodeHighlightStatus>
  /** 最近一次 Worker 解析耗时。 */
  durationMs: Ref<number>
  /** 立即重新调度当前内容。 */
  refresh: () => void
}

/** 模块内消费者序号。 */
let consumerSequence = 0

/**
 * 在客户端按需调度 Worker 高亮，并在 SSR 保持纯文本结果。
 *
 * @param options 源码、语言和调度选项。
 * @returns 响应式高亮结果和运行状态。
 */
export function useCodeHighlight(options: UseCodeHighlightOptions): UseCodeHighlightReturn {
  /** 当前消费者标识。 */
  const consumerId = `code-highlight-${++consumerSequence}`
  /** 当前源码。 */
  const source = computed(() => toValue(options.source))
  /** 当前显式语言。 */
  const explicitLanguage = computed(() => options.language === undefined ? '' : toValue(options.language))
  /** 当前文件名。 */
  const filename = computed(() => options.filename === undefined ? '' : toValue(options.filename))
  /** 当前是否允许异步高亮。 */
  const enabled = computed(() => options.enabled === undefined ? true : toValue(options.enabled))
  /** 当前标准语言。 */
  const normalizedLanguage = computed(() => resolveCodeHighlightLanguage(explicitLanguage.value, filename.value))
  /** 当前受控高亮结果。 */
  const result = shallowRef(createPlainCodeHighlightResult(source.value, normalizedLanguage.value))
  /** 当前高亮状态。 */
  const status = ref<CodeHighlightStatus>('idle')
  /** 最近一次 Worker 解析耗时。 */
  const durationMs = ref(0)
  /** 当前组件任务版本。 */
  let revision = 0
  /** 连续输入防抖计时器。 */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  /** 下一帧调度标识。 */
  let animationFrame = 0
  /** 当前组件是否已经挂载。 */
  let mounted = false

  /** 清理等待中的调度任务。 */
  function clearSchedule(): void {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = null
    if (animationFrame) cancelAnimationFrame(animationFrame)
    animationFrame = 0
  }

  /** 执行一次最新内容的 Worker 高亮。 */
  async function runHighlight(): Promise<void> {
    const currentSource = source.value
    const language = normalizedLanguage.value
    const currentRevision = ++revision
    const skipReason = getCodeHighlightSkipReason(currentSource, language)

    result.value = createPlainCodeHighlightResult(currentSource, language)
    durationMs.value = 0

    if (!enabled.value) {
      status.value = 'idle'
      return
    }
    if (skipReason) {
      status.value = skipReason === 'unsupported' ? 'unsupported' : skipReason === 'empty' ? 'idle' : 'skipped'
      return
    }

    const client = getCodeHighlightWorkerClient()
    if (!client || !language) {
      status.value = 'unsupported'
      return
    }

    status.value = 'loading'
    const response = await client.request({
      consumerId,
      language,
      source: currentSource,
      priority: options.priority ?? 'interactive',
    })

    if (currentRevision !== revision || !mounted) return
    if (!response) {
      status.value = 'idle'
      return
    }
    if (response.type === 'highlight-failure') {
      status.value = 'failed'
      return
    }

    result.value = {
      language: response.language,
      highlighted: true,
      segments: response.segments,
    }
    durationMs.value = response.durationMs
    status.value = 'ready'
  }

  /** 合并连续输入，并在下一动画帧发送最新任务。 */
  function refresh(): void {
    if (!mounted) return
    clearSchedule()
    revision += 1
    result.value = createPlainCodeHighlightResult(source.value, normalizedLanguage.value)
    status.value = enabled.value ? 'loading' : 'idle'
    debounceTimer = setTimeout(() => {
      animationFrame = requestAnimationFrame(() => void runHighlight())
    }, options.debounceMs ?? 80)
  }

  onMounted(() => {
    mounted = true
    getCodeHighlightWorkerClient()?.acquire(consumerId)
    refresh()
  })

  watch([source, explicitLanguage, filename, enabled], refresh)

  onScopeDispose(() => {
    mounted = false
    revision += 1
    clearSchedule()
    getCodeHighlightWorkerClient()?.release(consumerId)
  })

  return { result, status, durationMs, refresh }
}
