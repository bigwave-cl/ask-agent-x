import { describe, expect, it } from 'vitest'
import { BridgeThreadService } from './thread-service.js'

describe('BridgeThreadService', () => {
  it('normalizes thread list and history payloads', async () => {
    const client = {
      request: async (method: string) => method === 'thread/list'
        ? { data: { threads: [{ id: 't-1', source: 'appServer', name: 'Demo', updatedAt: '2026-01-01T00:00:00Z' }], nextCursor: 'next' } }
        : { data: { thread: { id: 't-1', title: 'Demo' }, items: [{ id: 'm-1', type: 'agentMessage', text: '**ok**' }] } },
    }
    const service = new BridgeThreadService(client)
    await expect(service.listThreads(undefined, 1)).resolves.toEqual({
      threads: [{ id: 't-1', title: 'Demo', cwd: null, projectId: null, gitInfo: null, updatedAt: '2026-01-01T00:00:00.000Z', createdAt: null }],
      nextCursor: 'next',
    })
    await expect(service.readThread('t-1')).resolves.toMatchObject({
      thread: { id: 't-1', title: 'Demo' },
      messages: [{ id: 'm-1', role: 'assistant', content: '**ok**' }],
    })
  })

  it('rejects empty turn input', async () => {
    const service = new BridgeThreadService({ request: async () => ({}) })
    await expect(service.startTurn('t-1', '  ')).rejects.toThrow('Message is required')
  })
})


describe('thread directory safety', () => {
  it('requires an explicit project for creation', async () => {
    const service = new BridgeThreadService({ request: async () => { throw new Error('must not call') } })
    await expect(service.startThread()).rejects.toThrow('Project path is required')
  })
  it('rejects a different cwd before resume or turn writes', async () => {
    const calls: string[] = []
    const service = new BridgeThreadService({ request: async method => {
      calls.push(method)
      return { thread: { id: 't', cwd: '/tmp' } }
    } }, process.cwd())
    await expect(service.startTurn('t', 'hello')).rejects.toThrow('Thread project mismatch')
    expect(calls).toEqual(['thread/read'])
  })
})

describe('current Codex paginated protocol', () => {
  it('preserves data arrays and converts Unix seconds', async () => {
    const service = new BridgeThreadService({ request: async () => ({ data: [{ id: 't', source: 'appServer', cwd: '/tmp', projectId: 'opaque', updatedAt: 1767225600 }], nextCursor: 'next' }) })
    expect(await service.listThreads(undefined, 1)).toMatchObject({ threads: [{ id: 't', cwd: '/tmp', projectId: 'opaque', updatedAt: '2026-01-01T00:00:00.000Z' }], nextCursor: 'next' })
  })
  it('loads nested item pages without passing cwd to thread/read', async () => {
    const calls: { method: string; params: unknown }[] = []
    const service = new BridgeThreadService({ request: async (method, params) => {
      calls.push({ method, params })
      return method === 'thread/read' ? { thread: { id: 't', cwd: '/tmp' } } : { data: [{ turnId: 'turn', item: { type: 'userMessage', id: 'item', content: [{ type: 'text', text: 'hello' }] } }], nextCursor: 'page2' }
    } })
    expect(await service.readThread('t', 'page1', 1)).toMatchObject({ messages: [{ id: 'item', role: 'user', content: 'hello', turnId: 'turn' }], nextCursor: 'page2' })
    expect(calls).toEqual([{ method: 'thread/read', params: { threadId: 't' } }, { method: 'thread/items/list', params: { threadId: 't', turnId: undefined, cursor: 'page1', limit: 1, sortDirection: 'desc' } }])
  })
})


describe('compatible thread source pagination', () => {
  it('fills pages across desktop and unsupported sources without skipping the server cursor', async () => {
    /** 实际发出的分页协议参数。 */
    const requests: { method: string; params: unknown }[] = []
    /** 每批不超过请求限额的服务端记录。 */
    const pages = [
      { data: [{ id: 'desktop', cwd: '/tmp', source: 'vscode', originator: 'Codex Desktop' }, { id: 'cli', cwd: '/tmp', source: 'cli' }], nextCursor: 'unsupported' },
      { data: [{ id: 'exec', cwd: '/tmp', source: 'exec' }, { id: 'unknown', cwd: '/tmp', source: 'other' }], nextCursor: 'second' },
      { data: [{ id: 'web', cwd: '/tmp', source: 'vscode', originator: 'askagent_x_bridge_chat' }], nextCursor: 'third' },
      { data: [{ id: 'feishu', cwd: '/tmp', source: 'vscode', originator: 'feishu_codex_bridge' }], nextCursor: 'fourth' },
      { data: [{ id: 'server', cwd: '/tmp', source: 'appServer' }], nextCursor: 'fifth' },
      { data: [{ id: 'last', cwd: '/tmp', source: 'appServer' }], nextCursor: null },
    ]
    /** 使用受控协议响应的会话服务。 */
    const service = new BridgeThreadService({ request: async (method, params) => {
      requests.push({ method, params })
      return pages.shift()
    } }, '/tmp')
    /** 过滤后补满的第一页。 */
    const first = await service.listThreads(undefined, 3)
    expect(first.threads.map(item => item.id)).toEqual(['web', 'feishu', 'server'])
    expect(first.nextCursor).toBe('fifth')
    /** 从真实服务端游标继续读取的尾页。 */
    const second = await service.listThreads(first.nextCursor!, 3)
    expect(second.threads.map(item => item.id)).toEqual(['last'])
    expect(second.nextCursor).toBeNull()
    expect(requests.map(item => item.params)).toEqual([
      { cwd: '/tmp', cursor: undefined, limit: 3, useStateDbOnly: true, modelProviders: [], sortKey: 'updated_at', sourceKinds: ['appServer', 'vscode'] },
      { cwd: '/tmp', cursor: 'unsupported', limit: 3, useStateDbOnly: true, modelProviders: [], sortKey: 'updated_at', sourceKinds: ['appServer', 'vscode'] },
      { cwd: '/tmp', cursor: 'second', limit: 3, useStateDbOnly: true, modelProviders: [], sortKey: 'updated_at', sourceKinds: ['appServer', 'vscode'] },
      { cwd: '/tmp', cursor: 'third', limit: 2, useStateDbOnly: true, modelProviders: [], sortKey: 'updated_at', sourceKinds: ['appServer', 'vscode'] },
      { cwd: '/tmp', cursor: 'fourth', limit: 1, useStateDbOnly: true, modelProviders: [], sortKey: 'updated_at', sourceKinds: ['appServer', 'vscode'] },
      { cwd: '/tmp', cursor: 'fifth', limit: 3, useStateDbOnly: true, modelProviders: [], sortKey: 'updated_at', sourceKinds: ['appServer', 'vscode'] },
    ])
  })
  it('rejects repeated server cursors instead of reporting false exhaustion', async () => {
    /** 使用受控协议响应的会话服务。 */
    const service = new BridgeThreadService({ request: async () => ({ data: [], nextCursor: 'same' }) })
    await expect(service.listThreads('same')).rejects.toThrow('repeated thread cursor')
  })
})
