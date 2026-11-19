import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgeRelations } from '@askx/core/bridge-relations'
import { BridgeProjectService } from './project-service.js'
import { BridgeCatalogActions, type BridgeCatalogActionInput } from './catalog-actions.js'

/** 当前用例独享的临时目录。 */
let directory = ''
beforeEach(async () => { directory = await realpath(await mkdtemp(join(tmpdir(), 'askx-catalog-'))) })
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

/** 构造仅修改内存的 Codex 协议与关系边界。 */
async function fixture() {
  /** 多 root 项目的第二个现有目录。 */
  const otherPath = join(directory, 'other')
  await mkdir(otherPath)
  /** 可控的服务端状态。 */
  const state = {
    project: { id: 'p', name: 'Before', roots: [{ path: directory }, { path: otherPath }] },
    thread: { id: 't', name: 'Thread before' as string | null, cwd: directory, source: 'vscode', originator: 'askagent_x_bridge_chat' },
    deleted: false, rejectDelete: false, archived: false, running: true, failAfterWrite: false, failVerification: false, guarded: false,
  }
  /** 当前关系由测试直接模拟跨请求版本变化。 */
  const relations: BridgeRelations = { version: 1, revision: 0, groups: [], projectGroups: [], threadGroups: [] }
  /** 锁顺序的可审查记录。 */
  const order: string[] = []
  /** Codex 协议模拟，禁止触达真实 App Server。 */
  const request = vi.fn(async (method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
    if (method === 'project/list') {
      if (state.failVerification && state.deleted) throw new Error('verification unavailable')
      return { data: state.deleted ? [] : [structuredClone(state.project)], nextCursor: null }
    }
    if (method === 'project/read') {
      if (state.deleted) throw new Error('project not found')
      return { project: structuredClone(state.project) }
    }
    if (method === 'thread/read') return { thread: structuredClone(state.thread) }
    if (method === 'thread/list') return { data: state.archived ? [{ id: 't' }] : [], nextCursor: null }
    expect(state.guarded).toBe(true)
    if (method === 'project/update') state.project = { ...state.project, ...params, id: 'p' } as typeof state.project
    else if (method === 'project/delete') {
      if (state.rejectDelete) throw new Error('delete denied before write')
      state.deleted = true
    }
    else if (method === 'thread/name/set') state.thread.name = String(params.name)
    else if (method === 'thread/archive') state.archived = true
    else if (method === 'thread/unarchive') state.archived = false
    else throw new Error(`Unexpected method ${method}`)
    if (state.failAfterWrite) { state.failAfterWrite = false; throw new Error('write response lost') }
    return {}
  })
  /** 锁外读取关联快照的可观测入口。 */
  const readRelations = vi.fn(async () => structuredClone(relations))
  /** 桥接动作只消费已有项目身份 owner。 */
  const actions = new BridgeCatalogActions({
    rpc: { request }, projects: new BridgeProjectService({ request }), canOperate: async () => state.running,
    readRelations,
    acquireThreadLease: async () => { order.push('thread'); return async () => { order.push('release') } },
    guardCatalogChange: async callback => {
      order.push('relations')
      state.guarded = true
      try { await callback(structuredClone(relations)) } finally { state.guarded = false; relations.revision++ }
    },
  })
  /** 按真实调用顺序生成计划和明确确认。 */
  const execute = async (input: Omit<BridgeCatalogActionInput, 'projectPath'>) => {
    /** 在模块内生成的真实计划。 */
    const plan = await actions.plan({ ...input, projectPath: directory })
    await actions.apply(plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })
  }
  return { state, relations, request, actions, execute, order, otherPath, readRelations }
}

describe('BridgeCatalogActions', () => {
  it('renames the project without changing any roots', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    await context.execute({ action: 'rename-project', name: 'After' })
    expect(context.state.project.name).toBe('After')
    expect(context.state.project.roots).toEqual([{ path: directory }, { path: context.otherPath }])
  })
  it('removes only the chosen root from multi-root projects', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    await context.execute({ action: 'remove-project' })
    expect(context.state.project.roots).toEqual([{ path: context.otherPath }])
    expect(context.request.mock.calls.some(([method]) => method === 'project/delete')).toBe(false)
  })
  it('deletes only the single-root project registration', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    context.state.project.roots = [{ path: directory }]
    await context.execute({ action: 'remove-project' })
    expect(context.state.deleted).toBe(true)
    expect(context.request.mock.calls.some(([method]) => method === 'thread/delete')).toBe(false)
  })
  it('archives the owned thread under thread then relations locks', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    await context.execute({ action: 'archive-thread', threadId: 't' })
    expect(context.state.archived).toBe(true)
    expect(context.order).toEqual(['thread', 'relations', 'release'])
    expect(context.request.mock.calls.some(([method]) => method === 'thread/delete')).toBe(false)
  })
  it('renames a bridge thread without resuming it', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    await context.execute({ action: 'rename-thread', threadId: 't', name: 'New thread' })
    expect(context.state.thread.name).toBe('New thread')
    expect(context.request.mock.calls.some(([method]) => method === 'thread/resume')).toBe(false)
  })
  it.each(['remove-project', 'archive-thread'] as const)('rejects linked target %s', async action => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    context.relations.projectGroups = [{ chatId: 'oc_group', projectPath: directory }]
    context.relations.threadGroups = [{ chatId: 'oc_group', projectPath: directory, threadId: 't' }]
    await expect(context.execute({ action, threadId: 't' })).rejects.toThrow('Unlink')
    expect(context.request.mock.calls.some(([method]) => ['project/update', 'project/delete', 'thread/archive'].includes(method))).toBe(false)
  })
  it('rejects stopped services and desktop thread identities before mutation', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    context.state.running = false
    await expect(context.execute({ action: 'rename-project', name: 'After' })).rejects.toThrow('Bridge must be running')
    context.state.running = true
    context.state.thread.originator = 'Codex Desktop'
    await expect(context.execute({ action: 'rename-thread', threadId: 't', name: 'After' })).rejects.toThrow('Only bridge')
  })
  it('rejects mismatched consent and changed snapshots before writes', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    /** 用户确认时对应的检测计划。 */
    const plan = await context.actions.plan({ action: 'rename-project', projectPath: directory, name: 'After' })
    await expect(context.actions.apply(plan, { planHash: 'wrong', confirmedAt: '' })).rejects.toThrow('Consent')
    context.state.project.name = 'External change'
    await expect(context.actions.apply(plan, { planHash: plan.hash, confirmedAt: '' })).rejects.toThrow('Catalog changed')
    expect(context.state.project.name).toBe('External change')
  })
  it.each(['rename-project', 'rename-thread', 'remove-project', 'archive-thread'] as const)('recovers %s after a lost write response', async action => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    context.state.failAfterWrite = true
    await expect(context.execute({ action, threadId: 't', name: 'After' })).rejects.toThrow('write response lost')
    expect(context.state.project.name).toBe('Before')
    expect(context.state.project.roots).toEqual([{ path: directory }, { path: context.otherPath }])
    expect(context.state.thread.name).toBe('Thread before')
    expect(context.state.archived).toBe(false)
  })
  it('reports incomplete recovery for a deleted project ID instead of recreating it', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    context.state.project.roots = [{ path: directory }]
    context.state.failVerification = true
    await expect(context.execute({ action: 'remove-project' })).rejects.toThrow('recovery is incomplete')
    expect(context.state.deleted).toBe(true)
    expect(context.request.mock.calls.some(([method]) => method === 'project/create')).toBe(false)
  })
  it('preserves the original error when deletion was rejected before changing the project', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    context.state.project.roots = [{ path: directory }]
    context.state.rejectDelete = true
    await expect(context.execute({ action: 'remove-project' })).rejects.toEqual(new Error('delete denied before write'))
    expect(context.state.deleted).toBe(false)
    expect(context.state.project).toEqual({ id: 'p', name: 'Before', roots: [{ path: directory }] })
  })
  it('reports incomplete recovery when deletion committed but its response was lost', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    context.state.project.roots = [{ path: directory }]
    context.state.failAfterWrite = true
    await expect(context.execute({ action: 'remove-project' })).rejects.toThrow('its original ID cannot be restored')
    expect(context.state.deleted).toBe(true)
    expect(context.request.mock.calls.some(([method]) => method === 'project/create')).toBe(false)
  })
  it('uses the locked relations snapshot and rejects a stale relation revision', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    /** 与旧关系版本绑定的确认计划。 */
    const plan = await context.actions.plan({ action: 'rename-project', projectPath: directory, name: 'After' })
    context.relations.revision++
    await expect(context.actions.apply(plan, { planHash: plan.hash, confirmedAt: '' })).rejects.toThrow('Catalog changed')
    expect(context.readRelations).toHaveBeenCalledTimes(1)
    expect(context.state.project.name).toBe('Before')
  })
  it('checks thread cwd and running state again before applying', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    context.state.thread.cwd = context.otherPath
    await expect(context.execute({ action: 'rename-thread', threadId: 't', name: 'After' })).rejects.toThrow('Thread project mismatch')
    /** 运行状态变化前的确认计划。 */
    const plan = await context.actions.plan({ action: 'rename-project', projectPath: directory, name: 'After' })
    context.state.running = false
    await expect(context.actions.apply(plan, { planHash: plan.hash, confirmedAt: '' })).rejects.toThrow('Bridge must be running')
  })
  it('reports the protocol limitation when an unnamed thread cannot be restored', async () => {
    /** 当前用例协议夹具。 */
    const context = await fixture()
    context.state.thread.name = null
    context.state.failAfterWrite = true
    await expect(context.execute({ action: 'rename-thread', threadId: 't', name: 'After' })).rejects.toThrow('unnamed thread state cannot be restored')
    expect(context.state.thread.name).toBe('After')
  })

})
