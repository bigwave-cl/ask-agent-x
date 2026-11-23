import { z } from 'zod'
import type { BridgeConversationEvent } from '@askx/module-feishu-bridge/conversation-contract'
import { bridgeThreadSessionManager } from '../../utils/bridge.js'

/** 游标只用于事件续传，不包含认证资料。 */
const cursorSchema = z.object({ namespace: z.string(), runs: z.record(z.number().int().nonnegative()) })
/** 订阅仅接受有限长度的线程标识。 */
const querySchema = z.object({ threadId: z.string().min(1).max(256).optional() })

/** 已认证的跨进程事件流，文件通知为主，低频校准处理遗漏通知。 */
export default defineEventHandler(async event => {
    const { threadId } = querySchema.parse(getQuery(event))
    let store = await bridgeThreadSessionManager.getConversationStore()
    const stream = createEventStream(event)
    let cursor: z.infer<typeof cursorSchema> = { namespace: store.namespace, runs: {} }
    let needsReset = false
    const previous = getHeader(event, 'last-event-id')
    if (previous) {
        try {
            if (previous.length > 32768) throw new Error('Invalid cursor')
            cursor = cursorSchema.parse(JSON.parse(Buffer.from(previous, 'base64url').toString('utf8')))
            if (cursor.namespace !== store.namespace) throw new Error('Different namespace')
        }
        catch { cursor = { namespace: store.namespace, runs: {} }; needsReset = true }
    }
    let closed = false
    let pending = false
    let dirty = false
    let debounce: ReturnType<typeof setTimeout> | undefined
    /** 每次提交携带当前各执行流的位置，重连无需依赖服务端内存。 */
    const push = async (entry: BridgeConversationEvent) => {
        if (closed) return
        await stream.push({ id: Buffer.from(JSON.stringify(cursor)).toString('base64url'), data: JSON.stringify(entry) })
    }
    /** 合并文件通知，保证同一连接不会并行写入或重复提交。 */
    const flush = async () => {
        if (closed) return
        if (pending) { dirty = true; return }
        pending = true
        try {
            const current = await bridgeThreadSessionManager.getConversationStore()
            if (current.namespace !== store.namespace) {
                unsubscribe(); store = current; unsubscribe = store.subscribe(schedule)
                cursor = { namespace: store.namespace, runs: {} }; needsReset = true
            }
            const events = store.events(threadId)
            const first = new Map<string, number>()
            for (const entry of events) {
                if (!first.has(entry.runId)) first.set(entry.runId, entry.sequence)
            }
            for (const [runId, sequence] of Object.entries(cursor.runs)) {
                if (!first.has(runId)) { Reflect.deleteProperty(cursor.runs, runId); needsReset = true }
                else if (sequence < first.get(runId)! - 1) needsReset = true
            }
            if (needsReset) {
                needsReset = false
                await push({ version: 1, namespace: store.namespace, threadId: threadId ?? '', runId: 'reset', sequence: 0, createdAt: new Date().toISOString(), type: 'reset' })
            }
            for (const entry of events) {
                if (closed || entry.sequence <= (cursor.runs[entry.runId] ?? 0)) continue
                cursor.runs[entry.runId] = entry.sequence
                if (entry.type === 'turn.status') {
                    const canInterrupt = entry.turn.status === 'inProgress' && await bridgeThreadSessionManager.isTurnActive(entry.threadId)
                    await push({ ...entry, turn: { ...entry.turn, canInterrupt } })
                }
                else await push(entry)
            }
        }
        catch { if (!closed) await stream.close() }
        finally {
            pending = false
            if (dirty && !closed) { dirty = false; schedule() }
        }
    }
    /** 事件写入已合并为 60ms，本层只合并同次 rename 的多次通知。 */
    function schedule() {
        if (!closed && !debounce) debounce = setTimeout(() => { debounce = undefined; void flush() }, 20)
    }
    let unsubscribe = store.subscribe(schedule)
    const timer = setInterval(schedule, 1000)
    const heartbeat = setInterval(() => { if (!closed) void stream.push({ event: 'heartbeat', data: '' }).catch(() => stream.close()) }, 15000)
    stream.onClosed(() => { closed = true; unsubscribe(); clearInterval(timer); clearInterval(heartbeat); if (debounce) clearTimeout(debounce) })
    // 即使当前没有会话事件，也立即提交响应，让客户端结束连接中状态。
    void stream.push({ event: 'heartbeat', data: '' }).catch(() => stream.close())
    schedule()
    return stream.send()
})
