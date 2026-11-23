import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { acquireBridgeThreadLock } from '@askx/core/bridge-thread-lock'
import { prepareThreadTitle, type ThreadTitleClient, type ThreadTitleOptions } from './thread-title.js'

/** 每个用例独立临时目录及协议通知，绝不连接真实会话。 */
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'askx-title-'))
  const listeners = new Set<(event: { method: string; params: Record<string, unknown> }) => void>()
  let name = ''
  let oldTurns = false
  let autoComplete = true
  const emit = (method: string, params: Record<string, unknown>) => { for (const listener of listeners) listener({ method, params }) }
  const request = vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === 'thread/read') return { thread: { id: 'target', cwd: directory, name, turns: oldTurns ? [{ id: 'old' }] : [] } }
    if (method === 'config/read') return { config: { model: 'wrong-default', mcp_servers: { filesystem: { command: 'never-run' } } } }
    if (method === 'thread/start') return { thread: { id: 'temporary' }, sandbox: { type: 'readOnly' } }
    if (method === 'turn/start') {
      if (autoComplete) setImmediate(() => {
        emit('item/completed', { threadId: 'unrelated', turnId: 'turn', item: { type: 'agentMessage', text: '{"title":"Wrong"}' } })
        emit('item/completed', { threadId: 'temporary', turnId: 'turn', item: { type: 'agentMessage', text: '{"title":"消息身份与安全命名"}' } })
        emit('turn/completed', { threadId: 'temporary', turn: { id: 'turn', status: 'completed' } })
      })
      return { turn: { id: 'turn' } }
    }
    if (method === 'thread/name/set') { name = String(params.name); return {} }
    return {}
  })
  const client: ThreadTitleClient = { request, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
  const controller = new AbortController()
  const options: ThreadTitleOptions = { metadata: { model: 'actual-model', modelProvider: 'actual-provider' }, stateDir: directory, codexHome: directory, getClient: async () => client, signal: controller.signal, isValid: async () => true, onTitle: vi.fn() }
  return { directory, client, request, options, controller, listeners, setName(value: string) { name = value }, setOld() { oldTurns = true }, disableCompletion() { autoComplete = false }, cleanup() { rmSync(directory, { recursive: true, force: true }) } }
}

test('generates structured model title in isolated tool-free ephemeral thread and verifies commit', async () => {
  const f = fixture()
  try {
    const task = await prepareThreadTitle(f.client, 'target', '原始输入与最后模型名称完全不同', f.options)
    expect(task).not.toBeNull()
    expect(await task!.completion).toBe('消息身份与安全命名')
    const start = f.request.mock.calls.find(([method]) => method === 'thread/start')![1]
    expect(start).toMatchObject({ model: 'actual-model', modelProvider: 'actual-provider', ephemeral: true, permissions: ':read-only', approvalPolicy: 'never', threadSource: 'thread_title', dynamicTools: [], environments: [], config: { 'features.shell_tool': false, 'features.unified_exec': false, 'features.apps': false, 'features.hooks': false, web_search: 'disabled', mcp_servers: { filesystem: { enabled: false } } } })
    expect(start).not.toHaveProperty('sandbox')
    expect(f.request.mock.calls.filter(([method]) => method === 'thread/read').every(([, params]) => !params.includeTurns)).toBe(true)
    expect(f.request.mock.calls.find(([method]) => method === 'turn/start')![1]).toMatchObject({ threadId: 'temporary', outputSchema: { required: ['title'], additionalProperties: false } })
    expect(f.request).toHaveBeenCalledWith('thread/unsubscribe', { threadId: 'temporary' }, 1000)
    expect(f.listeners.size).toBe(0)
    expect(await prepareThreadTitle(f.client, 'target', 'second', f.options)).toBeNull()
  } finally { f.cleanup() }
})

test('manual rename while generated title waits for execution lock wins', async () => {
  const f = fixture()
  const release = await acquireBridgeThreadLock(f.directory, 'target')
  try {
    const task = await prepareThreadTitle(f.client, 'target', 'question', f.options)
    await vi.waitFor(() => expect(f.request.mock.calls.some(([method]) => method === 'turn/start')).toBe(true))
    f.setName('Manual name')
    await release()
    expect(await task!.completion).toBeNull()
    expect(f.request.mock.calls.some(([method]) => method === 'thread/name/set')).toBe(false)
  } finally { await release(); f.cleanup() }
})

test('existing manual name never starts model generation', async () => {
  const f = fixture()
  try {
    f.setName('Existing')
    expect(await prepareThreadTitle(f.client, 'target', 'question', f.options)).toBeNull()
    expect(f.request).toHaveBeenCalledTimes(1)
  } finally { f.cleanup() }
})

test.each([false, true])('continuing an unnamed thread generates a title regardless of readable history: %s', async history => {
  const f = fixture()
  try {
    if (history) f.setOld()
    const task = await prepareThreadTitle(f.client, 'target', '本次继续讨论的主题', f.options)
    expect(await task!.completion).toBe('消息身份与安全命名')
    const input = f.request.mock.calls.find(([method]) => method === 'turn/start')![1].input
    expect(JSON.stringify(input)).toContain('本次继续讨论的主题')
  } finally { f.cleanup() }
})

test('concurrent qualification and generation are deduplicated for an unnamed thread', async () => {
  const f = fixture()
  try {
    const tasks = await Promise.all([
      prepareThreadTitle(f.client, 'target', 'question', f.options),
      prepareThreadTitle(f.client, 'target', 'question', f.options),
    ])
    expect(tasks.filter(Boolean)).toHaveLength(1)
    await tasks.find(Boolean)!.completion
    expect(f.request.mock.calls.filter(([method]) => method === 'thread/start')).toHaveLength(1)
  } finally { f.cleanup() }
})

test('failed generation can retry on a later message after backoff', async () => {
  const f = fixture()
  const original = f.client.request.bind(f.client)
  let configAvailable = false
  f.client.request = async (method, params, timeout) => {
    if (method === 'config/read' && !configAvailable) throw new Error('unavailable')
    return original(method, params, timeout)
  }
  try {
    const first = await prepareThreadTitle(f.client, 'target', 'question', f.options)
    expect(await first!.completion).toBeNull()
    expect(await prepareThreadTitle(f.client, 'target', 'question', f.options)).toBeNull()
    configAvailable = true
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 30_001)
    const retried = await prepareThreadTitle(f.client, 'target', '继续提问', f.options)
    expect(await retried!.completion).toBe('消息身份与安全命名')
  } finally { vi.restoreAllMocks(); f.cleanup() }
})

test('qualification read failures can retry instead of consuming naming eligibility', async () => {
  const f = fixture()
  try {
    const unavailable = { request: vi.fn().mockRejectedValue(new Error('unavailable')) }
    expect(await prepareThreadTitle(unavailable, 'target', 'question', f.options)).toBeNull()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 30_001)
    const task = await prepareThreadTitle(f.client, 'target', 'question', f.options)
    expect(await task!.completion).toBe('消息身份与安全命名')
  } finally { vi.restoreAllMocks(); f.cleanup() }
})

test.each(['timeout', 'stop'])('%s interrupts isolated turn and removes subscription without saving title', async kind => {
  const f = fixture()
  f.disableCompletion()
  try {
    const task = await prepareThreadTitle(f.client, 'target', 'question', { ...f.options, timeoutMs: 50 })
    await vi.waitFor(() => expect(f.listeners.size).toBe(1), { interval: 1 })
    if (kind === 'stop') f.controller.abort()
    expect(await task!.completion).toBeNull()
    expect(f.request).toHaveBeenCalledWith('turn/interrupt', { threadId: 'temporary', turnId: 'turn' }, 1000)
    expect(f.request).toHaveBeenCalledWith('thread/unsubscribe', { threadId: 'temporary' }, 1000)
    expect(f.listeners.size).toBe(0)
    expect(f.request.mock.calls.some(([method]) => method === 'thread/name/set')).toBe(false)
  } finally { f.cleanup() }
})

test('effective MCP config failure skips hidden model request and preserves user-facing execution', async () => {
  const f = fixture()
  const original = f.client.request.bind(f.client)
  f.client.request = async (method, params, timeout) => {
    if (method === 'config/read') throw new Error('unavailable')
    return original(method, params, timeout)
  }
  try {
    const task = await prepareThreadTitle(f.client, 'target', 'question', f.options)
    expect(await task!.completion).toBeNull()
    expect(f.request.mock.calls.some(([method]) => method === 'thread/start')).toBe(false)
  } finally { f.cleanup() }
})

test('invalidated namespace while generation completes cannot save a title', async () => {
  const f = fixture()
  let valid = true
  try {
    const task = await prepareThreadTitle(f.client, 'target', 'question', { ...f.options, isValid: async () => valid })
    valid = false
    expect(await task!.completion).toBeNull()
    expect(f.request.mock.calls.some(([method]) => method === 'thread/name/set')).toBe(false)
  } finally { f.cleanup() }
})
