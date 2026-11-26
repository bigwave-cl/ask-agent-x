import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { BridgeRelationsStore } from '@askx/core/bridge-relations'
import { BridgeGroupService } from '@askx/module-feishu-bridge/group-service'
import { BridgeProjectService } from '@askx/module-feishu-bridge/project-service'

/** 接口测试通过临时目录中的真实关系服务读写。 */
const provideService = vi.hoisted(() => vi.fn())
vi.mock('../../utils/bridge-settings.js', () => ({ getBridgeGroupService: provideService }))

test('群组管理全量保存后保留共享偏好，过期或无效的侧栏操作返回对应状态码', async () => {
    /** 当前用例独占的关系目录。 */
    const directory = await mkdtemp(join(tmpdir(), 'askx-sidebar-api-'))
    try {
        /** 临时文件的真实关系存储。 */
        const store = new BridgeRelationsStore(directory)
        /** 记录偏好操作是否误触发外部调用。 */
        const rpc = { request: vi.fn() }
        provideService.mockResolvedValue(new BridgeGroupService(store, new BridgeProjectService(rpc), rpc))
        vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
        vi.stubGlobal('readBody', (event: { body: unknown }) => event.body)
        vi.stubGlobal('readValidatedBody', (event: { body: unknown }, validate: (value: unknown) => unknown) => validate(event.body))
        vi.stubGlobal('createError', (options: { statusCode: number, statusMessage: string }) => Object.assign(new Error(options.statusMessage), options))
        /** 偏好增量更新接口。 */
        const { default: update } = await import('./sidebar-preferences.patch')
        /** 读取偏好快照的接口。 */
        const { default: get } = await import('./sidebar-preferences.get')
        /** 复用群组管理页使用的全量保存接口。 */
        const { default: replace } = await import('./groups.put')
        await store.replace({ groups: [{ chatId: 'oc_A', name: 'A' }], projectGroups: [], threadGroups: [] }, 0)
        expect(await get({} as never)).toEqual({ revision: 1, preferences: null })
        /** 折叠目标群组的操作。 */
        const operation = { type: 'open', chatId: 'oc_A', open: false }
        await update({ body: { revision: 1, operation } } as never)
        /** 模拟管理页根据上一次读取结果构造的草稿。 */
        const draft = await store.read()
        draft.groups[0]!.name = 'New name'
        draft.sidebarPreferences = { order: [], collapsed: [] }
        await replace({ body: draft } as never)
        await expect(update({ body: { revision: 2, operation } } as never)).rejects.toMatchObject({ statusCode: 409 })
        await expect(update({ body: { revision: 3, operation: { ...operation, chatId: 'oc_unknown' } } } as never)).rejects.toMatchObject({ statusCode: 400 })
        expect(await get({} as never)).toEqual({ revision: 3, preferences: { order: [], collapsed: ['oc_A'] } })
        expect(rpc.request).not.toHaveBeenCalled()
    }
    finally {
        vi.unstubAllGlobals()
        provideService.mockReset()
        await rm(directory, { recursive: true, force: true })
    }
})
