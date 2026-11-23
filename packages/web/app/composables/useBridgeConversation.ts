import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import type { BridgeConversationEvent, BridgeConversationSnapshot } from '@askx/module-feishu-bridge/conversation-contract'
import { BridgeConversationState } from '../lib/bridgeConversationState'

/** 会话界面依赖的最小路由上下文。 */
interface ConversationContext {
    /** 群组标识。 */
    chatId: string
    /** 当前项目目录。 */
    projectPath: string
}
/** 历史接口包含标题及后续分页位置。 */
interface ConversationResponse extends BridgeConversationSnapshot {
    /** 会话摘要。 */
    thread: { id: string, title: string }
    /** 更早历史的位置。 */
    nextCursor: string | null
}
/** 使用方提供导航身份和最小回调，不持有第二份消息数据。 */
interface ConversationOptions {
    /** 当前线程。 */
    threadId: Ref<string>
    /** 当前选中的群组项目。 */
    context: Ref<ConversationContext>
    /** 是否允许本轮发送。 */
    canCompose: Ref<boolean>
    /** 执行前的服务检查。 */
    requireRunning: () => Promise<boolean>
    /** 新线程已接受，通知导航切换并加入目录。 */
    onCreated: (thread: { id: string, title: string }) => void
    /** 目录变更失效通知。 */
    onCatalogChanged: () => void
    /** 标题变更通知。 */
    onTitle: (threadId: string, title: string) => void
}

/** 负责历史、实时订阅与提交生命周期；组件只消费公开状态。 */
export function useBridgeConversation(options: ConversationOptions) {
    /** 双语反馈及统一 Toast。 */
    const { t } = useI18n()
    const toast = useToast()
    /** 当前会话唯一状态实例。 */
    const state = shallowRef(new BridgeConversationState(options.threadId.value))
    /** 触发视图读取实例内的最新消息。 */
    const revision = ref(0)
    /** 当前输入草稿。 */
    const draft = ref('')
    /** 历史请求状态。 */
    const loading = ref(false)
    const loadingMore = ref(false)
    /** 请求提交与执行状态分开。 */
    const submitting = ref(false)
    /** 当前传输连接状态。 */
    const connection = ref<'connecting' | 'connected' | 'reconnecting'>('connecting')
    /** 历史游标。 */
    const nextCursor = ref<string | null>(null)
    /** 消息及轮次只从 owner 读取。 */
    const messages = computed(() => { void revision.value; return state.value.messages })
    const turn = computed(() => { void revision.value; return state.value.turn })
    const running = computed(() => turn.value?.status === 'inProgress')
    const canStop = computed(() => Boolean(running.value && turn.value?.canInterrupt))
    /** 导航生命周期与发送请求各自编号，避免新建线程互相取消。 */
    let generation = 0
    let submission = 0
    let disposed = false
    let source: EventSource | undefined
    let controller: AbortController | undefined
    let catalogTimer: ReturnType<typeof setTimeout> | undefined
    let historyVersion = 0
    /** 本次创建导致的线程切换应保留用户继续输入的草稿。 */
    let adopting = false
    /** 错误只通过 Toast 展示。 */
    function showError(error: unknown) {
        const value = error as { data?: { statusMessage?: string }, message?: string }
        toast.error(value.data?.statusMessage || t('bridge.loadError'))
    }
    /** 合并目录事件，密集 item 事件不会导致目录重载。 */
    function invalidateCatalog() {
        if (!catalogTimer) catalogTimer = setTimeout(() => { catalogTimer = undefined; if (!disposed) options.onCatalogChanged() }, 150)
    }
    /** 加载快照前捕获 owner 版本，最终提交时保护期间到达的事件。 */
    async function loadHistory(older = false) {
        const threadId = options.threadId.value
        if (!threadId || disposed || (older && (!nextCursor.value || loadingMore.value))) return
        const current = generation
        const request = ++historyVersion
        const owner = state.value
        const checkpoint = owner.checkpoint()
        if (!older) { controller?.abort(); controller = new AbortController(); loading.value = true }
        else loadingMore.value = true
        try {
            const response = await $fetch<ConversationResponse>(`/api/bridge/threads/${encodeURIComponent(threadId)}/messages`, { query: older ? { cursor: nextCursor.value } : undefined, signal: controller?.signal, retry: 0 })
            if (disposed || current !== generation || request !== historyVersion) return
            owner.mergeSnapshot(response, checkpoint)
            nextCursor.value = response.nextCursor
            options.onTitle(threadId, response.thread.title)
            revision.value++
        }
        catch (error) { if (!disposed && current === generation && !controller?.signal.aborted) showError(error) }
        finally { if (current === generation && request === historyVersion) { loading.value = false; loadingMore.value = false } }
    }
    /** 一条页面连接同时消费目录失效与当前线程详情。 */
    function connect() {
        source?.close()
        if (disposed || !import.meta.client) return
        const current = generation
        connection.value = 'connecting'
        source = new EventSource(`/api/bridge/events${options.threadId.value ? `?threadId=${encodeURIComponent(options.threadId.value)}` : ''}`)
        source.onopen = () => { if (current === generation) connection.value = 'connected' }
        source.onerror = () => { if (current === generation) connection.value = 'reconnecting' }
        source.onmessage = message => {
            if (disposed || current !== generation) return
            try {
                const event = JSON.parse(message.data) as BridgeConversationEvent
                if (event.version !== 1) return
                if (event.type === 'catalog.changed') { invalidateCatalog(); return }
                if (event.type === 'thread.title') { options.onTitle(event.threadId, event.title); return }
                if (event.type === 'reset' || (state.value.namespace && state.value.namespace !== event.namespace)) {
                    state.value = new BridgeConversationState(options.threadId.value)
                    revision.value++
                    invalidateCatalog()
                    void loadHistory()
                    return
                }
                state.value.apply(event)
                revision.value++
                if (event.type === 'turn.status' && event.threadId === options.threadId.value && event.turn.status === 'failed') toast.error(event.turn.error || t('bridge.conversation.failed'), { id: `bridge-turn-${event.runId}` })
            }
            catch { toast.error(t('bridge.conversation.streamError'), { id: 'bridge-stream' }) }
        }
    }
    /** 每次导航释放旧订阅和请求，草稿不会在不同群组之间串用。 */
    watch([options.threadId, () => options.context.value.chatId, () => options.context.value.projectPath], () => {
        generation++
        controller?.abort()
        state.value = new BridgeConversationState(options.threadId.value)
        nextCursor.value = null
        loading.value = false
        loadingMore.value = false
        if (!adopting) { draft.value = ''; submission++; submitting.value = false }
        connect()
        void loadHistory()
    }, { immediate: true, flush: 'sync' })
    /** 提交一次消息；HTTP 接受后保留服务端执行状态。 */
    async function send() {
        if (submitting.value || running.value || !draft.value.trim() || !options.canCompose.value) return
        const context = { ...options.context.value }
        const content = draft.value.trim()
        const request = ++submission
        const beforeCreate = generation
        const clientMessageId = crypto.randomUUID()
        submitting.value = true
        draft.value = ''
        let threadId = options.threadId.value
        try {
            if (!await options.requireRunning() || disposed || beforeCreate !== generation) {
                if (!disposed && beforeCreate === generation && !draft.value) draft.value = content
                return
            }
            if (!threadId) {
                const created = await $fetch<{ id: string, title: string }>('/api/bridge/threads', { method: 'POST', body: context, retry: 0 })
                if (disposed || beforeCreate !== generation) { invalidateCatalog(); return }
                threadId = created.id
                adopting = true
                try { options.onCreated(created) }
                finally { adopting = false }
            }
            const owner = state.value
            owner.addPending({ id: `client-${clientMessageId}`, clientMessageId, turnId: null, role: 'user', kind: 'message', content, status: 'inProgress', createdAt: new Date().toISOString(), source: { channel: 'web', senderName: 'Web', ...context } })
            revision.value++
            const checkpoint = owner.checkpoint()
            const accepted = await $fetch<BridgeConversationSnapshot>(`/api/bridge/threads/${encodeURIComponent(threadId)}/turn`, { method: 'POST', body: { ...context, prompt: content, clientMessageId }, retry: 0 })
            if (!disposed && state.value === owner) { owner.mergeSnapshot(accepted, checkpoint); revision.value++ }
            invalidateCatalog()
        }
        catch (error) {
            if (!disposed && request === submission && options.threadId.value === threadId) {
                state.value.failPending(clientMessageId)
                revision.value++
                if (!draft.value) draft.value = content
                showError(error)
            }
        }
        finally { if (request === submission && !disposed) submitting.value = false }
    }
    /** 中断只交给当前 Web 执行 owner，终态由事件确认。 */
    async function interrupt() {
        if (!canStop.value) return
        const current = generation
        const threadId = options.threadId.value
        if (!await options.requireRunning() || disposed || current !== generation) return
        try { await $fetch(`/api/bridge/threads/${encodeURIComponent(threadId)}/interrupt`, { method: 'POST', retry: 0 }) }
        catch (error) { if (!disposed && current === generation) showError(error) }
    }
    onScopeDispose(() => { disposed = true; generation++; submission++; source?.close(); controller?.abort(); if (catalogTimer) clearTimeout(catalogTimer) })
    return { messages, turn, draft, loading, loadingMore, submitting, running, canStop, connection, nextCursor, loadHistory, send, interrupt }
}
