import { createSharedComposable, useRafFn } from '@vueuse/core'

/** MDC 打字机调度任务。 */
type MarkdownTypewriterTask = () => boolean

/** 打字机调度器对外能力。 */
interface MarkdownTypewriterScheduler {
  /** 注册或更新指定实例的调度任务。 */
  schedule: (taskId: symbol, task: MarkdownTypewriterTask) => void
  /** 移除指定实例的调度任务。 */
  remove: (taskId: symbol) => void
}

/** 相邻 MDC 展示更新的最小时间间隔。 */
const typewriterFrameInterval = 32
/** 单次调度最多推进的 MDC 实例数量。 */
const maxTasksPerFrame = 4

/**
 * 创建页面级共享 MDC 打字机调度器。
 *
 * 所有调用方复用一个 RAF，并在没有活动任务时自动暂停。
 *
 * @returns MDC 打字机任务注册与移除能力。
 */
export const useMarkdownTypewriterScheduler = createSharedComposable(
  (): MarkdownTypewriterScheduler => {
    /** 当前等待推进的 MDC 实例任务。 */
    const tasks = new Map<symbol, MarkdownTypewriterTask>()
    /** 上一次真正执行任务的帧时间。 */
    let lastFrameAt = 0
    /** 下一轮公平调度的起始位置。 */
    let taskCursor = 0

    /** 页面唯一的 MDC 打字机动画循环。 */
    const { pause, resume } = useRafFn(
      ({ timestamp }) => {
        if (timestamp - lastFrameAt < typewriterFrameInterval) return
        lastFrameAt = timestamp

        /** 当前帧使用的稳定任务快照。 */
        const taskEntries = [...tasks.entries()]
        if (!taskEntries.length) {
          taskCursor = 0
          pause()
          return
        }

        /** 当前帧实际允许推进的任务数量。 */
        const taskCount = Math.min(maxTasksPerFrame, taskEntries.length)
        for (let offset = 0; offset < taskCount; offset += 1) {
          /** 按 round-robin 选择的任务位置。 */
          const taskIndex = (taskCursor + offset) % taskEntries.length
          /** 当前需要推进的 MDC 任务。 */
          const taskEntry = taskEntries[taskIndex]
          if (!taskEntry) continue
          const [taskId, task] = taskEntry
          if (!task()) tasks.delete(taskId)
        }

        taskCursor = tasks.size
          ? (taskCursor + taskCount) % tasks.size
          : 0
        if (!tasks.size) pause()
      },
      { immediate: false },
    )

    /**
     * 注册或更新指定 MDC 的调度任务。
     *
     * @param taskId MDC 实例任务标识。
     * @param task 单次推进方法，返回是否仍需继续调度。
     */
    function schedule(taskId: symbol, task: MarkdownTypewriterTask): void {
      tasks.set(taskId, task)
      resume()
    }

    /**
     * 移除指定 MDC 的调度任务。
     *
     * @param taskId MDC 实例任务标识。
     */
    function remove(taskId: symbol): void {
      tasks.delete(taskId)
      if (!tasks.size) pause()
    }

    return {
      schedule,
      remove,
    }
  },
)
