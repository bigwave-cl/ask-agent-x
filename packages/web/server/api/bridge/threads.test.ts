import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { BridgeRelationsStore } from '@askx/core/bridge-relations'
import { BridgeGroupService } from '@askx/module-feishu-bridge/group-service'
import { BridgeProjectService } from '@askx/module-feishu-bridge/project-service'

/** 只模拟 Codex 执行边界，关系校验和持久化使用真实 owner。 */
const mocks = vi.hoisted(() => ({
    service: vi.fn(),
    manager: { startThread: vi.fn(), startTurn: vi.fn(), readConversation: vi.fn() },
}))
vi.mock('../../utils/bridge.js', () => ({ bridgeThreadSessionManager: mocks.manager }))
vi.mock('../../utils/bridge-settings.js', () => ({ getBridgeGroupService: mocks.service }))
/** 所有测试数据均保存在系统临时目录。 */
let directory = ''
afterEach(async () => {
    vi.resetAllMocks()
    vi.unstubAllGlobals()
    if (directory) await rm(directory, { recursive: true, force: true })
})

test('新建会话成功后首轮通过群组关联校验', async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), 'askx-web-create-thread-')))
    /** RPC 替身只提供当前隔离项目与已创建会话。 */
    const request = vi.fn(async (method: string) => {
        if (method === 'project/list') return { data: [{ id: 'project', roots: [{ path: directory }] }] }
        if (method === 'project/read') return { project: { roots: [{ path: directory }] } }
        return { thread: { id: 'new-thread', cwd: directory } }
    })
    const store = new BridgeRelationsStore(join(directory, 'relations'))
    const service = new BridgeGroupService(store, new BridgeProjectService({ request }), { request })
    await store.replace({ groups: [{ chatId: 'oc_test', name: 'Test' }], projectGroups: [{ chatId: 'oc_test', projectPath: directory, active: true }], threadGroups: [] }, 0)
    mocks.service.mockResolvedValue(service)
    mocks.manager.startThread.mockResolvedValue({ id: 'new-thread', cwd: directory })
    mocks.manager.startTurn.mockResolvedValue({ turnId: 'turn' })
    mocks.manager.readConversation.mockResolvedValue({ messages: [], turn: null })
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('readBody', (event: { body: unknown }) => event.body)
    vi.stubGlobal('getRouterParam', () => 'new-thread')
    vi.stubGlobal('createError', (value: { statusMessage: string }) => new Error(value.statusMessage))
    const { default: create } = await import('./threads.post')
    const { default: send } = await import('./threads/[threadId]/turn.post')
    const context = { chatId: 'oc_test', projectPath: directory }
    await expect(create({ body: context } as never)).resolves.toMatchObject({ id: 'new-thread' })
    expect((await store.read()).threadGroups).toEqual([{ ...context, threadId: 'new-thread' }])
    await expect(send({ body: { ...context, prompt: 'Hello', clientMessageId: 'client' } } as never)).resolves.toMatchObject({ turnId: 'turn' })
    expect(mocks.manager.startTurn).toHaveBeenCalledWith('new-thread', 'Hello', directory, 'client', expect.objectContaining(context))
})
