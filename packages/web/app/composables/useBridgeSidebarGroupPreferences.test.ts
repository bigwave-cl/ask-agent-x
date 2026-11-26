import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useBridgeSidebarGroupPreferences } from './useBridgeSidebarGroupPreferences'

/** 测试生命周期入口。 */
const hooks = vi.hoisted(() => ({ mounted: [] as (() => void)[], unmounted: [] as (() => void)[] }))
vi.mock('vue', async original => ({ ...await original<typeof import('vue')>(), onMounted: (callback: () => void) => hooks.mounted.push(callback), onUnmounted: (callback: () => void) => hooks.unmounted.push(callback) }))
/** 接口调用与用户错误提示。 */
const fetcher = vi.fn()
/** 失败反馈。 */
const error = vi.fn()
/** 旧浏览器偏好。 */
let stored: string | null
/** 共享状态。 */
let server: { revision: number, preferences: { order: string[], collapsed: string[] } | null }
/** 等待串行事务收敛。 */
async function settle(): Promise<void> { for (let i = 0; i < 35; i++) await Promise.resolve() }
/** 当前群组目录。 */
function groups() { return ref([{ chatId: 'oc_a' }, { chatId: 'oc_b' }]) }

beforeEach(() => {
    hooks.mounted = []; hooks.unmounted = []; stored = null
    server = { revision: 0, preferences: null }
    error.mockReset(); fetcher.mockReset()
    vi.stubGlobal('useToast', () => ({ error }))
    vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
    vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: { getItem: () => stored, removeItem: () => { stored = null } } }))
    fetcher.mockImplementation(async (_url, options) => {
        if (!options) return structuredClone(server)
        /** 本次操作保持独立，模拟服务端共享更新。 */
        const op = options.body.operation
        if (op.type === 'migrate') server.preferences ??= op.preferences
        if (op.type === 'order') server.preferences = { order: op.order, collapsed: server.preferences?.collapsed ?? [] }
        if (op.type === 'open') server.preferences = { order: server.preferences?.order ?? [], collapsed: [...(server.preferences?.collapsed ?? []).filter(id => id !== op.chatId), ...(!op.open ? [op.chatId] : [])] }
        server.revision++
        return structuredClone(server)
    })
    vi.stubGlobal('$fetch', fetcher)
})
afterEach(() => { for (const callback of hooks.unmounted) callback(); vi.unstubAllGlobals() })

describe('共享群组侧栏偏好', () => {
    it('空白浏览器只读取，不抢占迁移初始化', async () => {
        useBridgeSidebarGroupPreferences(groups()); hooks.mounted[0]!(); await settle()
        expect(fetcher).toHaveBeenCalledTimes(1)
        expect(server.preferences).toBeNull()
    })
    it('旧偏好首次迁移后删除旧键，异步目录使用最新对象', async () => {
        stored = JSON.stringify({ order: ['oc_b', 'oc_a'], collapsed: ['oc_a'] })
        /** 目录异步返回。 */
        const directory = ref<{ chatId: string }[]>([])
        /** 页面 owner。 */
        const owner = useBridgeSidebarGroupPreferences(directory)
        hooks.mounted[0]!(); await settle()
        directory.value = groups().value
        expect(owner.orderedGroups.value.map(group => group.chatId)).toEqual(['oc_b', 'oc_a'])
        expect(owner.isGroupOpen('oc_a')).toBe(false)
        expect(stored).toBeNull()
    })
    it('共享已有值时采用共享并清旧键，焦点恢复可读取其他页面修改', async () => {
        server.preferences = { order: ['oc_b', 'oc_a'], collapsed: [] }
        stored = JSON.stringify({ order: ['oc_a'], collapsed: ['oc_a'] })
        /** 当前页面。 */
        const owner = useBridgeSidebarGroupPreferences(groups())
        hooks.mounted[0]!(); await settle()
        expect(stored).toBeNull()
        expect(owner.isGroupOpen('oc_a')).toBe(true)
        server.preferences.collapsed = ['oc_b']
        window.dispatchEvent(new Event('focus')); await settle()
        expect(owner.isGroupOpen('oc_b')).toBe(false)
    })
    it('快速排序和折叠在初始化读取期间保持操作顺序', async () => {
        /** 当前页面。 */
        const directory = groups()
        /** 偏好 owner。 */
        const owner = useBridgeSidebarGroupPreferences(directory)
        hooks.mounted[0]!()
        owner.orderedGroups.value = [...directory.value].reverse()
        owner.setGroupOpen('oc_a', false)
        owner.setGroupOpen('oc_b', false)
        expect(owner.isGroupOpen('oc_b')).toBe(false)
        await settle()
        expect(server.preferences).toEqual({ order: ['oc_b', 'oc_a'], collapsed: ['oc_a', 'oc_b'] })
    })
    it('冲突重新读取并重放单群操作，保留其他浏览器的折叠', async () => {
        server.preferences = { order: ['oc_a', 'oc_b'], collapsed: [] }
        /** 当前 owner。 */
        const owner = useBridgeSidebarGroupPreferences(groups())
        hooks.mounted[0]!(); await settle()
        /** 原始服务响应实现。 */
        fetcher.mockImplementationOnce(async () => {
            server.preferences!.collapsed = ['oc_b']; server.revision++
            throw { statusCode: 409 }
        })
        owner.setGroupOpen('oc_a', false); await settle()
        expect(server.preferences!.collapsed).toEqual(['oc_b', 'oc_a'])
    })
    it('失败保留旧迁移来源并提示，卸载后不再提交', async () => {
        stored = JSON.stringify({ order: ['oc_b'], collapsed: [] })
        /** GET 成功但 PATCH 失败。 */
        const normal = fetcher.getMockImplementation()!
        fetcher.mockImplementationOnce(normal).mockRejectedValueOnce(new Error('offline'))
        useBridgeSidebarGroupPreferences(groups()); hooks.mounted[0]!(); await settle()
        expect(stored).not.toBeNull(); expect(error).toHaveBeenCalledOnce()
        hooks.unmounted[0]!()
        fetcher.mockClear(); window.dispatchEvent(new Event('focus')); await settle()
        expect(fetcher).not.toHaveBeenCalled()
    })
    it('卸载使等待中的读取失效，迟到响应不能迁移或写入', async () => {
        stored = JSON.stringify({ order: ['oc_b'], collapsed: [] })
        /** 手动释放的读取响应。 */
        let resolveRead!: (value: typeof server) => void
        fetcher.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve }))
        useBridgeSidebarGroupPreferences(groups()); hooks.mounted[0]!()
        hooks.unmounted[0]!(); resolveRead(server); await settle()
        expect(fetcher).toHaveBeenCalledTimes(1)
        expect(stored).not.toBeNull()
    })
    it('拒绝残缺或重复排序，保存失败回到已确认的共享状态', async () => {
        server.preferences = { order: ['oc_a', 'oc_b'], collapsed: [] }
        /** 当前目录。 */
        const directory = groups()
        /** 当前 owner。 */
        const owner = useBridgeSidebarGroupPreferences(directory)
        hooks.mounted[0]!(); await settle(); fetcher.mockClear()
        owner.orderedGroups.value = [directory.value[0]!]
        owner.orderedGroups.value = [directory.value[0]!, directory.value[0]!]
        expect(fetcher).not.toHaveBeenCalled()
        /** GET 仍成功，但保存操作失败。 */
        fetcher.mockRejectedValueOnce(new Error('offline'))
        owner.setGroupOpen('oc_a', false)
        expect(owner.isGroupOpen('oc_a')).toBe(false)
        await settle()
        expect(owner.isGroupOpen('oc_a')).toBe(true)
        expect(error).toHaveBeenCalledOnce()
    })
    it('确认快照后同一 tick 直接发送 PATCH，卸载后迟到响应不修改显示', async () => {
        server.preferences = { order: ['oc_a', 'oc_b'], collapsed: [] }
        /** 当前页面 owner。 */
        const owner = useBridgeSidebarGroupPreferences(groups())
        hooks.mounted[0]!(); await settle(); fetcher.mockClear()
        /** 控制保存响应晚于卸载。 */
        let resolveSave!: (value: typeof server) => void
        fetcher.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve }))
        owner.setGroupOpen('oc_a', false)
        expect(fetcher).toHaveBeenCalledTimes(1)
        expect(fetcher.mock.calls[0]![1].method).toBe('PATCH')
        hooks.unmounted[0]!()
        resolveSave(server); await settle()
        expect(owner.isGroupOpen('oc_a')).toBe(false)
    })
    it('空目录暂不消费迁移，群组加载后重试旧偏好', async () => {
        stored = JSON.stringify({ order: ['oc_b', 'oc_a'], collapsed: ['oc_a'] })
        /** 初始群组尚未同步。 */
        const directory = ref<{ chatId: string }[]>([])
        /** 保留默认 GET 与后续迁移实现。 */
        const normal = fetcher.getMockImplementation()!
        fetcher.mockImplementationOnce(normal).mockImplementationOnce(async () => structuredClone(server))
        /** 当前页面 owner。 */
        const owner = useBridgeSidebarGroupPreferences(directory)
        hooks.mounted[0]!(); await settle()
        expect(stored).not.toBeNull()
        directory.value = groups().value; await settle()
        expect(stored).toBeNull()
        expect(owner.isGroupOpen('oc_a')).toBe(false)
        expect(owner.orderedGroups.value.map(group => group.chatId)).toEqual(['oc_b', 'oc_a'])
    })
})
