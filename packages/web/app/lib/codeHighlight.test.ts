import type { CodeHighlightRequest, CodeHighlightResponse } from './codeHighlightProtocol'
import type { CodeHighlightWorkerLike } from './codeHighlightClient'
import { describe, expect, it, vi } from 'vitest'
import {
  createPlainCodeHighlightResult,
  getCodeHighlightSkipReason,
  MAX_HIGHLIGHT_BYTES,
  MAX_HIGHLIGHT_LINES,
  resolveCodeHighlightLanguage,
} from './codeHighlight'
import { CodeHighlightWorkerClient } from './codeHighlightClient'

/** 单元测试使用的可控 Worker。 */
class FakeHighlightWorker implements CodeHighlightWorkerLike {
  /** Worker 消息回调。 */
  onmessage: ((event: MessageEvent<CodeHighlightResponse>) => void) | null = null
  /** Worker 运行错误回调。 */
  onerror: ((event: ErrorEvent) => void) | null = null
  /** 已收到的请求。 */
  readonly requests: CodeHighlightRequest[] = []
  /** 是否已经终止。 */
  terminated = false

  /** 记录主线程请求。 */
  postMessage(request: CodeHighlightRequest): void {
    this.requests.push(request)
  }

  /** 标记 Worker 已终止。 */
  terminate(): void {
    this.terminated = true
  }

  /**
   * 主动返回某个请求的成功结果。
   *
   * @param request 需要完成的请求。
   */
  succeed(request: CodeHighlightRequest): void {
    this.onmessage?.({
      data: {
        type: 'highlight-success',
        requestId: request.requestId,
        consumerId: request.consumerId,
        language: request.language,
        segments: [{ value: request.source, scopes: ['hljs-string'] }],
        durationMs: 2,
      },
    } as MessageEvent<CodeHighlightResponse>)
  }
}

describe('代码高亮语言与容量规则', () => {
  it('使用显式语言并通过文件扩展名兜底', () => {
    expect(resolveCodeHighlightLanguage('yml')).toBe('yaml')
    expect(resolveCodeHighlightLanguage('shell')).toBe('bash')
    expect(resolveCodeHighlightLanguage('jsonc')).toBe('json')
    expect(resolveCodeHighlightLanguage('tsx')).toBe('typescript')
    expect(resolveCodeHighlightLanguage('', 'settings.yaml')).toBe('yaml')
    expect(resolveCodeHighlightLanguage('text', 'install.sh')).toBe('bash')
    expect(resolveCodeHighlightLanguage('', 'config.local.json.example')).toBe('json')
    expect(resolveCodeHighlightLanguage('', 'page.html.template')).toBe('xml')
    expect(resolveCodeHighlightLanguage('', 'README')).toBeNull()
  })

  it('在空内容、未知语言和超限内容时同步降级', () => {
    expect(getCodeHighlightSkipReason('', 'yaml')).toBe('empty')
    expect(getCodeHighlightSkipReason('plain', null)).toBe('unsupported')
    expect(getCodeHighlightSkipReason('a'.repeat(MAX_HIGHLIGHT_BYTES + 1), 'yaml')).toBe('too-large')
    expect(getCodeHighlightSkipReason(`${'a\n'.repeat(MAX_HIGHLIGHT_LINES)}a`, 'yaml')).toBe('too-many-lines')
  })

  it('纯文本结果始终保留原始源码', () => {
    expect(createPlainCodeHighlightResult('<script>alert(1)</script>', 'xml')).toEqual({
      language: 'xml',
      highlighted: false,
      segments: [{ value: '<script>alert(1)</script>', scopes: [] }],
    })
  })
})

describe('代码高亮 Worker 客户端', () => {
  it('注册消费者时不会提前创建 Worker', () => {
    let createCount = 0
    const client = new CodeHighlightWorkerClient({
      createWorker: () => {
        createCount += 1
        return new FakeHighlightWorker()
      },
    })

    client.acquire('editor')

    expect(createCount).toBe(0)
    expect(client.getDiagnostics()).toEqual({
      workerActive: false,
      consumerCount: 1,
      activeTaskCount: 0,
      queuedTaskCount: 0,
    })
  })

  it('每个消费者只保留一个最新等待任务', async () => {
    const worker = new FakeHighlightWorker()
    const client = new CodeHighlightWorkerClient({ createWorker: () => worker })

    const first = client.request({ consumerId: 'editor', language: 'yaml', source: 'first: true', priority: 'interactive' })
    const second = client.request({ consumerId: 'editor', language: 'yaml', source: 'second: true', priority: 'interactive' })
    const third = client.request({ consumerId: 'editor', language: 'yaml', source: 'third: true', priority: 'interactive' })

    expect(client.getDiagnostics().activeTaskCount).toBe(1)
    expect(client.getDiagnostics().queuedTaskCount).toBe(1)
    await expect(second).resolves.toBeNull()

    worker.succeed(worker.requests[0]!)
    await expect(first).resolves.toMatchObject({ type: 'highlight-success' })
    expect(worker.requests).toHaveLength(2)
    expect(worker.requests[1]?.source).toBe('third: true')

    worker.succeed(worker.requests[1]!)
    await expect(third).resolves.toMatchObject({ type: 'highlight-success' })
    expect(client.getDiagnostics().queuedTaskCount).toBe(0)
  })

  it('交互任务可以替换容量已满时的预览任务', async () => {
    const worker = new FakeHighlightWorker()
    const client = new CodeHighlightWorkerClient({ createWorker: () => worker, maxQueuedConsumers: 1 })

    const active = client.request({ consumerId: 'preview-active', language: 'json', source: '{}', priority: 'visible-preview' })
    const droppedPreview = client.request({ consumerId: 'preview-queued', language: 'json', source: '{"a":1}', priority: 'visible-preview' })
    const editor = client.request({ consumerId: 'editor', language: 'json', source: '{"edit":true}', priority: 'interactive' })

    await expect(droppedPreview).resolves.toBeNull()
    worker.succeed(worker.requests[0]!)
    await active
    expect(worker.requests[1]?.consumerId).toBe('editor')
    worker.succeed(worker.requests[1]!)
    await expect(editor).resolves.toMatchObject({ type: 'highlight-success' })
  })

  it('最后一个消费者释放后终止 Worker 并清空任务', async () => {
    const worker = new FakeHighlightWorker()
    const client = new CodeHighlightWorkerClient({ createWorker: () => worker })
    const task = client.request({ consumerId: 'editor', language: 'bash', source: 'echo ok', priority: 'interactive' })

    client.release('editor')

    await expect(task).resolves.toBeNull()
    expect(worker.terminated).toBe(true)
    expect(client.getDiagnostics()).toEqual({
      workerActive: false,
      consumerCount: 0,
      activeTaskCount: 0,
      queuedTaskCount: 0,
    })
  })

  it('空闲超时后释放 Worker 内存', async () => {
    vi.useFakeTimers()
    const worker = new FakeHighlightWorker()
    const client = new CodeHighlightWorkerClient({ createWorker: () => worker, idleTimeoutMs: 100 })
    const task = client.request({ consumerId: 'editor', language: 'css', source: 'a{}', priority: 'interactive' })
    worker.succeed(worker.requests[0]!)
    await task

    await vi.advanceTimersByTimeAsync(100)

    expect(worker.terminated).toBe(true)
    expect(client.getDiagnostics().workerActive).toBe(false)
    client.release('editor')
    vi.useRealTimers()
  })
})
