import type { BridgeConversationEvent, BridgeConversationItem, BridgeConversationSnapshot, BridgeConversationTurn } from '@askx/module-feishu-bridge/conversation-contract'

/** 前端会话的唯一消息写入 owner，协议解析仍由模块负责。 */
export class BridgeConversationState {
    /** 当前线程身份。 */
    readonly threadId: string
    /** 当前 Codex Home 命名空间。 */
    namespace = ''
    /** 有序消息快照。 */
    messages: BridgeConversationItem[] = []
    /** 最新执行轮次。 */
    turn: BridgeConversationTurn | null = null
    /** 已消费事件的流内位置。 */
    private sequences = new Map<string, number>()
    /** 全局本地提交版本，保护历史加载期间到达的新消息。 */
    private revision = 0
    /** 每个消息最后被实时更新的本地版本。 */
    private touched = new Map<string, number>()
    constructor(threadId: string) { this.threadId = threadId }
    /** 捕获历史请求开始位置。 */
    checkpoint(): number { return this.revision }
    /** 合并历史快照，旧请求不能覆盖期间收到的实时内容。 */
    mergeSnapshot(snapshot: BridgeConversationSnapshot, since: number): void {
        if (this.namespace && snapshot.namespace !== this.namespace) return
        this.namespace = snapshot.namespace
        const previous = new Map(this.messages.map(item => [item.id, item]))
        const result: BridgeConversationItem[] = []
        for (const item of snapshot.messages) {
            const live = previous.get(item.id)
            result.push(live && (this.touched.get(item.id) ?? 0) > since ? { ...item, ...live } : { ...live, ...item })
            previous.delete(item.id)
        }
        this.messages = [...result, ...previous.values()]
        this.removeConfirmedPlaceholders()
        if (snapshot.turn && (!this.turn || snapshot.turn.runId > this.turn.runId || (snapshot.turn.runId === this.turn.runId && this.revision === since))) this.turn = snapshot.turn
    }

    /** 加入一次待确认的发送，后续按 clientMessageId 原位替换。 */
    addPending(item: BridgeConversationItem): void { this.upsert(item) }
    /** 仅标记对应本地发送，不修改已经由服务端确认的消息。 */
    failPending(clientMessageId: string): void {
        this.messages = this.messages.map(item => item.id === `client-${clientMessageId}` ? { ...item, status: 'failed' } : item)
    }

    /** 同一执行流只接受递增序号，历史终态不被回放的旧增量降级。 */
    apply(event: BridgeConversationEvent): void {
        if (event.threadId !== this.threadId || event.version !== 1) return
        if (this.namespace && this.namespace !== event.namespace) return
        this.namespace = event.namespace
        if (event.sequence <= (this.sequences.get(event.runId) ?? 0)) return
        this.sequences.set(event.runId, event.sequence)
        this.revision++
        if (event.type === 'item.upsert') {
            const previous = this.messages.find(item => item.id === event.item.id)
            if (previous?.status !== 'inProgress' && previous && event.item.status === 'inProgress') return
            this.upsert(event.item)
        }
        if (event.type === 'turn.status' && (!this.turn || event.runId >= this.turn.runId)) {
            if (this.turn?.runId === event.runId && this.turn.status !== 'inProgress' && event.turn.status === 'inProgress') return
            this.turn = event.turn
            if (event.turn.status !== 'inProgress') this.messages = this.messages.map(item => {
                if (item.turnId !== event.turn.id || item.status !== 'inProgress') return item
                this.touched.set(item.id, this.revision)
                return { ...item, status: event.turn.status }
            })
        }
    }

    /** 同一客户端消息确认后保留服务端身份及其稳定位置。 */
    private upsert(item: BridgeConversationItem): void {
        const index = this.messages.findIndex(previous => previous.id === item.id || Boolean(item.clientMessageId && previous.clientMessageId === item.clientMessageId))
        this.messages = index < 0
            ? [...this.messages, item]
            : this.messages.map((previous, position) => position === index ? { ...previous, ...item } : previous)
        this.revision++
        this.touched.set(item.id, this.revision)
    }

    /** 快照与实时交叉到达时删除已经确认的本地占位。 */
    private removeConfirmedPlaceholders(): void {
        const confirmed = new Set(this.messages.filter(item => !item.id.startsWith('client-')).map(item => item.clientMessageId).filter(Boolean))
        this.messages = this.messages.filter(item => !item.id.startsWith('client-') || !confirmed.has(item.clientMessageId))
    }
}
