import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultBridgeConfig } from '@askx/core'
import type { AskXConfig } from '@askx/core'
import { BridgeThreadSession, BridgeThreadSessionManager } from './thread-session.js'
import { BridgeProjectService } from './project-service.js'

const eventHome = mkdtempSync(join(tmpdir(), 'askx-session-events-'))
afterEach(() => { rmSync(eventHome, { recursive: true, force: true }); vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('BridgeThreadSessionManager', () => {
  it('reads projects while stopped but blocks thread creation', async () => {
    vi.spyOn(BridgeThreadSession.prototype, 'start').mockResolvedValue()
    const request = vi.spyOn(BridgeThreadSession.prototype, 'request').mockResolvedValue({ data: [], nextCursor: null })
    const manager = new BridgeThreadSessionManager({ read: async () => ({ bridge: { ...defaultBridgeConfig(), paths: { ...defaultBridgeConfig().paths, codexHome: eventHome, stateDir: eventHome } } }) as AskXConfig }, async () => false)
    try {
      expect(await new BridgeProjectService(manager).listProjects()).toEqual([])
      await expect(manager.startThread('/tmp')).rejects.toThrow('not running')
      expect(request.mock.calls.map(call => call[0])).toEqual(['project/list'])
    } finally { manager.stop() }
  })
  it('shares one management initialization across concurrent requests', async () => {
    const start = vi.spyOn(BridgeThreadSession.prototype, 'start').mockResolvedValue()
    vi.spyOn(BridgeThreadSession.prototype, 'request').mockResolvedValue({ data: [], nextCursor: null })
    const manager = new BridgeThreadSessionManager({ read: async () => ({ bridge: { ...defaultBridgeConfig(), paths: { ...defaultBridgeConfig().paths, codexHome: eventHome, stateDir: eventHome } } }) as AskXConfig }, async () => true)
    try {
      await Promise.all([manager.request('project/list'), manager.request('project/list')])
      expect(start).toHaveBeenCalledTimes(1)
    } finally { manager.stop() }
  })
  it('starts a thread with only the explicitly selected real project cwd', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'askx-session-test-'))
    const path = await realpath(temp)
    vi.spyOn(BridgeThreadSession.prototype, 'start').mockResolvedValue()
    const request = vi.spyOn(BridgeThreadSession.prototype, 'request').mockImplementation(async method => {
      if (method === 'project/list') return { data: [{ id: 'opaque', name: 'Project', roots: [{ path }] }], nextCursor: null }
      if (method === 'project/read') return { project: { roots: [{ path }] } }
      return { thread: { id: 't', cwd: path, projectId: 'opaque' } }
    })
    const manager = new BridgeThreadSessionManager({ read: async () => ({ bridge: { ...defaultBridgeConfig(), paths: { ...defaultBridgeConfig().paths, codexHome: eventHome, stateDir: eventHome } } }) as AskXConfig }, async () => true)
    try {
      await expect(manager.startThread()).rejects.toThrow('Project path is required')
      expect(await manager.startThread(path)).toMatchObject({ id: 't', cwd: path, projectId: 'opaque' })
      expect(request.mock.calls.find(call => call[0] === 'thread/start')?.[1]).toMatchObject({ cwd: path, projectId: 'opaque' })
    } finally { manager.stop(); await rm(temp, { recursive: true, force: true }) }
  })
})

/** 跨进程锁在本组仅验证 owner 生命周期，文件锁自身由 Core 测试覆盖。 */
const lockMocks = vi.hoisted(() => ({ release: vi.fn(async () => {}), acquire: vi.fn() }))
vi.mock('@askx/core/bridge-thread-lock', () => ({ acquireBridgeThreadLock: lockMocks.acquire }))

describe('per-turn execution ownership', () => {
  it.each([false, true])('releases only the matching owned turn, including early completion=%s', async early => {
    const temp = await mkdtemp(join(tmpdir(), 'askx-turn-test-'))
    const path = await realpath(temp)
    lockMocks.release.mockClear()
    lockMocks.acquire.mockResolvedValue(lockMocks.release)
    const subscribers = new Map<BridgeThreadSession, (event: { method: string; params: Record<string, unknown> }) => void>()
    vi.spyOn(BridgeThreadSession.prototype, 'subscribe').mockImplementation(function(this: BridgeThreadSession, listener) {
      subscribers.set(this, listener)
      return () => { subscribers.delete(this) }
    })
    vi.spyOn(BridgeThreadSession.prototype, 'start').mockResolvedValue()
    const stopped = vi.spyOn(BridgeThreadSession.prototype, 'stop').mockImplementation(() => {})
    let executing: BridgeThreadSession | undefined
    let rejectTurn = false
    vi.spyOn(BridgeThreadSession.prototype, 'request').mockImplementation(async function(this: BridgeThreadSession, method) {
      if (method === 'project/list') return { data: [{ id: 'p', name: 'Project', roots: [{ path }] }] }
      if (method === 'project/read') return { project: { roots: [{ path }] } }
      if (method === 'turn/start') {
        if (rejectTurn) throw new Error('turn start rejected')
        executing = this
        if (early) subscribers.get(this)?.({ method: 'turn/completed', params: { threadId: 't', turn: { id: 'turn' } } })
        return { turn: { id: 'turn' } }
      }
      return { thread: { id: 't', cwd: path } }
    })
    const manager = new BridgeThreadSessionManager({ read: async () => ({ bridge: { ...{ ...defaultBridgeConfig(), paths: { ...defaultBridgeConfig().paths, codexHome: eventHome, stateDir: eventHome } }, paths: { ...{ ...defaultBridgeConfig(), paths: { ...defaultBridgeConfig().paths, codexHome: eventHome, stateDir: eventHome } }.paths, stateDir: temp } } }) as AskXConfig }, async () => true)
    try {
      await expect(manager.interrupt('t', 'other')).rejects.toThrow('No matching')
      expect(await manager.startTurn('t', 'hello')).toEqual({ turnId: 'turn' })
      expect(lockMocks.acquire).toHaveBeenCalledWith(temp, 't', expect.objectContaining({ signal: expect.any(AbortSignal) }))
      expect(await manager.isTurnActive('t')).toBe(!early)
      if (!early) {
        await expect(manager.interrupt('t', 'other')).rejects.toThrow('No matching')
        subscribers.get(executing!)?.({ method: 'turn/completed', params: { threadId: 't', turn: { id: 'unrelated' } } })
        expect(await manager.isTurnActive('t')).toBe(true)
        subscribers.get(executing!)?.({ method: 'turn/completed', params: { threadId: 't', turn: { id: 'turn' } } })
      }
      expect(await manager.isTurnActive('t')).toBe(false)
      expect(lockMocks.release).toHaveBeenCalledTimes(1)
      expect(stopped.mock.contexts).toContain(executing)
      if (!early) {
        await manager.startTurn('t', 'second')
        manager.stop()
        expect(lockMocks.release).toHaveBeenCalledTimes(2)
        expect(await manager.isTurnActive('t')).toBe(false)
      }
      const releasedBeforeError = lockMocks.release.mock.calls.length
      rejectTurn = true
      await expect(manager.startTurn('t', 'failure')).rejects.toThrow('turn start rejected')
      expect(lockMocks.release).toHaveBeenCalledTimes(releasedBeforeError + 1)
      expect(await manager.isTurnActive('t')).toBe(false)
    } finally { manager.stop(); await rm(temp, { recursive: true, force: true }) }
  })
})


describe('queued execution cancellation', () => {
  it('aborts lock wait when the manager stops without starting a process', async () => {
    let waiting: (() => void) | undefined
    const queued = new Promise<void>(resolve => { waiting = resolve })
    lockMocks.acquire.mockImplementation(async (_directory: string, _id: string, options: { signal: AbortSignal }) => {
      waiting?.()
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
    })
    const start = vi.spyOn(BridgeThreadSession.prototype, 'start').mockResolvedValue()
    const manager = new BridgeThreadSessionManager({ read: async () => ({ bridge: { ...defaultBridgeConfig(), paths: { ...defaultBridgeConfig().paths, codexHome: eventHome, stateDir: eventHome } } }) as AskXConfig }, async () => true)
    const pending = manager.startTurn('t', 'hello')
    await queued
    manager.stop()
    await expect(pending).rejects.toThrow('cancelled')
    expect(start).not.toHaveBeenCalled()
  })
})


describe('offline thread management', () => {
  it('allows list and history while stopped and blocks both creation and execution', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'askx-offline-threads-'))
    const path = await realpath(directory)
    vi.spyOn(BridgeThreadSession.prototype, 'start').mockResolvedValue()
    const request = vi.spyOn(BridgeThreadSession.prototype, 'request').mockImplementation(async method => {
      if (method === 'project/list') return { data: [{ id: 'p', name: 'Project', roots: [{ path }] }] }
      if (method === 'project/read') return { project: { roots: [{ path }] } }
      if (method === 'thread/list') return { data: [{ id: 't', source: 'appServer', cwd: path }], nextCursor: null }
      if (method === 'thread/items/list') return { data: [{ turnId: 'turn', item: { type: 'agentMessage', id: 'item', text: 'hello' } }] }
      return { thread: { id: 't', cwd: path } }
    })
    const manager = new BridgeThreadSessionManager({ read: async () => ({ bridge: { ...defaultBridgeConfig(), paths: { ...defaultBridgeConfig().paths, codexHome: eventHome, stateDir: eventHome } } }) as AskXConfig }, async () => false)
    try {
      expect(await manager.listThreads(undefined, 50, path)).toMatchObject({ threads: [{ id: 't', cwd: path }] })
      expect(await manager.readThread('t')).toMatchObject({ messages: [{ content: 'hello' }] })
      await expect(manager.startThread(path)).rejects.toThrow('not running')
      await expect(manager.startTurn('t', 'hello', path)).rejects.toThrow('not running')
      expect(request.mock.calls.some(([method]) => ['thread/start', 'thread/resume', 'turn/start'].includes(method))).toBe(false)
    } finally { manager.stop(); await rm(directory, { recursive: true, force: true }) }
  })
})


/** 不运行真实进程，验证子进程身份与初始化协议。 */
const processMocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: processMocks.spawn }))

describe('Codex child process identity', () => {
  it('removes only the originator override from the child without changing the parent', async () => {
    vi.stubEnv('CODEX_INTERNAL_ORIGINATOR_OVERRIDE', 'Codex Desktop')
    /** 用于核验父进程环境未被修改的快照。 */
    const parentEnvironment = { ...process.env }
    /** 只提供协议管道的虚拟子进程。 */
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), killed: false, kill: vi.fn(),
    })
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcessWithoutNullStreams)
    /** 模拟初始化和删除防护查询。 */
    const request = vi.spyOn(BridgeThreadSession.prototype, 'request').mockImplementation(async method => {
      if (method !== 'hooks/list') return {}
      /** 启动时传入的完整参数。 */
      const args = vi.mocked(spawn).mock.calls.at(-1)?.[1] as string[]
      /** 配置中声明的删除防护命令。 */
      const command = args.at(-1)?.match(/command="([^"]+)"/)?.[1]
      return { data: [{ hooks: [{ enabled: true, eventName: 'preToolUse', command }] }] }
    })
    /** 待验证的独立执行会话。 */
    const session = new BridgeThreadSession('codex', '/tmp', '/tmp/askx-codex-home')
    try {
      await session.start()
      /** 实际传递给子进程的启动选项。 */
      const options = vi.mocked(spawn).mock.calls.at(-1)?.[2]
      /** 子进程应继承覆盖项以外的全部环境，并使用桥接专用 Codex Home。 */
      const { CODEX_INTERNAL_ORIGINATOR_OVERRIDE: _override, ...expectedEnvironment } = parentEnvironment
      expectedEnvironment.CODEX_HOME = '/tmp/askx-codex-home'
      expect(options?.env).toEqual(expectedEnvironment)
      expect(process.env).toEqual(parentEnvironment)
      expect(request).toHaveBeenCalledWith('initialize', { capabilities: { experimentalApi: true }, clientInfo: { name: 'askagent_x_bridge_chat', title: 'AskAgent X Bridge Chat', version: '1.0.0' } })
    } finally { session.stop() }
  })
})


it('names a resumed unnamed thread after a manager restart and publishes its title', async () => {
  /** 隔离项目和来源数据，不创建或改动真实会话。 */
  const temp = await mkdtemp(join(tmpdir(), 'askx-resumed-title-'))
  const path = await realpath(temp)
  /** 模拟已存在但未命名的 thread，与 manager 新建记录无关。 */
  let name: string | null = null
  /** 每个协议会话的独立订阅集合。 */
  const listeners = new Map<BridgeThreadSession, Set<(event: { method: string; params: Record<string, unknown> }) => void>>()
  lockMocks.acquire.mockResolvedValue(async () => {})
  vi.spyOn(BridgeThreadSession.prototype, 'start').mockResolvedValue()
  vi.spyOn(BridgeThreadSession.prototype, 'stop').mockImplementation(() => {})
  vi.spyOn(BridgeThreadSession.prototype, 'subscribe').mockImplementation(function(this: BridgeThreadSession, listener) {
    const set = listeners.get(this) ?? new Set()
    set.add(listener)
    listeners.set(this, set)
    return () => { set.delete(listener) }
  })
  const request = vi.spyOn(BridgeThreadSession.prototype, 'request').mockImplementation(async function(this: BridgeThreadSession, method, params) {
    if (method === 'project/list') return { data: [{ id: 'p', name: 'Project', roots: [{ path }] }] }
    if (method === 'project/read') return { project: { roots: [{ path }] } }
    if (method === 'config/read') return { config: { model: 'model' } }
    if (method === 'thread/start') return { thread: { id: 'title-draft' }, sandbox: { type: 'readOnly' } }
    if (method === 'thread/name/set') { name = String(params?.name); return {} }
    if (method === 'turn/start') {
      const threadId = params?.threadId
      setImmediate(() => {
        if (threadId === 'title-draft') for (const listener of listeners.get(this) ?? []) listener({ method: 'item/completed', params: { threadId, turnId: 'turn', item: { type: 'agentMessage', text: '{"title":"继续项目讨论"}' } } })
        for (const listener of listeners.get(this) ?? []) listener({ method: 'turn/completed', params: { threadId, turn: { id: 'turn', status: 'completed' } } })
      })
      return { turn: { id: 'turn' } }
    }
    return { thread: { id: 'existing', cwd: path, name, turns: [{ id: 'historical-turn' }] }, model: 'model', modelProvider: 'provider' }
  })
  const manager = new BridgeThreadSessionManager({ read: async () => ({ bridge: { ...defaultBridgeConfig(), paths: { ...defaultBridgeConfig().paths, codexHome: temp, stateDir: temp } } }) as AskXConfig }, async () => true)
  try {
    await manager.startTurn('existing', '继续项目讨论', path)
    await vi.waitFor(() => expect(name).toBe('继续项目讨论'))
    const store = await manager.getConversationStore()
    await vi.waitFor(() => expect(store.events('existing').some(event => event.type === 'thread.title' && event.title === name)).toBe(true))
    expect(request.mock.calls.filter(([method]) => method === 'thread/start')).toHaveLength(1)
    expect(request.mock.calls.find(([method]) => method === 'thread/start')?.[1]).toMatchObject({ ephemeral: true })
  } finally { manager.stop(); await rm(temp, { recursive: true, force: true }) }
})
