import { computed, inject, onScopeDispose, provide, ref, watch } from 'vue'
import type { BridgeConversationEvent, BridgeConversationSnapshot } from '@askx/module-feishu-bridge/conversation-contract'
import type { BridgeConversationState } from './bridgeConversationState'
import { useHistoryHub } from './hubs/useHistoryHub'
import type { BridgeAgentCore, BridgeAgentOptions } from './types'
import { bridgeAgentCoreKey } from './types'

/** 负责历史、实时订阅与提交生命周期；组件只消费公开状态。 */
export function useAgentCore(options: BridgeAgentOptions): BridgeAgentCore {
    /** 双语反馈及统一 Toast。 */
    const { t } = useI18n()
    const toast = useToast()
    /** 当前会话唯一状态实例。 */
    const historyHub = useHistoryHub({ navigation: options, showError })
    /** 当前输入草稿。 */
    const draft = ref('')
    /** 请求提交与执行状态分开。 */
    const submitting = ref(false)
    /** 当前传输连接状态。 */
    const connection = ref<'connecting' | 'connected' | 'reconnecting'>('connecting')
    /** 当前轮次只消费历史 owner 的结果。 */
    const turn = historyHub.history.turn
    /** 是否处于执行中。 */
    const running = computed(() => turn.value?.status === 'inProgress')
    /** 当前执行是否支持中断。 */
    const canStop = computed(() => Boolean(running.value && turn.value?.canInterrupt))
    /** 导航生命周期与发送请求各自编号，避免新建线程互相取消。 */
    let generation = 0
    /** 当前提交请求的身份。 */
    let submission = 0
    /** Core 页面生命周期是否结束。 */
    let disposed = false
    /** 页面唯一实时订阅。 */
    let source: EventSource | undefined
    /** 目录失效合并计时器。 */
    let catalogTimer: ReturnType<typeof setTimeout> | undefined
    /** 本次创建导致的线程切换应保留用户继续输入的草稿。 */
    let adopting = false
    /** 错误只通过 Toast 展示。 */
    function showError(error: unknown) {
        /** 仅采用可公开的服务端错误说明。 */
        const value = error as { data?: { statusMessage?: string }, message?: string }
        toast.error(value.data?.statusMessage || t('bridge.loadError'))
    }
    /** 合并目录事件，密集 item 事件不会导致目录重载。 */
    function invalidateCatalog() {
        if (disposed) return
        if (!catalogTimer) catalogTimer = setTimeout(() => { catalogTimer = undefined; if (!disposed) options.onCatalogChanged() }, 150)
    }
    /** 一条页面连接同时消费目录失效与当前线程详情。 */
    function connect() {
        source?.close()
        if (disposed || typeof window === 'undefined') return
        /** 捕获当前导航生命周期。 */
        const current = generation
        connection.value = 'connecting'
        source = new EventSource(`/api/bridge/events${options.threadId.value ? `?threadId=${encodeURIComponent(options.threadId.value)}` : ''}`)
        source.onopen = () => { if (current === generation) connection.value = 'connected' }
        source.onerror = () => { if (current === generation) connection.value = 'reconnecting' }
        source.onmessage = message => {
            if (disposed || current !== generation) return
            try {
                /** 事件只接受标准版本契约。 */
                const event = JSON.parse(message.data) as BridgeConversationEvent
                if (event.version !== 1) return
                if (event.type === 'catalog.changed') { invalidateCatalog(); return }
                if (event.type === 'thread.title') { options.onTitle(event.threadId, event.title); return }
                if (event.type === 'reset' || (historyHub.captureOwner().namespace && historyHub.captureOwner().namespace !== event.namespace)) {
                    historyHub.reset()
                    invalidateCatalog()
                    void historyHub.history.loadHistory()
                    return
                }
                historyHub.apply(event)
                if (event.type === 'turn.status' && event.threadId === options.threadId.value && event.turn.status === 'failed') toast.error(event.turn.error || t('bridge.conversation.failed'), { id: `bridge-turn-${event.runId}` })
            }
            catch { toast.error(t('bridge.conversation.streamError'), { id: 'bridge-stream' }) }
        }
    }
    /** 身份变化使旧请求失效；未提交会话内的上下文选择保留输入。 */
    watch([options.threadId, () => options.context.value.chatId, () => options.context.value.projectPath, () => options.draftSessionKey?.value], ([threadId, , , key], previous) => {
        /** 只有同一个未提交草稿内选择上下文才保留内容。 */
        const preserveDraft = options.draftSessionKey !== undefined && !threadId && !previous[0] && key === previous[3]
        generation++
        historyHub.reset()
        if (!adopting) {
            if (!preserveDraft) draft.value = ''
            submission++
            submitting.value = false
        }
        connect()
        void historyHub.history.loadHistory()
    }, { immediate: true, flush: 'sync' })
    /** 提交一次消息；HTTP 接受后保留服务端执行状态。 */
    async function send() {
        if (submitting.value || running.value || !draft.value.trim() || !options.canCompose.value) return
        /** 固定本轮发送的群组与项目上下文。 */
        const context = { ...options.context.value }
        /** 原始输入只用于提交时消费匹配的草稿，不覆盖等待期间的编辑。 */
        const draftSnapshot = draft.value
        /** 冻结本次发送内容，后续草稿可继续编辑。 */
        const content = draftSnapshot.trim()
        /** 只有真正消费过草稿的失败请求才需要恢复输入。 */
        let consumedDraft = false
        /** 本次提交的失效检查身份。 */
        const request = ++submission
        /** 创建线程前的导航生命周期。 */
        const beforeCreate = generation
        /** 本地占位和服务端确认共用的稳定身份。 */
        const clientMessageId = crypto.randomUUID()
        submitting.value = true
        /** 新建会话后更新为服务端确认的线程标识。 */
        let threadId = options.threadId.value
        /** 本次消息提交绑定的 owner，新线程接纳后重新捕获。 */
        let owner: BridgeConversationState = historyHub.captureOwner()
        try {
            if (!await options.requireRunning() || !options.canCompose.value || disposed || beforeCreate !== generation || !historyHub.isCurrent(owner)) return
            if (!threadId) {
                /** 服务端接受的新线程摘要。 */
                const created = await $fetch<{ id: string, title: string }>('/api/bridge/threads', { method: 'POST', body: context, retry: 0 })
                if (disposed || beforeCreate !== generation || !historyHub.isCurrent(owner)) { invalidateCatalog(); return }
                threadId = created.id
                adopting = true
                try { options.onCreated(created) }
                finally { adopting = false }
            }
            /** 到消息实际提交时才消费原草稿；预检或建线程期间可安全改选上下文。 */
            if (draft.value === draftSnapshot) {
                draft.value = ''
                consumedDraft = true
            }
            owner = historyHub.captureOwner()
            historyHub.addPending(owner, { id: `client-${clientMessageId}`, clientMessageId, turnId: null, role: 'user', kind: 'message', content, status: 'inProgress', createdAt: new Date().toISOString(), source: { channel: 'web', senderName: 'Web', ...context } })
            /** 保留 HTTP 等待期间到达的实时更新。 */
            const checkpoint = owner.checkpoint()
            /** 执行请求接受后的标准快照。 */
            const accepted = await $fetch<BridgeConversationSnapshot>(`/api/bridge/threads/${encodeURIComponent(threadId)}/turn`, { method: 'POST', body: { ...context, prompt: content, clientMessageId }, retry: 0 })
            historyHub.mergeAccepted(owner, accepted, checkpoint)
            invalidateCatalog()
        }
        catch (error) {
            if (!disposed && request === submission && options.threadId.value === threadId && historyHub.isCurrent(owner)) {
                historyHub.failPending(owner, clientMessageId)
                if (consumedDraft && !draft.value) draft.value = content
                showError(error)
            }
        }
        finally { if (request === submission && !disposed) submitting.value = false }
    }
    /** 中断只交给当前 Web 执行 owner，终态由事件确认。 */
    async function interrupt() {
        if (!canStop.value) return
        /** 捕获当前导航生命周期。 */
        const current = generation
        /** 本次停止请求绑定的线程身份。 */
        const threadId = options.threadId.value
        /** 停止预检完成后必须仍属于同一执行 owner。 */
        const owner = historyHub.captureOwner()
        try {
            if (!await options.requireRunning() || disposed || current !== generation || !historyHub.isCurrent(owner)) return
            await $fetch(`/api/bridge/threads/${encodeURIComponent(threadId)}/interrupt`, { method: 'POST', retry: 0 })
        }
        catch (error) { if (!disposed && current === generation) showError(error) }
    }
    onScopeDispose(() => { disposed = true; generation++; submission++; source?.close(); historyHub.dispose(); if (catalogTimer) clearTimeout(catalogTimer) })
    return { threadId: options.threadId, historyHub: historyHub.history, draft, submitting: computed(() => submitting.value), running, canStop, canCompose: options.canCompose, connection: computed(() => connection.value), send, interrupt }
}

/** 提供当前页面唯一 Agent Core。 */
export function provideAgentCore(core: BridgeAgentCore) {
    provide(bridgeAgentCoreKey, core)
    return core
}
/** 获取当前页面注入的 Agent Core。 */
export function useProvidedAgentCore(): BridgeAgentCore {
    /** 注入仅在当前组件树生命周期内有效。 */
    const core = inject(bridgeAgentCoreKey)
    if (!core) throw new Error('BridgeAgentCore is not provided')
    return core
}
