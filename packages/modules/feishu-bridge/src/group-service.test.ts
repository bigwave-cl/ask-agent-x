import { mkdtemp, mkdir, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BridgeRelationsConflictError, BridgeRelationsStore, type BridgeRelationsInput } from '@askx/core/bridge-relations'
import { BridgeGroupService } from './group-service.js'
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
    if (method === 'project/list') return { data: [{ id: 'project-1', name: 'Demo', roots: [{ path: projectPath }] }], nextCursor: null }
    if (method === 'project/read') return { project: { id: 'project-1', roots: [{ path: projectPath }] } }
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
    const invalid = { ...input, projectGroups: [{ chatId: 'oc_A', projectPath: otherPath }], threadGroups: [] }
    await expect(service.save(invalid, 1)).rejects.toThrow('Unknown Codex project')
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

  it('同步群更新名称与新群，保留已有群和全部关联', async () => {
    const { service, store, input } = await setup()
    await service.save(input, 0)
    mocks.credentials.mockResolvedValue({ appId: 'cli_test', appSecret: 'mock-only' })
    mocks.list.mockResolvedValueOnce({ code: 0, data: { items: [{ chat_id: 'oc_A', name: 'A renamed' }], has_more: true, page_token: 'next' } })
      .mockResolvedValueOnce({ code: 0, data: { items: [{ chat_id: 'oc_C', name: 'C' }], has_more: false } })
    const synced = await service.sync({ source: 'custom', appId: 'cli_test' })
    expect(synced.groups).toEqual([{ chatId: 'oc_A', name: 'A renamed' }, { chatId: 'oc_B', name: 'B' }, { chatId: 'oc_C', name: 'C' }])
    expect(synced.projectGroups).toEqual(input.projectGroups)
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
