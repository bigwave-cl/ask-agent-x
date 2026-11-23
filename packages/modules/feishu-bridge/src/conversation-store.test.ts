import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { BridgeConversationStore } from './conversation-store.js'
import { normalizeConversationItem, normalizeLegacyContent } from './conversation-normalizer.js'

test('separate store readers recover accumulated text and protect terminal state', () => {
  const home = mkdtempSync(join(tmpdir(), 'askx-events-'))
  try {
    const writer = new BridgeConversationStore(home)
    const run = writer.begin('thread', { channel: 'web' }, 'message', 'hello')
    run.ingest('item/agentMessage/delta', { threadId: 'thread', turnId: 'turn', itemId: 'agent', delta: 'Hi' })
    run.ingest('item/agentMessage/delta', { threadId: 'thread', turnId: 'turn', itemId: 'agent', delta: ' there' })
    run.ingest('turn/completed', { threadId: 'thread', turn: { id: 'turn', status: 'completed' } })
    run.ingest('item/agentMessage/delta', { itemId: 'agent', delta: 'late' })
    const snapshot = new BridgeConversationStore(home).read('thread')
    expect(snapshot.messages.find(item => item.id === 'agent')?.content).toBe('Hi there')
    expect(snapshot.turn?.status).toBe('completed')
    expect(new BridgeConversationStore(join(home, 'other')).read('thread').messages).toEqual([])
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('reasoning normalization excludes hidden content and strips legacy source once', () => {
  expect(normalizeConversationItem({ id: 'r', type: 'reasoning', content: 'hidden', summary: ['public'] })?.content).toBe('public')
  expect(normalizeLegacyContent('[本轮来源 / Turn source: Feishu group a; message m; sender b; project /tmp. Reply only to this source.]\nhello')).toBe('hello')
})

test('bounded replay preserves the full snapshot and durable per-message source', () => {
  const home = mkdtempSync(join(tmpdir(), 'askx-events-'))
  try {
    const store = new BridgeConversationStore(home)
    const run = store.begin('thread', { channel: 'feishu', senderId: 'alice' }, 'client-a', 'same')
    run.ingest('turn/started', { threadId: 'thread', turn: { id: 'turn' } })
    run.ingest('item/completed', { threadId: 'thread', turnId: 'turn', item: { id: 'user-a', type: 'userMessage', content: [{ text: 'same' }] } })
    for (let index = 0; index < 150; index++) run.ingest('item/agentMessage/delta', { threadId: 'thread', turnId: 'turn', itemId: 'answer', delta: 'a' })
    run.ingest('turn/completed', { threadId: 'thread', turn: { id: 'turn', status: 'completed' } })
    expect(store.events('thread').length).toBeLessThanOrEqual(128)
    expect(store.read('thread').messages.find(item => item.id === 'user-a')?.source?.senderId).toBe('alice')
    const history = [
      { id: 'user-a', role: 'user' as const, kind: 'message' as const, content: 'same', turnId: 'turn', createdAt: null, status: 'completed' as const, clientMessageId: 'client-a' },
      { id: 'other-user', role: 'user' as const, kind: 'message' as const, content: 'same', turnId: 'other', createdAt: null, status: 'completed' as const },
    ]
    const merged = store.mergeHistory('thread', history)
    expect(merged.messages.filter(item => item.role === 'user')).toHaveLength(2)
    expect(merged.messages.find(item => item.id === 'other-user')?.source).toBeUndefined()
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('process errors terminate plans while retriable errors keep execution active', () => {
  const home = mkdtempSync(join(tmpdir(), 'askx-events-'))
  try {
    const store = new BridgeConversationStore(home)
    const run = store.begin('thread', { channel: 'web' }, 'c', 'test')
    run.ingest('turn/started', { threadId: 'thread', turn: { id: 'turn' } })
    run.ingest('turn/plan/updated', { threadId: 'thread', turnId: 'turn', plan: [{ step: 'check', status: 'inProgress' }] })
    run.ingest('error', { threadId: 'thread', turnId: 'turn', willRetry: true })
    run.flush()
    expect(store.read('thread').turn?.status).toBe('inProgress')
    run.ingest('error', { threadId: 'thread', turnId: 'turn', willRetry: false })
    expect(store.read('thread').turn?.status).toBe('failed')
    expect(store.read('thread').messages.find(item => item.kind === 'plan')?.status).toBe('failed')
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('legacy parsing leaves lookalikes and assistant text untouched', () => {
  const content = '[本轮来源 / Turn source: Feishu group a; sender b.]\nhello'
  expect(normalizeLegacyContent(content)).toBe(content)
  const exact = '[本轮来源 / Turn source: Feishu group a; message m; sender b; project /tmp. Reply only to this source.]\nhello'
  expect(normalizeConversationItem({ id: 'a', type: 'agentMessage', text: exact })?.content).toBe(exact)
  expect(normalizeConversationItem({ id: 'u', type: 'userMessage', clientId: 'client', content: [{ text: exact }] })).toMatchObject({ content: 'hello', clientMessageId: 'client', source: { senderId: 'b' } })
})

test('another process can publish events and its unexpected exit terminates the snapshot', () => {
  const home = mkdtempSync(join(tmpdir(), 'askx-events-process-'))
  try {
    // 用独立 Node 进程验证持久化边界，绝不连接 Codex 或使用真实配置。
    execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { BridgeConversationStore } = await import(process.argv[1]);
      const run = new BridgeConversationStore(process.argv[2]).begin('thread', { channel: 'feishu' }, 'client', 'hello');
      run.ingest('turn/started', { threadId: 'thread', turn: { id: 'turn' } });
      run.ingest('item/agentMessage/delta', { threadId: 'thread', turnId: 'turn', itemId: 'answer', delta: 'received across processes' });
      run.flush();
    `, new URL('../dist/conversation-store.js', import.meta.url).href, home])
    const reader = new BridgeConversationStore(home)
    expect(reader.read('thread').messages.find(item => item.id === 'answer')?.content).toBe('received across processes')
    expect(reader.read('thread').turn?.status).toBe('failed')
    expect(reader.events('thread').at(-1)).toMatchObject({ type: 'turn.status', turn: { status: 'failed', canInterrupt: false } })
  } finally { rmSync(home, { recursive: true, force: true }) }
})
