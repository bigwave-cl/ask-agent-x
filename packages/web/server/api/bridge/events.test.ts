import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { BridgeConversationStore } from '@askx/module-feishu-bridge/conversation-store'
import type { BridgeConversationEvent } from '@askx/module-feishu-bridge/conversation-contract'

/** 测试仅使用临时命名空间，绝不连接本机 Codex。 */
const manager = vi.hoisted(() => ({ getConversationStore: vi.fn(), isTurnActive: vi.fn(async () => false) }))
vi.mock('../../utils/bridge.js', () => ({ bridgeThreadSessionManager: manager }))
/** 事件管道输出与清理回调。 */
let output: { id?: string, event?: string, data: string }[] = []
let close = () => {}
let home = ''
/** 清理真实文件监听和定时器，避免影响其他测试。 */
afterEach(() => { close(); vi.unstubAllGlobals(); if (home) rmSync(home, { recursive: true, force: true }) })

/** 启动 API 编排；传输适配器替身只收集输出，存储与文件通知使用真实实现。 */
async function subscribe(previous?: string) {
    output = []
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('getQuery', () => ({ threadId: 'thread' }))
    vi.stubGlobal('getHeader', () => previous)
    vi.stubGlobal('createEventStream', () => ({
        push: async (entry: typeof output[number]) => { output.push(entry) },
        close: async () => close(),
        onClosed: (callback: () => void) => { close = callback },
        send: () => undefined,
    }))
    const { default: handler } = await import('./events.get')
    await handler({} as never)
}
/** 提取实际业务事件，忽略连接心跳。 */
function entries(): BridgeConversationEvent[] { return output.filter(entry => entry.data).map(entry => JSON.parse(entry.data) as BridgeConversationEvent) }

test('file notifications stream another writer, replay resumes, and expired cursors reset', async () => {
    home = mkdtempSync(join(tmpdir(), 'askx-sse-'))
    const reader = new BridgeConversationStore(home)
    manager.getConversationStore.mockResolvedValue(reader)
    await subscribe()
    expect(output[0]?.event).toBe('heartbeat')
    const run = new BridgeConversationStore(home).begin('thread', { channel: 'feishu' }, 'client', 'test')
    run.ingest('turn/started', { threadId: 'thread', turn: { id: 'turn' } })
    run.ingest('item/agentMessage/delta', { threadId: 'thread', turnId: 'turn', itemId: 'answer', delta: 'first' })
    run.flush()
    await expect.poll(() => entries().some(entry => entry.type === 'item.upsert' && entry.item.content === 'first')).toBe(true)
    const cursor = output.at(-1)?.id
    close()
    await subscribe(cursor)
    run.ingest('item/agentMessage/delta', { threadId: 'thread', turnId: 'turn', itemId: 'answer', delta: ' second' })
    run.flush()
    await expect.poll(() => entries().some(entry => entry.type === 'item.upsert' && entry.item.content === 'first second')).toBe(true)
    expect(entries().some(entry => entry.type === 'item.upsert' && entry.item.content === 'first')).toBe(false)
    close()
    for (let index = 0; index < 150; index++) run.ingest('item/agentMessage/delta', { threadId: 'thread', turnId: 'turn', itemId: 'answer', delta: '.' })
    run.ingest('turn/completed', { threadId: 'thread', turn: { id: 'turn', status: 'completed' } })
    await subscribe(cursor)
    await expect.poll(() => entries().some(entry => entry.type === 'reset')).toBe(true)
    expect(entries().some(entry => entry.type === 'turn.status' && entry.turn.status === 'completed')).toBe(true)
})

test('switching Codex Home resets an existing stream without mixing old records', async () => {
    home = mkdtempSync(join(tmpdir(), 'askx-sse-'))
    manager.getConversationStore.mockResolvedValue(new BridgeConversationStore(join(home, 'first')))
    await subscribe()
    const changed = new BridgeConversationStore(join(home, 'second'))
    manager.getConversationStore.mockResolvedValue(changed)
    changed.notifyCatalog('thread', 'new title')
    await expect.poll(() => entries().find(entry => entry.type === 'reset')?.namespace, { timeout: 2500 }).toBe(changed.namespace)
    expect(entries().every(entry => entry.namespace === changed.namespace)).toBe(true)
})
