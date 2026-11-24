import { computed, ref, shallowRef } from 'vue'
import type { BridgeConversationEvent, BridgeConversationItem, BridgeConversationSnapshot } from '@askx/module-feishu-bridge/conversation-contract'
import { BridgeConversationState } from '../bridgeConversationState'
import type { BridgeAgentHistory, BridgeAgentOptions } from '../types'

/** 历史响应补充目录标题和分页位置。 */
interface HistoryResponse extends BridgeConversationSnapshot {
    /** 已确认的会话摘要。 */
    thread: { id: string, title: string }
    /** 更早历史的位置。 */
    nextCursor: string | null
}

/** 历史 Hub 接收导航身份与统一错误出口。 */
interface HistoryOptions {
    /** 导航与目录回调。 */
    navigation: BridgeAgentOptions
    /** 向用户展示当前有效请求的失败。 */
    showError: (error: unknown) => void
}

/** 持有唯一消息状态、快照合并与历史请求；内部写入口仅交给 Core。 */
export function useHistoryHub(options: HistoryOptions) {
    /** 当前导航的唯一消息状态。 */
    const state = shallowRef(new BridgeConversationState(options.navigation.threadId.value))
    /** 让只读投影跟随内部状态提交更新。 */
    const revision = ref(0)
    /** 首屏历史请求状态。 */
    const loading = ref(false)
    /** 更早历史请求状态。 */
    const loadingMore = ref(false)
    /** 当前分页游标。 */
    const nextCursor = ref<string | null>(null)
    /** 历史提交序号，防止较早请求覆盖新结果。 */
    let historyVersion = 0
    /** 当前历史请求的取消控制器。 */
    let controller: AbortController | undefined
    /** Hub 生命周期是否已结束。 */
    let disposed = false

    /** 只向组件公开历史消费能力。 */
    const history: BridgeAgentHistory = {
        messages: computed(() => { void revision.value; return state.value.messages }),
        turn: computed(() => { void revision.value; return state.value.turn }),
        loading: computed(() => loading.value),
        loadingMore: computed(() => loadingMore.value),
        nextCursor: computed(() => nextCursor.value),
        loadHistory,
    }

    /** 捕获本次事务的唯一写入对象。 */
    function captureOwner() { return state.value }
    /** 校验异步事务仍属于当前页面会话。 */
    function isCurrent(owner: BridgeConversationState) { return !disposed && state.value === owner }
    /** 原子替换导航状态，并失效旧历史请求。 */
    function reset() {
        controller?.abort()
        historyVersion++
        state.value = new BridgeConversationState(options.navigation.threadId.value)
        nextCursor.value = null
        loading.value = false
        loadingMore.value = false
        revision.value++
    }
    /** 标准完整事件由唯一状态实例消费。 */
    function apply(event: BridgeConversationEvent) {
        if (disposed) return
        state.value.apply(event)
        revision.value++
    }
    /** 只有同一 owner 仍有效时才对账接受响应。 */
    function mergeAccepted(owner: BridgeConversationState, snapshot: BridgeConversationSnapshot, checkpoint: number) {
        if (!isCurrent(owner)) return
        owner.mergeSnapshot(snapshot, checkpoint)
        revision.value++
    }
    /** 提交待确认消息，不建立第二份乐观消息集合。 */
    function addPending(owner: BridgeConversationState, item: BridgeConversationItem) {
        if (!isCurrent(owner)) return
        owner.addPending(item)
        revision.value++
    }
    /** 仅失败当前 owner 中尚未确认的本地消息。 */
    function failPending(owner: BridgeConversationState, clientMessageId: string) {
        if (!isCurrent(owner)) return
        owner.failPending(clientMessageId)
        revision.value++
    }
    /** 历史加载保留请求期间到达的实时内容。 */
    async function loadHistory(older = false) {
        /** 本轮历史请求的线程身份。 */
        const threadId = options.navigation.threadId.value
        if (!threadId || disposed || (older && (!nextCursor.value || loadingMore.value))) return
        /** 本轮请求唯一允许提交的状态对象。 */
        const owner = state.value
        /** 本轮历史请求序号。 */
        const request = ++historyVersion
        /** 快照请求前的实时更新检查点。 */
        const checkpoint = owner.checkpoint()
        if (!older) { controller?.abort(); controller = new AbortController(); loading.value = true }
        else loadingMore.value = true
        /** 捕获本次请求的取消信号，避免读取下一次请求信号。 */
        const signal = controller?.signal
        try {
            /** 服务端标准消息快照与分页游标。 */
            const response = await $fetch<HistoryResponse>(`/api/bridge/threads/${encodeURIComponent(threadId)}/messages`, { query: older ? { cursor: nextCursor.value } : undefined, signal, retry: 0 })
            if (!isCurrent(owner) || request !== historyVersion) return
            owner.mergeSnapshot(response, checkpoint)
            nextCursor.value = response.nextCursor
            options.navigation.onTitle(threadId, response.thread.title)
            revision.value++
        }
        catch (error) { if (isCurrent(owner) && request === historyVersion && !signal?.aborted) options.showError(error) }
        finally { if (isCurrent(owner) && request === historyVersion) { loading.value = false; loadingMore.value = false } }
    }
    /** 释放历史请求，迟到响应不得继续提交。 */
    function dispose() { disposed = true; historyVersion++; controller?.abort() }

    return { history, captureOwner, isCurrent, reset, apply, mergeAccepted, addPending, failPending, dispose }
}
