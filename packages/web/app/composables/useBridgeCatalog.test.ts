import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBridgeCatalog, type BridgeCatalog, type BridgeProject } from './useBridgeCatalog'

/** 测试独占的挂载与卸载回调。 */
const hooks = vi.hoisted(() => ({ mounted: [] as (() => void)[], unmounted: [] as (() => void)[] }))
vi.mock('vue', async importOriginal => ({ ...await importOriginal<typeof import('vue')>(), onMounted: (callback: () => void) => hooks.mounted.push(callback), onUnmounted: (callback: () => void) => hooks.unmounted.push(callback) }))
/** 构造目录项目。 */
function project(path: string): BridgeProject { return { projectId: path, name: path, path } }
/** 包含有效项目与历史项目的服务端目录。 */
function catalog(): BridgeCatalog {
    return { revision: 3, groups: [{ chatId: 'group', name: '群', activeProject: project('/active'), projects: [
        { project: project('/active'), active: true, available: true, sessions: [{ id: 'thread', title: '原名称' }] },
        { project: project('/history'), active: false, available: false, sessions: [] },
    ] }] }
}

beforeEach(() => {
    hooks.mounted = []
    hooks.unmounted = []
    vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
    vi.stubGlobal('useToast', () => ({ dismiss: vi.fn(), error: vi.fn() }))
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => url.endsWith('/catalog') ? catalog() : { projects: [project('/active'), project('/other')] }))
})
afterEach(() => vi.unstubAllGlobals())

describe('useBridgeCatalog', () => {
    it('统一合并当前项目与不可用历史项目，并保留会话选择和名称更新', async () => {
        /** 当前页面目录。 */
        const owner = useBridgeCatalog()
        hooks.mounted[0]!()
        await owner.loadCatalog()
        expect(owner.projectOptions.value.map(item => [item.path, item.available])).toEqual([['/active', true], ['/other', true], ['/history', false]])
        /** 当前群及项目记录。 */
        const group = owner.catalog.value.groups[0]!
        /** 当前可写项目。 */
        const entry = group.projects[0]!
        owner.selectThread(group, entry, entry.sessions[0]!)
        await owner.loadCatalog()
        expect(owner.selectedThread.value?.id).toBe('thread')
        owner.updateThreadTitle('thread', '新名称')
        expect(owner.selectedThread.value?.title).toBe('新名称')
        owner.selectProject(owner.catalog.value.groups[0]!.projects[1]!)
        expect(owner.selectedProjectEntry.value?.available).toBe(false)
        owner.selectNewThread()
        owner.acceptThread({ id: 'new', title: '新会话' })
        expect(owner.selectedProject.value?.path).toBe('/active')
        expect(owner.selectedThread.value?.id).toBe('new')
    })

    it('卸载后不提交未完成的目录响应', async () => {
        /** 手动完成的目录请求。 */
        let resolve!: (value: BridgeCatalog) => void
        /** 延迟目录响应。 */
        const pending = new Promise<BridgeCatalog>(done => { resolve = done })
        vi.stubGlobal('$fetch', vi.fn((url: string) => url.endsWith('/catalog') ? pending : Promise.resolve({ projects: [] })))
        /** 当前页面目录。 */
        const owner = useBridgeCatalog()
        hooks.mounted[0]!()
        /** 等待中的刷新。 */
        const request = owner.loadCatalog()
        hooks.unmounted[0]!()
        resolve(catalog())
        await request
        expect(owner.catalog.value.groups).toEqual([])
        expect(owner.projectOptions.value).toEqual([])
        expect(owner.catalogLoading.value).toBe(false)
        /** 卸载后的刷新不能再发起请求。 */
        const fetchCount = vi.mocked($fetch).mock.calls.length
        await owner.loadCatalog()
        expect(vi.mocked($fetch).mock.calls).toHaveLength(fetchCount)
    })
})
