import type { ComputedRef } from 'vue'
import { computed, nextTick, ref } from 'vue'

/** Ajax Loading 控制器。 */
export interface AjaxLoaderController {
  /** 当前是否存在执行中的异步任务。 */
  ajaxLoader: ComputedRef<boolean>
  /** 增加或释放一个异步任务。 */
  loader: (state: boolean) => void
  /** 为异步函数自动管理 Loading。 */
  wrapPromiseWithLoader: <TArgs extends unknown[], TResult>(task: (...args: TArgs) => Promise<TResult>) => (...args: TArgs) => Promise<TResult>
  /** 强制清空全部 Loading 状态。 */
  resetLoader: () => void
}

/** 创建支持并发引用计数的 Loading 控制器。 */
export function useAjaxLoader(watchCallback?: (loading: boolean) => void): AjaxLoaderController {
  const activeCount = ref(0)
  const loading = ref(false)

  /** 同步公开状态并通知观察者。 */
  function updateLoading(next: boolean): void {
    if (loading.value === next) return
    loading.value = next
    watchCallback?.(next)
  }

  /** 增加或释放一个任务。 */
  function loader(state: boolean): void {
    if (state) {
      activeCount.value += 1
      updateLoading(true)
      return
    }

    activeCount.value = Math.max(0, activeCount.value - 1)
    const settle = () => {
      if (activeCount.value === 0) updateLoading(false)
    }
    if (import.meta.server) settle()
    else setTimeout(settle, 0)
  }

  /** 等待 Loading 至少完成一次浏览器绘制。 */
  async function waitForLoaderPaint(): Promise<void> {
    if (import.meta.server) return
    await nextTick()
    if (typeof requestAnimationFrame !== 'function') {
      await new Promise(resolve => setTimeout(resolve, 0))
      return
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  }

  /** 为异步函数自动增加和释放任务。 */
  function wrapPromiseWithLoader<TArgs extends unknown[], TResult>(task: (...args: TArgs) => Promise<TResult>): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
      const isFirstTask = activeCount.value === 0
      loader(true)
      try {
        if (isFirstTask) await waitForLoaderPaint()
        return await task(...args)
      } finally {
        loader(false)
      }
    }
  }

  /** 强制清空全部任务。 */
  function resetLoader(): void {
    activeCount.value = 0
    updateLoading(false)
  }

  return { ajaxLoader: computed(() => loading.value), loader, wrapPromiseWithLoader, resetLoader }
}
