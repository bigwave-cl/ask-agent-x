import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isReadonly } from 'vue'
import type { BridgeSessionCatalog } from '@askx/module-feishu-bridge/session-catalog'
import type { BridgeProject } from '@askx/module-feishu-bridge/project-service'
import { useBridgeCatalog } from './useBridgeCatalog'

/** 测试独占的挂载与卸载回调。 */
const hooks = vi.hoisted(() => ({ mounted: [] as (() => void)[], unmounted: [] as (() => void)[] }))
vi.mock('vue', async importOriginal => ({ ...await importOriginal<typeof import('vue')>(), onMounted: (callback: () => void) => hooks.mounted.push(callback), onUnmounted: (callback: () => void) => hooks.unmounted.push(callback) }))
/** 构造目录项目。 */
function project(path: string): BridgeProject { return { projectId: path, name: path, path } }
/** 包含有效项目与历史项目的服务端目录。 */
function catalog(): BridgeSessionCatalog {
    return { revision: 3, groups: [{ chatId: 'group', name: '群', activeProject: project('/active'), projects: [
        { project: project('/active'), active: true, available: true, sessions: [{ id: 'thread', title: '原名称', cwd: '/active', projectId: '/active', gitInfo: null, updatedAt: null, createdAt: null }] },
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
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('useBridgeCatalog', () => {
    it('侧栏按每项目首条会话排序，无效时间置末且同时间稳定，保留原目录和选择', async () => {
        /** 包含首条时间与后续会话时间不一致的目录。 */
        const result = catalog()
        /** 完整会话摘要模板。 */
        const summary = result.groups[0]!.projects[0]!.sessions[0]!
        result.groups[0]!.projects = [
            { project: project('/active'), active: true, available: true, sessions: [{ ...summary, updatedAt: '2026-01-01T00:00:00Z' }, { ...summary, id: 'later', updatedAt: '2026-12-01T00:00:00Z' }] },
            { project: project('/empty'), active: false, available: true, sessions: [] },
            { project: project('/recent'), active: false, available: true, sessions: [{ ...summary, updatedAt: '2026-02-01T00:00:00Z' }] },
            { project: project('/tie'), active: false, available: true, sessions: [{ ...summary, updatedAt: '2026-02-01T00:00:00Z' }] },
            { project: project('/invalid'), active: false, available: true, sessions: [{ ...summary, updatedAt: 'invalid' }] },
            { project: project('/null'), active: false, available: true, sessions: [{ ...summary, updatedAt: null }] },
            { project: project('/missing'), active: false, available: true, sessions: [{ ...summary }] },
        ]
        Reflect.deleteProperty(result.groups[0]!.projects[6]!.sessions[0]!, 'updatedAt')
        /** 原始目录快照。 */
        const snapshot = structuredClone(result)
        vi.stubGlobal('$fetch', vi.fn(async (url: string) => url.endsWith('/catalog') ? result : { projects: [] }))
        /** 当前页面目录。 */
        const owner = useBridgeCatalog()
        hooks.mounted[0]!()
        await owner.loadCatalog()
        owner.selectThread('group', '/active', 'thread')
        expect(owner.sidebarGroups.value[0]!.projects.map(entry => entry.project.path)).toEqual(['/recent', '/tie', '/active', '/empty', '/invalid', '/null', '/missing'])
        expect(result).toEqual(snapshot)
        expect(owner.catalog.value.groups[0]!.projects.map(entry => entry.project.path)).toEqual(snapshot.groups[0]!.projects.map(entry => entry.project.path))
        expect(owner.selectedProject.value?.path).toBe('/active')
        expect(owner.selectedThreadId.value).toBe('thread')
        expect(isReadonly(owner.sidebarGroups)).toBe(true)
        expect(isReadonly(owner.sidebarGroups.value[0]!.projects)).toBe(true)

        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-11-25T00:00:00Z'))
        owner.acceptThread({ id: 'new', title: '新会话' })
        expect(owner.selectedThread.value?.updatedAt).toBe('2026-11-25T00:00:00.000Z')
        expect(owner.sidebarGroups.value[0]!.projects[0]!.project.path).toBe('/active')
        /** 显式传入非法时间的摘要保持在有效时间项目之后。 */
        owner.selectProject('/empty')
        owner.acceptThread({ id: 'missing', title: '缺失时间', updatedAt: 'invalid' })
        expect(owner.sidebarGroups.value[0]!.projects.map(entry => entry.project.path)).toEqual(['/active', '/recent', '/tie', '/empty', '/invalid', '/null', '/missing'])
        /** 服务端刷新替换本地摘要，按最新首条会话重新排序。 */
        const refreshed = structuredClone(snapshot)
        refreshed.groups[0]!.projects[2]!.sessions[0]!.updatedAt = '2027-01-01T00:00:00Z'
        vi.stubGlobal('$fetch', vi.fn(async (url: string) => url.endsWith('/catalog') ? refreshed : { projects: [] }))
        await owner.loadCatalog()
        expect(owner.sidebarGroups.value[0]!.projects[0]!.project.path).toBe('/recent')
    })

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
        owner.selectThread(group.chatId, entry.project.path, entry.sessions[0]!.id)
        await owner.loadCatalog()
        expect(owner.selectedThread.value?.id).toBe('thread')
        owner.updateThreadTitle('thread', '新名称')
        expect(owner.selectedThread.value?.title).toBe('新名称')
        owner.selectProject('/history')
        expect(owner.selectedProjectEntry.value?.available).toBe(false)
        owner.selectNewThread()
        owner.acceptThread({ id: 'new', title: '新会话' })
        expect(owner.selectedProject.value?.path).toBe('/active')
        expect(owner.selectedThread.value?.id).toBe('new')
    })

    it('当前会话归档由owner清理，其他会话归档保留当前选择，输出均只读', async () => {
        /** 当前页面目录。 */
        const owner = useBridgeCatalog()
        hooks.mounted[0]!()
        await owner.loadCatalog()
        expect(owner.selectThread('group', '/active', 'thread')).toBe(true)
        expect(owner.archiveThread('other')).toBe(false)
        expect(owner.selectedThreadId.value).toBe('thread')
        /** Vue 只读代理拒绝调用方绕过 owner 写入身份和目录。 */
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        Reflect.set(owner.selectedThreadId, 'value', 'injected')
        Reflect.set(owner.catalog.value.groups[0]!, 'chatId', 'injected')
        expect(owner.selectedThreadId.value).toBe('thread')
        expect(owner.catalog.value.groups[0]!.chatId).toBe('group')
        warning.mockRestore()
        expect(owner.archiveThread('thread')).toBe(true)
        expect(owner.selectedThreadId.value).toBe('')
        for (const value of [owner.catalog, owner.catalog.value, owner.catalog.value.groups, owner.projectOptions, owner.selectedChatId, owner.selectedProjectPath, owner.selectedThreadId, owner.selectedGroup, owner.selectedProjectEntry, owner.selectedProject, owner.selectedThread]) expect(isReadonly(value)).toBe(true)
    })

    it('目录刷新删除会话或使项目失效后拒绝旧身份选择', async () => {
        /** 当前页面目录。 */
        const owner = useBridgeCatalog()
        hooks.mounted[0]!()
        await owner.loadCatalog()
        /** 刷新后会话已不存在。 */
        const removed = catalog()
        removed.groups[0]!.projects[0]!.sessions = []
        vi.stubGlobal('$fetch', vi.fn(async (url: string) => url.endsWith('/catalog') ? removed : { projects: [] }))
        await owner.loadCatalog()
        expect(owner.selectThread('group', '/active', 'thread')).toBe(false)
        /** 会话仍存在但项目不可用。 */
        const unavailable = catalog()
        unavailable.groups[0]!.projects[0]!.available = false
        vi.stubGlobal('$fetch', vi.fn(async (url: string) => url.endsWith('/catalog') ? unavailable : { projects: [] }))
        await owner.loadCatalog()
        expect(owner.selectThread('group', '/active', 'thread')).toBe(false)
        expect(owner.selectedThreadId.value).toBe('')
    })

    it('卸载后不提交未完成的目录响应', async () => {
        /** 手动完成的目录请求。 */
        let resolve!: (value: BridgeSessionCatalog) => void
        /** 延迟目录响应。 */
        const pending = new Promise<BridgeSessionCatalog>(done => { resolve = done })
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
