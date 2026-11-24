import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'
import type { BridgeAgentCore } from '../../core/types'

/** 管理列表锁底、按钮分页锚点与异步正文布局，沿用 80px 阈值。 */
export function useMessageListRendering({ threadId, historyHub }: BridgeAgentCore) {
    /** 项目滚动组件公开接口。 */
    const scroll = ref<InstanceType<typeof ScrollArea> | null>(null)
    /** 用户是否正在阅读历史。 */
    const pinned = ref(true)
    /** 顶部分页的视觉锚点。 */
    let anchor: { height: number, top: number } | undefined
    /** 当前监听的视口。 */
    let viewport: HTMLElement | null = null
    /** 卸载后拒绝已排队的微任务继续调度动画帧。 */
    let disposed = false
    /** 仅记录当前会话尾部新增消息，避免历史和流式更新重播入场。 */
    const enteringKeys = ref<ReadonlySet<string>>(new Set())
    /** 本帧布局任务。 */
    let frame = 0
    /** 根据距底部距离判断是否自动跟随。 */
    function measure() { if (viewport) pinned.value = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80 }
    /** 渲染和折叠完成后，每帧最多校准一次。 */
    function resolveLayout() {
        if (disposed) return
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
            if (disposed || !viewport) return
            if (anchor && !historyHub.loadingMore.value) { viewport.scrollTop = anchor.top + viewport.scrollHeight - anchor.height; anchor = undefined }
            else if (!anchor && pinned.value) viewport.scrollTop = viewport.scrollHeight
        })
    }
    /** 保持分页前的第一条可见消息位置。 */
    function more() {
        if (viewport) anchor = { height: viewport.scrollHeight, top: viewport.scrollTop }
        void historyHub.loadHistory(true)
    }
    /** 用户主动回到最新消息后恢复跟随。 */
    function latest() { pinned.value = true; resolveLayout() }
    watch(
        () => ({ thread: threadId.value, keys: historyHub.messages.value.map(item => item.clientMessageId || item.id), loading: historyHub.loading.value, loadingMore: historyHub.loadingMore.value }),
        (current, previous) => {
            if (current.thread !== previous.thread || current.loading) enteringKeys.value = new Set()
            else if (!current.loading && !previous.loading && !current.loadingMore && !previous.loadingMore
              && current.keys.length > previous.keys.length
              && previous.keys.every((key, index) => current.keys[index] === key)) {
                enteringKeys.value = new Set([...enteringKeys.value, ...current.keys.slice(previous.keys.length)])
            }
        },
    )
    watch(threadId, () => { pinned.value = true; anchor = undefined; resolveLayout() })
    watch(historyHub.messages, () => { void nextTick(resolveLayout) }, { deep: true })
    watch(() => historyHub.loadingMore.value, value => { if (!value) void nextTick(resolveLayout) })
    onMounted(() => { viewport = scroll.value?.getViewportElement() ?? null; viewport?.addEventListener('scroll', measure, { passive: true }); resolveLayout() })
    onBeforeUnmount(() => { disposed = true; viewport?.removeEventListener('scroll', measure); viewport = null; anchor = undefined; cancelAnimationFrame(frame) })
    return { scroll, pinned, resolveLayout, more, latest, enteringKeys }
}
