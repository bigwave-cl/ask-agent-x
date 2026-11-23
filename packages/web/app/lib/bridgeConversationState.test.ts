import { expect, test } from 'vitest'
import type { BridgeConversationEvent, BridgeConversationItem } from '@askx/module-feishu-bridge/conversation-contract'
import { BridgeConversationState } from './bridgeConversationState'

/** 测试用标准消息。 */
const message: BridgeConversationItem = { id: 'a', turnId: 'turn', role: 'assistant', kind: 'message', content: 'old', status: 'inProgress', createdAt: null }
/** 同一执行流的完整 item 快照。 */
function event(sequence: number, item: BridgeConversationItem): BridgeConversationEvent { return { version: 1, namespace: 'home', threadId: 'thread', runId: 'run', sequence, createdAt: '2026-01-01T00:00:00Z', type: 'item.upsert', item } }

test('history requests cannot overwrite intervening live content', () => {
    const state = new BridgeConversationState('thread')
    const checkpoint = state.checkpoint()
    state.apply(event(1, { ...message, content: 'new' }))
    state.mergeSnapshot({ namespace: 'home', messages: [message], turn: null }, checkpoint)
    expect(state.messages[0]?.content).toBe('new')
    state.apply(event(1, message))
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]?.content).toBe('new')
})

test('incremental items publish new snapshots so shallow Vue consumers render each update', () => {
    const state = new BridgeConversationState('thread')
    const empty = state.messages
    state.apply(event(1, message))
    const first = state.messages
    state.apply(event(2, { ...message, content: 'streamed' }))
    expect(first).not.toBe(empty)
    expect(state.messages).not.toBe(first)
    expect(first[0]?.content).toBe('old')
    expect(state.messages[0]?.content).toBe('streamed')
})

test('terminal items reject replayed older deltas and other namespaces', () => {
    const state = new BridgeConversationState('thread')
    state.mergeSnapshot({ namespace: 'home', messages: [{ ...message, status: 'completed', content: 'final' }], turn: null }, 0)
    state.apply(event(2, message))
    state.apply({ ...event(3, { ...message, content: 'wrong' }), namespace: 'other' })
    expect(state.messages[0]?.content).toBe('final')
})

test('stable client identity replaces a pending message without merging identical text', () => {
    const state = new BridgeConversationState('thread')
    state.addPending({ ...message, id: 'client-first', role: 'user', clientMessageId: 'first', content: 'hello' })
    state.apply(event(1, { ...message, id: 'server-first', role: 'user', clientMessageId: 'first', content: 'hello' }))
    state.apply(event(2, { ...message, id: 'server-second', role: 'user', clientMessageId: 'second', content: 'hello' }))
    expect(state.messages.map(item => item.id)).toEqual(['server-first', 'server-second'])
})

test('terminal turn protects item status from an earlier history request', () => {
    const state = new BridgeConversationState('thread')
    state.apply(event(1, message))
    const checkpoint = state.checkpoint()
    state.apply({ ...event(2, message), type: 'turn.status', turn: { id: 'turn', runId: 'run', channel: 'web', status: 'completed', updatedAt: '2026-01-01T00:00:00Z' } })
    state.mergeSnapshot({ namespace: 'home', messages: [message], turn: null }, checkpoint)
    expect(state.messages[0]?.status).toBe('completed')
})
