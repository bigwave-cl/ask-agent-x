import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { BridgeConversationItem } from '@askx/module-feishu-bridge/conversation-contract'
import type { BridgeAgentCore } from '../../core/types'
import { useMessageListRendering } from './useMessageListRendering'

/** 捕获组件生命周期，隔离测试原生滚动事件。 */
const hooks = vi.hoisted(() => ({ mounted: [] as (() => void)[], cleanup: [] as (() => void)[] }))
vi.mock('vue', async original => ({
    ...await original<typeof import('vue')>(),
    onMounted: (callback: () => void) => hooks.mounted.push(callback),
    onBeforeUnmount: (callback: () => void) => hooks.cleanup.push(callback),
}))

afterEach(() => {
    hooks.cleanup.forEach(callback => callback())
    hooks.mounted.length = 0
    hooks.cleanup.length = 0
    vi.unstubAllGlobals()
})

describe('消息列表布局', () => {
    it('沿用 80px 锁底阈值、按钮分页锚点与生命周期清理', async () => {
        /** 可手动推进的浏览器动画帧。 */
        let pending: (() => void) | undefined
        vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { pending = callback; return 1 })
        vi.stubGlobal('cancelAnimationFrame', () => { pending = undefined })
        /** 简化原生滚动视口。 */
        const viewport = { scrollHeight: 1000, scrollTop: 800, clientHeight: 200, addEventListener: vi.fn(), removeEventListener: vi.fn() }
        /** 历史 owner 的分页状态。 */
        const loadingMore = ref(false)
        /** 受控分页请求。 */
        const loadHistory = vi.fn(() => { loadingMore.value = true; return Promise.resolve() })
        /** 测试只提供 helper 实际消费的 Core 接口。 */
        const core = { threadId: ref('one'), historyHub: { messages: ref([]), loading: ref(false), loadingMore, loadHistory } } as unknown as BridgeAgentCore
        /** 布局控制器。 */
        const layout = useMessageListRendering(core)
        layout.scroll.value = { getViewportElement: () => viewport } as unknown as NonNullable<typeof layout.scroll.value>
        hooks.mounted.forEach(callback => callback())
        pending?.()
        expect(viewport.scrollTop).toBe(1000)
        /** 原生滚动监听。 */
        const measure = viewport.addEventListener.mock.calls[0]![1] as () => void
        viewport.scrollTop = 720
        measure()
        expect(layout.pinned.value).toBe(false)
        viewport.scrollTop = 721
        measure()
        expect(layout.pinned.value).toBe(true)
        viewport.scrollTop = 100
        measure()
        expect(loadHistory).not.toHaveBeenCalled()
        layout.more()
        expect(loadHistory).toHaveBeenCalledExactlyOnceWith(true)
        viewport.scrollHeight = 1500
        loadingMore.value = false
        await nextTick()
        await nextTick()
        pending?.()
        expect(viewport.scrollTop).toBe(600)
        layout.latest()
        pending?.()
        expect(viewport.scrollTop).toBe(1500)
        hooks.cleanup.forEach(callback => callback())
        expect(viewport.removeEventListener).toHaveBeenCalledWith('scroll', measure)
    })
    it('卸载后丢弃已排队的 nextTick 和渲染完成通知', async () => {
        /** 帧调度用于确认卸载后没有再次调用。 */
        const schedule = vi.fn(() => 1)
        vi.stubGlobal('requestAnimationFrame', schedule)
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        /** 可触发异步布局的消息快照。 */
        const messages = ref<BridgeConversationItem[]>([])
        /** helper 所需的受控 Core。 */
        const core = { threadId: ref('one'), historyHub: { messages, loading: ref(false), loadingMore: ref(false), loadHistory: vi.fn() } } as unknown as BridgeAgentCore
        /** 布局控制器。 */
        const layout = useMessageListRendering(core)
        messages.value = [{ id: 'new' } as BridgeConversationItem]
        await nextTick()
        hooks.cleanup.forEach(callback => callback())
        schedule.mockClear()
        await nextTick()
        layout.resolveLayout()
        expect(schedule).not.toHaveBeenCalled()
    })

    it('只标记尾部新增消息，历史首载、分页、流式更新和确认 ID 均不重播', async () => {
        vi.stubGlobal('requestAnimationFrame', () => 1)
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        /** 模拟历史和会话 owner 的受控状态。 */
        const messages = ref<BridgeConversationItem[]>([])
        /** 首屏历史加载状态。 */
        const loading = ref(true)
        /** 分页请求状态。 */
        const loadingMore = ref(false)
        /** 当前线程身份。 */
        const threadId = ref('one')
        /** 构造只涉及列表身份的标准测试项。 */
        function item(id: string, clientMessageId?: string) { return { id, clientMessageId, content: '' } as BridgeConversationItem }
        /** 受控 Core 最小消费接口。 */
        const core = { threadId, historyHub: { messages, loading, loadingMore, loadHistory: vi.fn() } } as unknown as BridgeAgentCore
        /** 布局控制器。 */
        const layout = useMessageListRendering(core)
        messages.value = [item('history')]
        loading.value = false
        await nextTick()
        expect([...layout.enteringKeys.value]).toEqual([])
        messages.value = [...messages.value, item('optimistic', 'client')]
        await nextTick()
        expect([...layout.enteringKeys.value]).toEqual(['client'])
        messages.value = [item('history'), item('confirmed', 'client')]
        await nextTick()
        messages.value[1]!.content = 'stream'
        await nextTick()
        expect([...layout.enteringKeys.value]).toEqual(['client'])
        loadingMore.value = true
        await nextTick()
        messages.value = [item('older'), ...messages.value]
        loadingMore.value = false
        await nextTick()
        expect([...layout.enteringKeys.value]).toEqual(['client'])
        threadId.value = 'two'
        messages.value = [item('other-history')]
        await nextTick()
        expect([...layout.enteringKeys.value]).toEqual([])
    })
})
