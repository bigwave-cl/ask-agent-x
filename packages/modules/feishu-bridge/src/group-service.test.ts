import { mkdtemp, mkdir, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BridgeRelationsConflictError, BridgeRelationsStore, type BridgeRelationsInput } from '@askx/core/bridge-relations'
import { BridgeAssociationValidationError, BridgeGroupService } from './group-service.js'
import { BridgeProjectService } from './project-service.js'

/** SDK 与凭据仅在测试进程内模拟，不发送网络请求。 */
const mocks = vi.hoisted(() => ({ list: vi.fn(), credentials: vi.fn() }))
vi.mock('@larksuiteoapi/node-sdk', () => ({
  Client: class { im = { chat: { list: mocks.list } } },
  AppType: { SelfBuild: 'self-build' },
  Domain: { Feishu: 'feishu' },
}))
vi.mock('@askx/core/bridge-credentials', async importOriginal => ({
  ...await importOriginal<object>(),
  resolveFeishuCredentials: mocks.credentials,
}))

/** 所有夹具均位于系统临时目录。 */
const directories: string[] = []
afterEach(async () => {
  vi.resetAllMocks()
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

/** 构造真实目录与只读 Codex RPC 的隔离服务。 */
async function setup() {
  const temporary = await mkdtemp(join(tmpdir(), 'askx-group-service-test-'))
  directories.push(temporary)
  const directory = await realpath(temporary)
  const projectPath = join(directory, 'project')
  const otherPath = join(directory, 'other')
  await Promise.all([mkdir(projectPath), mkdir(otherPath)])
  const request = vi.fn(async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
    if (method === 'project/list') return { data: [{ id: 'project-1', name: 'Demo', roots: [{ path: projectPath }, { path: otherPath }] }], nextCursor: null }
    if (method === 'project/read') return { project: { id: 'project-1', roots: [{ path: projectPath }, { path: otherPath }] } }
    if (method === 'thread/read') return { thread: { id: params?.threadId, cwd: projectPath } }
    throw new Error(`Unexpected test RPC: ${method}`)
  })
  const store = new BridgeRelationsStore(join(directory, 'relations'))
  const projects = new BridgeProjectService({ request })
  const service = new BridgeGroupService(store, projects, { request })
  const input: BridgeRelationsInput = {
    groups: [{ chatId: 'oc_A', name: 'A' }, { chatId: 'oc_B', name: 'B' }],
    projectGroups: [{ chatId: 'oc_A', projectPath }, { chatId: 'oc_B', projectPath }],
    threadGroups: [{ chatId: 'oc_A', projectPath, threadId: 'thread-1' }, { chatId: 'oc_B', projectPath, threadId: 'thread-1' }],
  }
  return { directory, projectPath, otherPath, request, store, service, input }
}

describe('BridgeGroupService', () => {
  it('创建群会话后持久化关联，保留现有历史关系', async () => {
    const { service, input, projectPath, store } = await setup()
    const initial = await service.save(input, 0)
    const created = { id: 'new-thread', cwd: projectPath, projectId: null, gitInfo: null, title: 'AskX Relay', updatedAt: null, createdAt: null }
    const create = vi.fn(async () => created)
    await expect(service.createThread('oc_A', projectPath, create)).resolves.toEqual(created)
    expect(create).toHaveBeenCalledWith(projectPath)
    expect((await store.read()).threadGroups).toEqual([...initial.threadGroups, { chatId: 'oc_A', projectPath, threadId: created.id }])
  })

  it('创建期间撤销当前项目时拒绝关联，未授权项目不创建会话', async () => {
    const { service, input, projectPath, otherPath, store } = await setup()
    const initial = await service.save(input, 0)
    const create = vi.fn(async () => {
      await store.replace({ ...input, projectGroups: initial.projectGroups.map(link => ({ ...link, active: false })) }, initial.revision)
      return { id: 'new-thread', cwd: projectPath, projectId: null, gitInfo: null, title: 'AskX Relay', updatedAt: null, createdAt: null }
    })
    await expect(service.createThread('oc_A', otherPath, create)).rejects.toThrow('read-only')
    expect(create).not.toHaveBeenCalled()
    await expect(service.createThread('oc_A', projectPath, create)).rejects.toBeInstanceOf(BridgeRelationsConflictError)
    expect((await store.read()).threadGroups).toEqual(initial.threadGroups)
    expect((await store.read()).projectGroups.every(link => !link.active)).toBe(true)
  })

  it('保存前核验项目真实归属，并且共享 thread 只读取一次', async () => {
    const { service, input, request } = await setup()
    const saved = await service.save(input, 0)
    expect(saved.threadGroups).toHaveLength(2)
    expect(request.mock.calls.filter(([method]) => method === 'project/read')).toHaveLength(1)
    expect(request.mock.calls.filter(([method]) => method === 'thread/read')).toEqual([
      ['thread/read', { threadId: 'thread-1', includeTurns: false }],
    ])
  })

  it('未注册的项目不能授予群权限，磁盘快照保持不变', async () => {
    const { service, input, otherPath, store } = await setup()
    const saved = await service.save(input, 0)
    const invalid = { ...input, projectGroups: [{ chatId: 'oc_A', projectPath: `${otherPath}-missing` }], threadGroups: [] }
    await expect(service.save(invalid, 1)).rejects.toMatchObject({ code: 'project_unavailable' })
    expect(await store.read()).toEqual(saved)
  })

  it('拒绝目录别名，要求保存规范真实路径', async () => {
    const { directory, projectPath, service, input, store } = await setup()
    const alias = join(directory, 'alias')
    await symlink(projectPath, alias)
    await expect(service.save({ ...input, projectGroups: [{ chatId: 'oc_A', projectPath: alias }], threadGroups: [] }, 0)).rejects.toThrow('canonical project path')
    expect((await store.read()).revision).toBe(0)
  })

  it('thread cwd 不属于所选项目时拒绝提交', async () => {
    const { service, input, otherPath, request, store } = await setup()
    const original = request.getMockImplementation()!
    request.mockImplementation(async (method, params) => method === 'thread/read'
      ? { thread: { id: params?.threadId, cwd: otherPath } }
      : original(method, params))
    await expect(service.save(input, 0)).rejects.toThrow('Thread does not belong')
    expect((await store.read()).revision).toBe(0)
  })

  it('拒绝过期 revision，保留已经提交的群关系', async () => {
    const { service, store, input } = await setup()
    const saved = await service.save(input, 0)
    await expect(service.save({ ...input, threadGroups: [] }, 0)).rejects.toBeInstanceOf(BridgeRelationsConflictError)
    expect(await store.read()).toEqual(saved)
  })

  it('切换当前项目时保留历史项目和会话关系', async () => {
    const { service, store, input, projectPath, otherPath } = await setup()
    const initial = await service.save({ ...input, projectGroups: [{ chatId: 'oc_A', projectPath, active: true }, { chatId: 'oc_A', projectPath: otherPath, active: false }], threadGroups: input.threadGroups.filter(link => link.chatId === 'oc_A') }, 0)
    const switched = await service.activateProject('oc_A', otherPath, initial.revision)
    expect(switched.projectGroups).toEqual([{ chatId: 'oc_A', projectPath, active: false }, { chatId: 'oc_A', projectPath: otherPath, active: true }])
    expect(switched.threadGroups).toEqual(initial.threadGroups)
    expect(await store.read()).toEqual(switched)
  })

  it('关闭当前项目保留关联和会话，允许无当前项目并可重新互斥激活', async () => {
    /** 两群共享同一项目，目标群另有历史项目。 */
    const { service, store, input, projectPath, otherPath } = await setup()
    /** 初始关系快照。 */
    const initial = await service.save({ ...input, projectGroups: [...input.projectGroups, { chatId: 'oc_A', projectPath: otherPath, active: false }] }, 0)
    /** 关闭后的服务端确认状态。 */
    const stopped = await service.setProjectActive('oc_A', projectPath, false, initial.revision)
    expect(stopped.projectGroups.filter(link => link.chatId === 'oc_A').every(link => !link.active)).toBe(true)
    expect(stopped.projectGroups).toHaveLength(initial.projectGroups.length)
    expect(stopped.projectGroups.find(link => link.chatId === 'oc_B')).toEqual(initial.projectGroups.find(link => link.chatId === 'oc_B'))
    expect(stopped.threadGroups).toEqual(initial.threadGroups)
    expect(await store.read()).toEqual(stopped)
    /** 重新打开并切换到另一项目后的快照。 */
    const restarted = await service.setProjectActive('oc_A', projectPath, true, stopped.revision)
    const switched = await service.setProjectActive('oc_A', otherPath, true, restarted.revision)
    expect(switched.projectGroups.filter(link => link.chatId === 'oc_A' && link.active)).toEqual([{ chatId: 'oc_A', projectPath: otherPath, active: true }])
    /** 关闭旧项目不能影响真正当前项目。 */
    const unchanged = await service.setProjectActive('oc_A', projectPath, false, switched.revision)
    expect(unchanged.projectGroups).toEqual(switched.projectGroups)
    expect(unchanged.threadGroups).toEqual(initial.threadGroups)
  })

  it('关闭未关联项目明确失败且不会创建新关联，过期版本优先拒绝', async () => {
    /** 仅有原项目关联的隔离服务。 */
    const { service, store, input, otherPath, request } = await setup()
    /** 已持久化的原始快照。 */
    const initial = await service.save(input, 0)
    request.mockClear()
    await expect(service.setProjectActive('oc_A', otherPath, false, initial.revision)).rejects.toThrow('not linked')
    await expect(service.setProjectActive('missing-group', otherPath, false, 0)).rejects.toBeInstanceOf(BridgeRelationsConflictError)
    expect(request).not.toHaveBeenCalled()
    expect(await store.read()).toEqual(initial)
  })

  it('不可用项目可关闭且保留迁移冲突和历史会话', async () => {
    /** 关闭状态不需要远端目录继续可用。 */
    const { service, store, input, projectPath, otherPath, request } = await setup()
    /** 旧数据中的待处理迁移冲突。 */
    const initial = await store.replace({ ...input, projectGroups: [...input.projectGroups, { chatId: 'oc_A', projectPath: otherPath, active: false }], migrationConflicts: [{ chatId: 'oc_A', projectPaths: [projectPath, otherPath] }] }, 0)
    request.mockRejectedValue(new Error('Unavailable'))
    /** 停用只撤销目标激活状态。 */
    const stopped = await service.setProjectActive('oc_A', projectPath, false, initial.revision)
    expect(stopped.migrationConflicts).toEqual(initial.migrationConflicts)
    expect(stopped.threadGroups).toEqual(initial.threadGroups)
    expect(stopped.projectGroups).toHaveLength(initial.projectGroups.length)
    expect(request).not.toHaveBeenCalled()
    expect(await store.read()).toEqual(stopped)
  })

  it('开关核验期间的并发关系提交由 Core CAS 拒绝', async () => {
    /** 模拟打开项目核验期间的其他写入。 */
    const { service, store, input, projectPath, request } = await setup()
    /** 起始为停用状态。 */
    const initial = await store.replace({ ...input, projectGroups: input.projectGroups.map(link => ({ ...link, active: false })) }, 0)
    /** 保留正常 RPC 行为，仅在项目核验时插入一次并发提交。 */
    const original = request.getMockImplementation()!
    let replaced = false
    request.mockImplementation(async (method, params) => {
      if (!replaced) {
        replaced = true
        await store.replace({ groups: initial.groups, projectGroups: initial.projectGroups, threadGroups: [], migrationConflicts: initial.migrationConflicts }, initial.revision)
      }
      return original(method, params)
    })
    await expect(service.setProjectActive('oc_A', projectPath, true, initial.revision)).rejects.toBeInstanceOf(BridgeRelationsConflictError)
    expect((await store.read()).projectGroups).toEqual(initial.projectGroups)
    expect((await store.read()).threadGroups).toEqual([])
  })

  it('失效历史项目和会话不阻塞合法新增及主动移除', async () => {
    const { service, store, input, projectPath, otherPath, request } = await setup()
    const initial = await service.save(input, 0)
    const original = request.getMockImplementation()!
    request.mockImplementation(async (method, params) => {
      if (method === 'project/list') return { data: [{ id: 'other', name: 'Other', roots: [{ path: otherPath }] }] }
      if (method === 'thread/read') throw new Error('private RPC details')
      return original(method, params)
    })
    request.mockClear()
    const saved = await service.save({ ...input, projectGroups: [...initial.projectGroups, { chatId: 'oc_A', projectPath: otherPath, active: false }] }, initial.revision)
    expect(saved.threadGroups).toEqual(initial.threadGroups)
    expect(request.mock.calls.filter(([method]) => method === 'thread/read')).toHaveLength(0)
    const removed = await service.save({ ...input, projectGroups: saved.projectGroups.filter(link => link.projectPath !== projectPath), threadGroups: [] }, saved.revision)
    expect(removed.projectGroups).toEqual([{ chatId: 'oc_A', projectPath: otherPath, active: false }])
    expect(await store.read()).toEqual(removed)
  })

  it('历史不可用项目重新激活或新增共享仍拒绝', async () => {
    const { service, store, input, projectPath, otherPath, request } = await setup()
    const initial = await store.replace({ ...input, projectGroups: [{ chatId: 'oc_A', projectPath, active: false }, { chatId: 'oc_A', projectPath: otherPath, active: true }, { chatId: 'oc_B', projectPath, active: true }], threadGroups: [input.threadGroups[0]!] }, 0)
    request.mockResolvedValue({ data: [] })
    await expect(service.activateProject('oc_A', projectPath, initial.revision)).rejects.toMatchObject({ code: 'project_unavailable', projectPath })
    await expect(service.save({ ...input, projectGroups: initial.projectGroups, threadGroups: input.threadGroups }, initial.revision)).rejects.toBeInstanceOf(BridgeAssociationValidationError)
    expect(await store.read()).toEqual(initial)
  })

  it('新增群共享旧会话也重新读取并隐藏 RPC 失败详情', async () => {
    const { service, input, request, store } = await setup()
    const initial = await service.save({ ...input, threadGroups: [input.threadGroups[0]!] }, 0)
    const original = request.getMockImplementation()!
    request.mockImplementation(async (method, params) => {
      if (method === 'thread/read') throw new Error('private RPC details')
      return original(method, params)
    })
    await expect(service.save(input, initial.revision)).rejects.toMatchObject({ code: 'thread_unavailable', threadId: 'thread-1', message: 'Thread unavailable / 会话不可用' })
    expect(await store.read()).toEqual(initial)
  })

  it('过期版本不触发远端核验，核验期间并发提交仍由 CAS 拒绝', async () => {
    const { service, input, request, store } = await setup()
    const initial = await store.replace({ ...input, threadGroups: [] }, 0)
    request.mockClear()
    await expect(service.save(input, 0)).rejects.toBeInstanceOf(BridgeRelationsConflictError)
    expect(request).not.toHaveBeenCalled()
    const original = request.getMockImplementation()!
    request.mockImplementation(async (method, params) => {
      if (method === 'thread/read') await store.replace({ ...input, threadGroups: [] }, initial.revision)
      return original(method, params)
    })
    await expect(service.save(input, initial.revision)).rejects.toBeInstanceOf(BridgeRelationsConflictError)
    expect((await store.read()).threadGroups).toEqual([])
  })

  it('同步群更新名称与新群，保留已有群和全部关联', async () => {
    const { service, store, input } = await setup()
    await service.save(input, 0)
    mocks.credentials.mockResolvedValue({ appId: 'cli_test', appSecret: 'mock-only' })
    mocks.list.mockResolvedValueOnce({ code: 0, data: { items: [{ chat_id: 'oc_A', name: 'A renamed' }], has_more: true, page_token: 'next' } })
      .mockResolvedValueOnce({ code: 0, data: { items: [{ chat_id: 'oc_C', name: 'C' }], has_more: false } })
    const synced = await service.sync({ source: 'custom', appId: 'cli_test' })
    expect(synced.groups).toMatchObject([{ chatId: 'oc_A', name: 'A renamed' }, { chatId: 'oc_B', name: 'B' }, { chatId: 'oc_C', name: 'C' }])
    expect(synced.groups.every(group => typeof group.updatedAt === 'string')).toBe(true)
    expect(synced.projectGroups).toEqual(input.projectGroups.map(link => ({ ...link, active: true })))
    expect(synced.threadGroups).toEqual(input.threadGroups)
    expect(synced.revision).toBe(2)
    expect(mocks.list.mock.calls[1]).toEqual([{ params: { page_size: 100, page_token: 'next' } }])
    expect(await store.read()).toEqual(synced)
  })

  it('同步期间有并发关联提交时不能覆盖新关系', async () => {
    const { service, store, input } = await setup()
    await service.save(input, 0)
    mocks.credentials.mockResolvedValue({ appId: 'cli_test', appSecret: 'mock-only' })
    mocks.list.mockImplementationOnce(async () => {
      await store.replace({ ...input, threadGroups: input.threadGroups.filter(link => link.chatId !== 'oc_A') }, 1)
      return { code: 0, data: { items: [{ chat_id: 'oc_A', name: 'A renamed' }], has_more: false } }
    })
    await expect(service.sync({ source: 'custom', appId: 'cli_test' })).rejects.toBeInstanceOf(BridgeRelationsConflictError)
    expect((await store.read()).threadGroups).toEqual([input.threadGroups[1]])
  })

  it('飞书响应失败时不写盘，并隐藏远端错误详情', async () => {
    const { service, store, input } = await setup()
    await service.save(input, 0)
    const before = await readFile(store.path, 'utf8')
    mocks.credentials.mockResolvedValue({ appId: 'cli_test', appSecret: 'mock-only' })
    mocks.list.mockRejectedValueOnce(new Error('sensitive transport data'))
    await expect(service.sync({ source: 'custom', appId: 'cli_test' })).rejects.toThrow('Could not load Feishu groups; check bot permissions')
    expect(await readFile(store.path, 'utf8')).toBe(before)
  })
})
