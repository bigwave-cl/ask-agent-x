import { afterEach, expect, test, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useAgentCore } from './useAgentCore'

/** 测试结束释放自动导入的运行时替身。 */
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

test('navigation during service preflight never sends the old draft to the new thread', async () => {
    vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
    vi.stubGlobal('useToast', () => ({ error: vi.fn() }))
    const fetch = vi.fn().mockResolvedValue({ namespace: 'home', messages: [], turn: null, thread: { id: 'next', title: 'next' }, nextCursor: null })
    vi.stubGlobal('$fetch', fetch)
    const scope = effectScope()
    const threadId = ref('')
    let resume: (running: boolean) => void = () => {}
    const requireRunning = vi.fn(() => new Promise<boolean>(resolve => { resume = resolve }))
    const conversation = scope.run(() => useAgentCore({ threadId, context: ref({ chatId: 'chat', projectPath: '/project' }), canCompose: ref(true), requireRunning, onCreated: vi.fn(), onCatalogChanged: vi.fn(), onTitle: vi.fn() }))!
    conversation.draft.value = 'first'
    const first = conversation.send()
    const duplicate = conversation.send()
    expect(requireRunning).toHaveBeenCalledTimes(1)
    threadId.value = 'next'
    conversation.draft.value = 'new draft'
    resume(true)
    await Promise.all([first, duplicate])
    expect(fetch.mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true)
    expect(conversation.draft.value).toBe('new draft')
    expect(conversation.submitting.value).toBe(false)
    scope.stop()
})

/** 测试用可手动完成的异步请求。 */
function deferred<T>() {
    /** 请求完成入口。 */
    let resolve!: (value: T) => void
    /** 请求失败入口。 */
    let reject!: (error: unknown) => void
    /** 交给被测代码等待的任务。 */
    const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
    return { promise, resolve, reject }
}

/** 无真实网络连接的页面实时订阅。 */
class TestEventSource {
    /** 本次测试创建的连接。 */
    static instances: TestEventSource[] = []
    /** 已打开连接的回调。 */
    onopen: (() => void) | null = null
    /** 连接错误回调。 */
    onerror: (() => void) | null = null
    /** 标准消息回调。 */
    onmessage: ((event: { data: string }) => void) | null = null
    /** 释放连接的可观察替身。 */
    close = vi.fn()
    constructor() { TestEventSource.instances.push(this) }
    /** 向当前页面投递标准完整事件。 */
    emit(event: object) { this.onmessage?.({ data: JSON.stringify(event) }) }
}

/** 构造最小标准历史响应。 */
function snapshot(threadId = 'thread') {
    return { namespace: 'home', messages: [], turn: null, thread: { id: threadId, title: threadId }, nextCursor: null }
}
/** 构造消息更新事件，文本始终为完整快照。 */
function itemEvent(content: string, sequence = 1) {
    return { version: 1, namespace: 'home', threadId: 'thread', runId: 'run', sequence, createdAt: '', type: 'item.upsert', item: { id: 'assistant', turnId: 'turn', role: 'assistant', kind: 'message', content, status: 'inProgress', createdAt: null } }
}
/** 构造当前 Web 执行轮次事件。 */
function turnEvent(status: 'inProgress' | 'completed', sequence = 1) {
    return { version: 1, namespace: 'home', threadId: 'thread', runId: 'run', sequence, createdAt: '', type: 'turn.status', turn: { id: 'turn', runId: 'run', channel: 'web', status, canInterrupt: true, updatedAt: '' } }
}
/** 初始化隔离页面，默认请求只返回本地固定快照。 */
function setupCore(thread = 'thread', browser = true, withDraftSession = false) {
    TestEventSource.instances = []
    if (browser) vi.stubGlobal('window', {})
    vi.stubGlobal('EventSource', TestEventSource)
    vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
    /** 统一错误提示替身。 */
    const error = vi.fn()
    vi.stubGlobal('useToast', () => ({ error }))
    /** 所有 HTTP 请求由测试控制，禁止真实服务。 */
    const fetch = vi.fn().mockImplementation(async () => snapshot())
    vi.stubGlobal('$fetch', fetch)
    /** 当前导航线程。 */
    const threadId = ref(thread)
    /** 页面生命周期。 */
    const scope = effectScope()
    /** 会话目录更新回调。 */
    const onCatalogChanged = vi.fn()
    /** 预检默认允许提交。 */
    const requireRunning = vi.fn(async () => true)
    /** 显式新建草稿的生命周期。 */
    const draftSessionKey = ref(0)
    /** 可由选择器更新的标准上下文。 */
    const context = ref({ chatId: 'chat', projectPath: '/project' })
    /** 当前 active 绑定的发送资格。 */
    const canCompose = ref(true)
    /** 正式 Core 及其唯一历史接口。 */
    const core = scope.run(() => useAgentCore({ threadId, context, canCompose, draftSessionKey: withDraftSession ? draftSessionKey : undefined, requireRunning, onCreated: created => { threadId.value = created.id }, onCatalogChanged, onTitle: vi.fn() }))!
    return { core, fetch, error, threadId, scope, onCatalogChanged, requireRunning, draftSessionKey, context, canCompose }
}

// 各用例显式结束页面，连接不会依赖真实浏览器退出而释放。
test('history and pagination preserve live content and reject late navigation responses', async () => {
    const page = setupCore()
    await Promise.resolve()
    const history = deferred<Omit<ReturnType<typeof snapshot>, 'nextCursor'> & { nextCursor: string }>()
    page.fetch.mockImplementationOnce(() => history.promise)
    const loading = page.core.historyHub.loadHistory()
    TestEventSource.instances[0]!.emit(itemEvent('live'))
    history.resolve({ ...snapshot(), nextCursor: 'older' })
    await loading
    expect(page.core.historyHub.messages.value[0]?.content).toBe('live')
    const oldPage = deferred<ReturnType<typeof snapshot>>()
    page.fetch.mockImplementationOnce(() => oldPage.promise)
    const older = page.core.historyHub.loadHistory(true)
    await page.core.historyHub.loadHistory(true)
    expect(page.core.historyHub.loadingMore.value).toBe(true)
    page.threadId.value = 'next'
    oldPage.resolve(snapshot())
    await older
    expect(page.core.historyHub.messages.value).toHaveLength(0)
    expect(page.core.historyHub.loadingMore.value).toBe(false)
    expect(TestEventSource.instances[0]!.close).toHaveBeenCalledOnce()
    page.scope.stop()
})

test('send acceptance confirms pending identity and preserves the next draft', async () => {
    const page = setupCore()
    await Promise.resolve()
    const accepted = deferred<object>()
    page.fetch.mockImplementationOnce(() => accepted.promise)
    page.core.draft.value = 'first'
    const sending = page.core.send()
    await Promise.resolve()
    const pending = page.core.historyHub.messages.value[0]!
    expect(pending.clientMessageId).toBeTruthy()
    expect(page.core.submitting.value).toBe(true)
    page.core.draft.value = 'next draft'
    accepted.resolve({ namespace: 'home', messages: [{ ...pending, id: 'confirmed', status: 'completed' }], turn: turnEvent('inProgress').turn })
    await sending
    expect(page.core.historyHub.messages.value.map(item => item.id)).toEqual(['confirmed'])
    expect(page.core.draft.value).toBe('next draft')
    expect(page.core.running.value).toBe(true)
    expect(page.core.submitting.value).toBe(false)
    page.scope.stop()
})

test('created thread adopts its owner while preserving continuing input', async () => {
    const page = setupCore('', true, true)
    const created = deferred<{ id: string, title: string }>()
    page.fetch.mockImplementationOnce(() => created.promise)
    page.core.draft.value = 'first'
    const sending = page.core.send()
    await Promise.resolve()
    page.core.draft.value = 'continuing'
    created.resolve({ id: 'created', title: 'created' })
    await sending
    expect(page.threadId.value).toBe('created')
    expect(page.core.draft.value).toBe('continuing')
    expect(page.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2)
    page.scope.stop()
})

test('stop keeps execution running until the terminal event arrives', async () => {
    const page = setupCore()
    await Promise.resolve()
    const source = TestEventSource.instances[0]!
    source.emit(turnEvent('inProgress'))
    expect(page.core.canStop.value).toBe(true)
    await page.core.interrupt()
    expect(page.fetch.mock.calls.some(([url]) => url.endsWith('/interrupt'))).toBe(true)
    expect(page.core.running.value).toBe(true)
    source.emit(turnEvent('completed', 2))
    expect(page.core.running.value).toBe(false)
    expect(page.core.canStop.value).toBe(false)
    page.scope.stop()
})

test('stale send failures cannot restore old drafts or report errors in another conversation', async () => {
    const page = setupCore()
    await Promise.resolve()
    const accepted = deferred<object>()
    page.fetch.mockImplementationOnce(() => accepted.promise)
    page.core.draft.value = 'first'
    const sending = page.core.send()
    await Promise.resolve()
    page.threadId.value = 'next'
    page.core.draft.value = 'next draft'
    accepted.reject(new Error('old request'))
    await sending
    expect(page.core.draft.value).toBe('next draft')
    expect(page.error).not.toHaveBeenCalled()
    page.scope.stop()
})

test('directory invalidations coalesce and disposal closes streams and ignores late history', async () => {
    vi.useFakeTimers()
    const page = setupCore()
    const source = TestEventSource.instances[0]!
    const event = { ...itemEvent(''), type: 'catalog.changed' }
    source.emit(event)
    source.emit(event)
    vi.advanceTimersByTime(149)
    expect(page.onCatalogChanged).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(page.onCatalogChanged).toHaveBeenCalledOnce()
    const history = deferred<ReturnType<typeof snapshot>>()
    page.fetch.mockImplementationOnce(() => history.promise)
    const pending = page.core.historyHub.loadHistory()
    source.emit(event)
    page.scope.stop()
    history.resolve(snapshot())
    await pending
    vi.runAllTimers()
    expect(source.close).toHaveBeenCalledOnce()
    expect(page.onCatalogChanged).toHaveBeenCalledOnce()
    expect(page.error).not.toHaveBeenCalled()
    vi.useRealTimers()
})

test('server rendering creates no browser event stream', () => {
    const page = setupCore('', false)
    expect(TestEventSource.instances).toHaveLength(0)
    page.scope.stop()
})

test('current send failure restores an untouched draft and reports one error', async () => {
    const page = setupCore()
    await Promise.resolve()
    page.fetch.mockRejectedValueOnce(new Error('rejected'))
    page.core.draft.value = 'first'
    await page.core.send()
    expect(page.core.draft.value).toBe('first')
    expect(page.core.historyHub.messages.value[0]?.status).toBe('failed')
    expect(page.error).toHaveBeenCalledOnce()
    page.scope.stop()
})

test('stream reset invalidates accepted snapshots from the previous owner', async () => {
    const page = setupCore()
    await Promise.resolve()
    const accepted = deferred<object>()
    page.fetch.mockImplementationOnce(() => accepted.promise)
    page.core.draft.value = 'first'
    const sending = page.core.send()
    await Promise.resolve()
    const pending = page.core.historyHub.messages.value[0]!
    const source = TestEventSource.instances[0]!
    source.onerror?.()
    expect(page.core.connection.value).toBe('reconnecting')
    source.onopen?.()
    expect(page.core.connection.value).toBe('connected')
    source.emit({ ...itemEvent(''), type: 'reset' })
    accepted.resolve({ namespace: 'home', messages: [{ ...pending, id: 'stale' }], turn: turnEvent('inProgress').turn })
    await sending
    expect(page.core.historyHub.messages.value).toHaveLength(0)
    expect(page.core.running.value).toBe(false)
    page.scope.stop()
})

test.each(['create', 'send'] as const)('late %s acceptance after disposal creates no directory timer', async phase => {
    vi.useFakeTimers()
    /** 创建与已有线程提交分别停在对应的异步请求上。 */
    const page = setupCore(phase === 'create' ? '' : 'thread')
    await Promise.resolve()
    /** 迟到的请求只由测试手动完成。 */
    const accepted = deferred<object>()
    page.fetch.mockImplementationOnce(() => accepted.promise)
    page.core.draft.value = 'first'
    /** 等待预检完成，确保请求已进入目标异步阶段。 */
    const sending = page.core.send()
    await Promise.resolve()
    expect(page.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true)
    page.scope.stop()
    expect(vi.getTimerCount()).toBe(0)
    accepted.resolve(phase === 'create' ? { id: 'created', title: 'created' } : snapshot())
    await sending
    expect(vi.getTimerCount()).toBe(0)
    vi.runAllTimers()
    expect(page.onCatalogChanged).not.toHaveBeenCalled()
    expect(page.threadId.value).toBe(phase === 'create' ? '' : 'thread')
})

test('empty session selections preserve draft without creating a thread until sending', async () => {
    /** 初始空上下文内的草稿由 Core 独占。 */
    const page = setupCore('', true, true)
    page.context.value = { chatId: '', projectPath: '' }
    page.core.draft.value = 'typed before selection'
    page.context.value = { chatId: 'selected', projectPath: '/active' }
    expect(page.core.draft.value).toBe('typed before selection')
    expect(page.fetch).not.toHaveBeenCalled()
    page.fetch.mockResolvedValueOnce({ id: 'created', title: 'created' })
    await page.core.send()
    expect(page.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2)
    page.scope.stop()
})

test.each([true, false])('existing conversation navigation clears the draft with session key %s', withKey => {
    /** 已有线程切换不沿用未提交草稿。 */
    const page = setupCore('thread', true, withKey)
    page.core.draft.value = 'old'
    page.threadId.value = 'next'
    expect(page.core.draft.value).toBe('')
    page.scope.stop()
})

test('legacy empty session context changes still clear draft', () => {
    /** 未启用新建生命周期的调用保留旧契约。 */
    const page = setupCore('')
    page.core.draft.value = 'old'
    page.context.value = { chatId: 'other', projectPath: '/other' }
    expect(page.core.draft.value).toBe('')
    page.scope.stop()
})

test.each(['preflight', 'create', 'send'] as const)('explicit new session invalidates the same identity during %s', async phase => {
    /** 新建前后导航身份相同，仅草稿生命周期不同。 */
    const page = setupCore(phase === 'send' ? 'thread' : '', true, true)
    await Promise.resolve()
    /** 控制旧写意图停留的异步窗口。 */
    const waiting = deferred<boolean | object>()
    if (phase === 'preflight') page.requireRunning.mockImplementationOnce(async () => Boolean(await waiting.promise))
    else page.fetch.mockImplementationOnce(() => waiting.promise)
    page.core.draft.value = 'old message'
    /** 旧请求开始后显式新建应立即清理输入并使请求失效。 */
    const sending = page.core.send()
    await Promise.resolve()
    page.core.draft.value = 'old continuing input'
    page.draftSessionKey.value++
    expect(page.core.draft.value).toBe('')
    page.core.draft.value = 'new draft'
    waiting.resolve(phase === 'preflight' ? true : phase === 'create' ? { id: 'created', title: 'created' } : { ...snapshot(), messages: [{ ...itemEvent('stale').item }] })
    await sending
    expect(page.threadId.value).toBe(phase === 'send' ? 'thread' : '')
    expect(page.core.draft.value).toBe('new draft')
    expect(page.core.historyHub.messages.value).toHaveLength(0)
    expect(page.core.submitting.value).toBe(false)
    expect(page.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(phase === 'preflight' ? 0 : 1)
    page.scope.stop()
})

test.each(['before', 'during'] as const)('inactive binding blocks writes %s service preflight', async phase => {
    /** 发送资格可能在预检等待中失效，但身份保持不变。 */
    const page = setupCore('', true, true)
    /** 手动完成服务预检。 */
    const waiting = deferred<boolean>()
    page.requireRunning.mockImplementationOnce(() => waiting.promise)
    page.core.draft.value = 'message'
    if (phase === 'before') page.canCompose.value = false
    /** 等待中的旧写意图不能越过 active 资格检查。 */
    const sending = page.core.send()
    page.canCompose.value = false
    waiting.resolve(true)
    await sending
    expect(page.fetch).not.toHaveBeenCalled()
    expect(page.core.draft.value).toBe('message')
    page.scope.stop()
})

test.each(['preflight', 'create'] as const)('context selection during %s preserves unsubmitted input and invalidates old send', async phase => {
    /** 同一个空草稿内改选上下文不代表显式新建。 */
    const page = setupCore('', true, true)
    /** 冻结当前发送所处的异步窗口。 */
    const waiting = deferred<boolean | object>()
    if (phase === 'preflight') page.requireRunning.mockImplementationOnce(async () => Boolean(await waiting.promise))
    else page.fetch.mockImplementationOnce(() => waiting.promise)
    page.core.draft.value = 'unsubmitted message'
    /** 发送快照等待期间，输入仍由同一个草稿 owner 持有。 */
    const sending = page.core.send()
    await Promise.resolve()
    expect(page.core.draft.value).toBe('unsubmitted message')
    page.context.value = { chatId: 'second', projectPath: '/second' }
    page.context.value = { chatId: 'third', projectPath: '/third' }
    expect(page.core.draft.value).toBe('unsubmitted message')
    waiting.resolve(phase === 'preflight' ? true : { id: 'stale-created', title: 'stale-created' })
    await sending
    expect(page.core.draft.value).toBe('unsubmitted message')
    expect(page.threadId.value).toBe('')
    expect(page.fetch.mock.calls.some(([url]) => url.endsWith('/turn'))).toBe(false)
    expect(page.core.submitting.value).toBe(false)
    page.scope.stop()
})

test('rapid context selections followed by explicit new session never revive unsubmitted input', async () => {
    /** 原草稿预检未完成时进行连续选择并显式新建。 */
    const page = setupCore('', true, true)
    /** 旧预检由测试完成，禁止触发实际写请求。 */
    const waiting = deferred<boolean>()
    page.requireRunning.mockImplementationOnce(() => waiting.promise)
    page.core.draft.value = 'old input'
    /** 旧发送意图随生命周期变化失效。 */
    const sending = page.core.send()
    page.context.value = { chatId: 'second', projectPath: '/second' }
    page.draftSessionKey.value++
    page.context.value = { chatId: 'third', projectPath: '/third' }
    expect(page.core.draft.value).toBe('')
    waiting.resolve(true)
    await sending
    expect(page.core.draft.value).toBe('')
    expect(page.fetch).not.toHaveBeenCalled()
    page.scope.stop()
})

test.each(['preflight', 'create'] as const)('edits during %s survive turn submission and its failure', async phase => {
    /** 等待时继续编辑的输入不能被旧发送快照消费或回滚覆盖。 */
    const page = setupCore('', true, true)
    /** 控制消息提交之前的等待窗口。 */
    const waiting = deferred<boolean | object>()
    if (phase === 'preflight') {
        page.requireRunning.mockImplementationOnce(async () => Boolean(await waiting.promise))
        page.fetch.mockResolvedValueOnce({ id: 'created', title: 'created' })
    }
    else page.fetch.mockImplementationOnce(() => waiting.promise)
    page.core.draft.value = 'first'
    /** 冻结 first 发送意图后继续输入下一条。 */
    const sending = page.core.send()
    await Promise.resolve()
    page.core.draft.value = 'continuing input'
    page.fetch.mockImplementation(async (url: string) => {
        if (url.endsWith('/turn')) throw new Error('rejected')
        return snapshot('created')
    })
    waiting.resolve(phase === 'preflight' ? true : { id: 'created', title: 'created' })
    await sending
    expect(page.threadId.value).toBe('created')
    expect(page.core.draft.value).toBe('continuing input')
    expect(page.fetch.mock.calls.find(([url]) => url.endsWith('/turn'))?.[1]?.body.prompt).toBe('first')
    expect(page.error).toHaveBeenCalledOnce()
    page.scope.stop()
})
