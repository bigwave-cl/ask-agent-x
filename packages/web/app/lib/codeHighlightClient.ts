import type {
  CodeHighlightPriority,
  CodeHighlightRequest,
  CodeHighlightResponse,
} from './codeHighlightProtocol'
import type { CodeHighlightLanguage } from './codeHighlight'

/** 主线程使用的最小 Worker 接口，便于单元测试注入。 */
export interface CodeHighlightWorkerLike {
  /** Worker 消息回调。 */
  onmessage: ((event: MessageEvent<CodeHighlightResponse>) => void) | null
  /** Worker 运行错误回调。 */
  onerror: ((event: ErrorEvent) => void) | null
  /** 发送高亮请求。 */
  postMessage: (request: CodeHighlightRequest) => void
  /** 立即终止 Worker。 */
  terminate: () => void
}

/** Worker 客户端构造选项。 */
export interface CodeHighlightWorkerClientOptions {
  /** Worker 创建函数。 */
  createWorker: () => CodeHighlightWorkerLike
  /** 无任务后的 Worker 回收时间。 */
  idleTimeoutMs?: number
  /** 全局最多保留的待处理消费者数量。 */
  maxQueuedConsumers?: number
}

/** 发起高亮请求的参数。 */
export interface CodeHighlightClientRequest {
  /** 消费者标识。 */
  consumerId: string
  /** 高亮语言。 */
  language: CodeHighlightLanguage
  /** 原始代码。 */
  source: string
  /** 任务优先级。 */
  priority: CodeHighlightPriority
}

/** Worker 客户端运行诊断。 */
export interface CodeHighlightClientDiagnostics {
  /** Worker 是否已经创建。 */
  workerActive: boolean
  /** 当前注册的消费者数量。 */
  consumerCount: number
  /** 当前执行中的任务数量。 */
  activeTaskCount: number
  /** 当前等待中的任务数量。 */
  queuedTaskCount: number
}

/** 客户端内部高亮任务。 */
interface ClientTask {
  /** Worker 请求。 */
  request: CodeHighlightRequest
  /** 调度优先级。 */
  priority: CodeHighlightPriority
  /** Promise 收口函数。 */
  resolve: (response: CodeHighlightResponse | null) => void
  /** 消费者是否已经释放。 */
  cancelled: boolean
}

/** 默认 Worker 空闲回收时间。 */
const DEFAULT_IDLE_TIMEOUT_MS = 30_000
/** 默认全局等待消费者上限。 */
const DEFAULT_MAX_QUEUED_CONSUMERS = 32

/**
 * 管理唯一高亮 Worker、最新任务覆盖和生命周期回收。
 */
export class CodeHighlightWorkerClient {
  /** Worker 创建函数。 */
  private readonly createWorker: () => CodeHighlightWorkerLike
  /** Worker 空闲回收时间。 */
  private readonly idleTimeoutMs: number
  /** 全局等待消费者上限。 */
  private readonly maxQueuedConsumers: number
  /** 当前注册的消费者。 */
  private readonly consumers = new Set<string>()
  /** 每个消费者最后一个等待任务。 */
  private readonly queuedTasks = new Map<string, ClientTask>()
  /** 当前 Worker。 */
  private worker: CodeHighlightWorkerLike | null = null
  /** 当前执行中的唯一任务。 */
  private activeTask: ClientTask | null = null
  /** 全局递增请求号。 */
  private requestId = 0
  /** Worker 空闲回收定时器。 */
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 创建 Worker 客户端。
   *
   * @param options Worker 创建与容量选项。
   */
  constructor(options: CodeHighlightWorkerClientOptions) {
    this.createWorker = options.createWorker
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
    this.maxQueuedConsumers = options.maxQueuedConsumers ?? DEFAULT_MAX_QUEUED_CONSUMERS
  }

  /**
   * 注册一个高亮消费者，但不会提前创建 Worker。
   *
   * @param consumerId 消费者标识。
   */
  acquire(consumerId: string): void {
    this.consumers.add(consumerId)
  }

  /**
   * 释放消费者和它尚未执行的任务。
   *
   * @param consumerId 消费者标识。
   */
  release(consumerId: string): void {
    this.consumers.delete(consumerId)

    const queuedTask = this.queuedTasks.get(consumerId)
    if (queuedTask) {
      queuedTask.cancelled = true
      queuedTask.resolve(null)
      this.queuedTasks.delete(consumerId)
    }

    if (this.activeTask?.request.consumerId === consumerId) {
      this.activeTask.cancelled = true
      this.activeTask.resolve(null)
      this.activeTask.resolve = () => undefined
    }

    if (this.consumers.size === 0) this.terminate()
  }

  /**
   * 提交高亮任务；同一消费者尚未执行的旧任务会被覆盖。
   *
   * @param input 高亮请求内容。
   * @returns Worker 结果；任务被更新内容覆盖时返回 null。
   */
  request(input: CodeHighlightClientRequest): Promise<CodeHighlightResponse | null> {
    this.acquire(input.consumerId)
    this.clearIdleTimer()

    return new Promise((resolve) => {
      const task: ClientTask = {
        request: {
          type: 'highlight',
          requestId: ++this.requestId,
          consumerId: input.consumerId,
          language: input.language,
          source: input.source,
        },
        priority: input.priority,
        resolve,
        cancelled: false,
      }

      if (!this.activeTask) {
        this.dispatch(task)
        return
      }

      const previousTask = this.queuedTasks.get(input.consumerId)
      if (previousTask) {
        previousTask.cancelled = true
        previousTask.resolve(null)
      }

      if (!previousTask && this.queuedTasks.size >= this.maxQueuedConsumers && !this.makeQueueSpace(input.priority)) {
        task.cancelled = true
        task.resolve(null)
        return
      }

      this.queuedTasks.set(input.consumerId, task)
    })
  }

  /** 立即终止 Worker，并收口所有未完成任务。 */
  terminate(): void {
    this.clearIdleTimer()
    this.worker?.terminate()
    if (this.worker) {
      this.worker.onmessage = null
      this.worker.onerror = null
    }
    this.worker = null

    if (this.activeTask) {
      this.activeTask.cancelled = true
      this.activeTask.resolve(null)
      this.activeTask = null
    }

    for (const task of this.queuedTasks.values()) {
      task.cancelled = true
      task.resolve(null)
    }
    this.queuedTasks.clear()
  }

  /**
   * 返回测试和运行诊断需要的有界状态。
   *
   * @returns 当前 Worker、消费者和任务数量。
   */
  getDiagnostics(): CodeHighlightClientDiagnostics {
    return {
      workerActive: Boolean(this.worker),
      consumerCount: this.consumers.size,
      activeTaskCount: this.activeTask ? 1 : 0,
      queuedTaskCount: this.queuedTasks.size,
    }
  }

  /**
   * 为新任务腾出等待队列空间。
   *
   * @param priority 新任务优先级。
   * @returns 是否存在可用容量。
   */
  private makeQueueSpace(priority: CodeHighlightPriority): boolean {
    if (priority !== 'interactive') return false

    for (const [consumerId, task] of this.queuedTasks) {
      if (task.priority !== 'visible-preview') continue
      task.cancelled = true
      task.resolve(null)
      this.queuedTasks.delete(consumerId)
      return true
    }

    return false
  }

  /**
   * 创建 Worker 并安装消息处理器。
   *
   * @returns 当前唯一 Worker。
   */
  private ensureWorker(): CodeHighlightWorkerLike {
    if (this.worker) return this.worker

    this.worker = this.createWorker()
    this.worker.onmessage = event => this.handleResponse(event.data)
    this.worker.onerror = () => this.handleWorkerError()
    return this.worker
  }

  /**
   * 将唯一活动任务发送给 Worker。
   *
   * @param task 待执行任务。
   */
  private dispatch(task: ClientTask): void {
    try {
      this.clearIdleTimer()
      this.activeTask = task
      const request = task.request
      this.ensureWorker().postMessage(request)
      task.request = { ...request, source: '' }
    }
    catch {
      task.resolve({
        type: 'highlight-failure',
        requestId: task.request.requestId,
        consumerId: task.request.consumerId,
        reason: 'runtime-error',
      })
      this.activeTask = null
      this.handleWorkerError()
    }
  }

  /**
   * 收口 Worker 返回结果并调度下一个最新任务。
   *
   * @param response Worker 返回消息。
   */
  private handleResponse(response: CodeHighlightResponse): void {
    const task = this.activeTask
    if (!task) return
    if (response.requestId !== task.request.requestId || response.consumerId !== task.request.consumerId) return

    this.activeTask = null
    if (!task.cancelled) task.resolve(response)
    this.dispatchNext()
  }

  /** 收口 Worker 运行异常，失败任务不会自动循环重试。 */
  private handleWorkerError(): void {
    this.worker?.terminate()
    if (this.worker) {
      this.worker.onmessage = null
      this.worker.onerror = null
    }
    this.worker = null

    if (this.activeTask) {
      const task = this.activeTask
      this.activeTask = null
      if (!task.cancelled) {
        task.resolve({
          type: 'highlight-failure',
          requestId: task.request.requestId,
          consumerId: task.request.consumerId,
          reason: 'runtime-error',
        })
      }
    }

    for (const task of this.queuedTasks.values()) {
      if (!task.cancelled) {
        task.resolve({
          type: 'highlight-failure',
          requestId: task.request.requestId,
          consumerId: task.request.consumerId,
          reason: 'runtime-error',
        })
      }
    }
    this.queuedTasks.clear()
  }

  /** 从有界等待队列选择下一个任务。 */
  private dispatchNext(): void {
    if (this.activeTask) return

    let nextEntry: [string, ClientTask] | undefined
    for (const entry of this.queuedTasks) {
      if (!nextEntry) nextEntry = entry
      if (entry[1].priority === 'interactive') {
        nextEntry = entry
        break
      }
    }

    if (!nextEntry) {
      this.scheduleIdleTermination()
      return
    }

    this.queuedTasks.delete(nextEntry[0])
    if (nextEntry[1].cancelled || !this.consumers.has(nextEntry[0])) {
      nextEntry[1].resolve(null)
      this.dispatchNext()
      return
    }
    this.dispatch(nextEntry[1])
  }

  /** 在没有任务时安排 Worker 空闲回收。 */
  private scheduleIdleTermination(): void {
    this.clearIdleTimer()
    if (!this.worker) return
    this.idleTimer = setTimeout(() => this.terminate(), this.idleTimeoutMs)
  }

  /** 清理 Worker 空闲回收计时器。 */
  private clearIdleTimer(): void {
    if (!this.idleTimer) return
    clearTimeout(this.idleTimer)
    this.idleTimer = null
  }
}

/** 浏览器会话内共享的 Worker 客户端。 */
let browserClient: CodeHighlightWorkerClient | undefined

/**
 * 获取浏览器会话内唯一的高亮 Worker 客户端。
 *
 * @returns 客户端环境返回 Worker 客户端；SSR 返回 null。
 */
export function getCodeHighlightWorkerClient(): CodeHighlightWorkerClient | null {
  if (!import.meta.client) return null
  browserClient ??= new CodeHighlightWorkerClient({
    createWorker: () => new Worker(new URL('../workers/codeHighlight.worker.ts', import.meta.url), { type: 'module' }),
  })
  return browserClient
}
