import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useBridgeSidebarGroupPreferences } from './useBridgeSidebarGroupPreferences'

/** 由测试控制客户端挂载时机。 */
const hooks = vi.hoisted(() => ({ mounted: [] as (() => void)[] }))
vi.mock('vue', async original => ({ ...await original<typeof import('vue')>(), onMounted: (callback: () => void) => hooks.mounted.push(callback) }))

/** 本次测试独享的浏览器存储。 */
let stored: string | null
/** 写入次数用于验证目录加载不会清空偏好。 */
const setItem = vi.fn((_key: string, value: string) => { stored = value })

beforeEach(() => {
    hooks.mounted = []
    stored = null
    setItem.mockClear()
    vi.stubGlobal('window', { localStorage: { getItem: () => stored, setItem } })
})
afterEach(() => vi.unstubAllGlobals())

describe('useBridgeSidebarGroupPreferences', () => {
    it('SSR 不读取浏览器存储，挂载后从异步空目录恢复顺序和折叠状态', () => {
        stored = JSON.stringify({ order: ['b', 'a'], collapsed: ['b'] })
        /** 首次请求尚未返回的群组目录。 */
        const groups = ref<{ chatId: string }[]>([])
        /** 当前会话页面的偏好实例。 */
        const owner = useBridgeSidebarGroupPreferences(groups)
        expect(owner.isGroupOpen('b')).toBe(true)
        hooks.mounted[0]!()
        expect(owner.orderedGroups.value).toEqual([])
        expect(setItem).not.toHaveBeenCalled()
        groups.value = [{ chatId: 'a' }, { chatId: 'b' }, { chatId: 'c' }]
        expect(owner.orderedGroups.value.map(group => group.chatId)).toEqual(['b', 'a', 'c'])
        expect(owner.isGroupOpen('b')).toBe(false)
        expect(owner.isGroupOpen('c')).toBe(true)
        groups.value = []
        expect(setItem).not.toHaveBeenCalled()
    })

    it('拖动与折叠写入身份，刷新及对象替换继续消费最新目录', () => {
        /** 目录对象携带更新标记便于确认不缓存旧对象。 */
        const groups = ref([{ chatId: 'a', name: '旧名称' }, { chatId: 'b', name: '乙' }])
        /** 初次页面实例。 */
        const first = useBridgeSidebarGroupPreferences(groups)
        hooks.mounted[0]!()
        first.orderedGroups.value = [...groups.value].reverse()
        first.setGroupOpen('a', false)
        expect(JSON.parse(stored!)).toEqual({ order: ['b', 'a'], collapsed: ['a'] })
        groups.value = [{ chatId: 'a', name: '新名称' }, { chatId: 'b', name: '乙' }]
        expect(first.orderedGroups.value[1]!.name).toBe('新名称')
        /** 刷新后新建实例从同一个存储恢复。 */
        const refreshed = useBridgeSidebarGroupPreferences(groups)
        hooks.mounted[1]!()
        expect(refreshed.orderedGroups.value.map(group => group.chatId)).toEqual(['b', 'a'])
        expect(refreshed.isGroupOpen('a')).toBe(false)
        refreshed.setGroupOpen('a', true)
        expect(JSON.parse(stored!).collapsed).toEqual([])
        groups.value = [{ chatId: 'a', name: '新名称' }]
        expect(refreshed.orderedGroups.value.map(group => group.chatId)).toEqual(['a'])
    })

    it('忽略过期拖动和重复身份，存储只包含顺序与折叠字段', () => {
        /** 当前最新目录。 */
        const groups = ref([{ chatId: 'a' }, { chatId: 'b' }])
        /** 页面偏好。 */
        const owner = useBridgeSidebarGroupPreferences(groups)
        hooks.mounted[0]!()
        owner.orderedGroups.value = [{ chatId: 'a' }]
        owner.orderedGroups.value = [{ chatId: 'a' }, { chatId: 'a' }]
        expect(setItem).not.toHaveBeenCalled()
        owner.orderedGroups.value = [...groups.value].reverse()
        expect(Object.keys(JSON.parse(stored!))).toEqual(['order', 'collapsed'])
    })

    it.each(['broken', 'null', '[]'])('损坏或无效存储 %s 使用默认状态', value => {
        stored = value
        /** 群组默认顺序。 */
        const groups = ref([{ chatId: 'a' }])
        /** 页面偏好。 */
        const owner = useBridgeSidebarGroupPreferences(groups)
        hooks.mounted[0]!()
        expect(owner.orderedGroups.value).toEqual(groups.value)
        expect(owner.isGroupOpen('a')).toBe(true)
    })

    it('存储读写被禁用时仍可排序与折叠', () => {
        vi.stubGlobal('window', { get localStorage() { throw new Error('blocked') } })
        /** 群组默认顺序。 */
        const groups = ref([{ chatId: 'a' }, { chatId: 'b' }])
        /** 页面偏好。 */
        const owner = useBridgeSidebarGroupPreferences(groups)
        expect(() => hooks.mounted[0]!()).not.toThrow()
        owner.orderedGroups.value = [...groups.value].reverse()
        owner.setGroupOpen('b', false)
        expect(owner.orderedGroups.value.map(group => group.chatId)).toEqual(['b', 'a'])
        expect(owner.isGroupOpen('b')).toBe(false)
    })
})
