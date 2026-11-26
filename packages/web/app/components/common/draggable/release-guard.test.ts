import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDragReleaseGuard } from './useDragReleaseGuard'

/** 测试事件使用递增时间，以便明确验证旧事件与新手势的关系。 */
let timestamp = 0
/** 测试结束后释放当前临时监听。 */
let cleanup: (() => void) | undefined

/** 构造具有真实输入身份的浏览器事件。 */
function input(type: string, pointerId = 1, extra: Record<string, unknown> = {}): Event {
    /** 事件字段与 PointerEvent 默认值保持一致。 */
    const event = Object.assign(new Event(type), { pointerId, pointerType: 'mouse', button: 0, buttons: type.endsWith('up') ? 0 : 1, ...extra })
    Object.defineProperty(event, 'timeStamp', { value: ++timestamp })
    return event
}

/** 等待整轮原生事件传播后执行的检查，不能用监听器间也会执行的微任务代替。 */
async function settle(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0))
}

/** 原生 EventTarget 保留真实监听顺序，模拟官方拥有和释放 dragged 的边界。 */
function createHarness() {
    /** 当前官方实例是否仍持有手势。 */
    let owned = true
    /** 当前文档和窗口。 */
    const document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    /** 当前窗口支持失焦和卸载事件。 */
    const window = new EventTarget()
    vi.stubGlobal('document', document)
    vi.stubGlobal('window', window)
    /** 官方正常结束次数。 */
    const end = vi.fn(() => { owned = false })
    /** 异常终止必须通过组件的销毁入口。 */
    const abort = vi.fn(() => { owned = false })
    /** 实际生产代码中的保护器。 */
    const guard = useDragReleaseGuard(() => owned, abort)
    cleanup = guard.clear
    return { document, window, guard, abort, end, release: () => { owned = false }, own: () => { owned = true } }
}

afterEach(() => {
    cleanup?.()
    cleanup = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('插入线手势异常释放保护', () => {
    it('捕获与官方冒泡处理器之间运行微任务时，不提前清除布防或中止合法释放', async () => {
        /** 当前手势 owner。 */
        const harness = createHarness()
        harness.release()
        harness.guard.arm(input('pointerdown', 4))
        await Promise.resolve()
        expect(harness.guard.matches(input('pointermove', 4))).toBe(true)
        harness.own()
        await settle()
        harness.document.dispatchEvent(input('pointerup', 4))
        await Promise.resolve()
        expect(harness.abort).not.toHaveBeenCalled()
        harness.release()
        await settle()
        expect(harness.abort).not.toHaveBeenCalled()
    })

    it('丢失 mouseup 后回到窗口 buttons=0 时中止，随后新手势仍可正常释放', async () => {
        /** 当前手势 owner。 */
        const harness = createHarness()
        harness.guard.arm(input('pointerdown'))
        await settle()
        harness.document.dispatchEvent(input('pointermove', 1, { buttons: 0 }))
        expect(harness.abort).toHaveBeenCalledTimes(1)
        harness.own()
        harness.guard.arm(input('pointerdown', 2))
        harness.document.addEventListener('pointerup', harness.end)
        harness.document.dispatchEvent(input('pointerup', 2))
        await settle()
        expect(harness.end).toHaveBeenCalledTimes(1)
        expect(harness.abort).toHaveBeenCalledTimes(1)
    })

    it.each(['blur', 'pagehide', 'visibilitychange'])('%s 中止包括尚未 choose 的 delay 窗口', async type => {
        vi.useFakeTimers()
        /** 当前手势 owner。 */
        const harness = createHarness()
        /** 模拟官方延迟启动任务，组件中止入口负责 destroy 并清除它。 */
        const start = vi.fn()
        /** 当前延迟任务。 */
        const timer = setTimeout(start, 180)
        harness.abort.mockImplementation(() => { clearTimeout(timer); harness.release() })
        harness.guard.arm(input('pointerdown'))
        if (type === 'visibilitychange') {
            harness.document.visibilityState = 'hidden'
            harness.document.dispatchEvent(new Event(type))
        }
        else harness.window.dispatchEvent(new Event(type))
        await vi.advanceTimersByTimeAsync(300)
        expect(harness.abort).toHaveBeenCalledTimes(1)
        expect(start).not.toHaveBeenCalled()
    })

    it('另一指针释放不结束当前指针，合法释放及其 lostpointercapture 不取消提交', async () => {
        /** 当前手势 owner。 */
        const harness = createHarness()
        harness.guard.arm(input('pointerdown', 4))
        harness.document.addEventListener('pointerup', harness.end)
        harness.document.dispatchEvent(input('pointerup', 9))
        expect(harness.end).not.toHaveBeenCalled()
        harness.document.dispatchEvent(input('pointerup', 4))
        harness.document.dispatchEvent(input('lostpointercapture', 4))
        harness.window.dispatchEvent(new Event('blur'))
        await settle()
        expect(harness.end).toHaveBeenCalledTimes(1)
        expect(harness.abort).not.toHaveBeenCalled()
    })

    it('只拦截官方会消费的干扰事件，不拦截兼容移动或无关捕获事件', async () => {
        /** 当前手势 owner。 */
        const harness = createHarness()
        /** 其他界面仍可观察未被官方消费的兼容鼠标移动。 */
        const otherMove = vi.fn()
        harness.guard.arm(input('pointerdown', 4))
        harness.document.addEventListener('mousemove', otherMove)
        harness.document.addEventListener('pointerup', harness.end)
        harness.document.dispatchEvent(input('mousemove', 1, { buttons: 0 }))
        harness.document.dispatchEvent(input('lostpointercapture', 9))
        harness.document.dispatchEvent(input('pointerup', 4, { button: 2, buttons: 1 }))
        await settle()
        expect(otherMove).toHaveBeenCalledTimes(1)
        expect(harness.end).not.toHaveBeenCalled()
        expect(harness.abort).not.toHaveBeenCalled()
        harness.document.dispatchEvent(input('pointerup', 4))
        await settle()
        expect(harness.end).toHaveBeenCalledTimes(1)
    })

    it.each(['pointercancel', 'lostpointercapture'])('%s 在释放前发生时中止', async type => {
        /** 当前手势 owner。 */
        const harness = createHarness()
        harness.guard.arm(input('pointerdown', 7))
        harness.document.dispatchEvent(input(type, 7))
        await settle()
        expect(harness.abort).toHaveBeenCalledTimes(1)
    })

    it('触控兼容 mousemove/buttons=0 与另一手指结束不会中止当前触控', async () => {
        /** 当前手势 owner。 */
        const harness = createHarness()
        harness.guard.arm(input('touchstart', 1, { changedTouches: [{ identifier: 11 }] }))
        harness.document.addEventListener('touchend', harness.end)
        harness.document.dispatchEvent(input('mousemove', 1, { buttons: 0 }))
        harness.document.dispatchEvent(input('touchend', 1, { changedTouches: [{ identifier: 22 }] }))
        harness.document.dispatchEvent(input('mouseup'))
        expect(harness.end).not.toHaveBeenCalled()
        expect(harness.abort).not.toHaveBeenCalled()
        harness.document.dispatchEvent(input('touchend', 1, { changedTouches: [{ identifier: 11 }] }))
        await settle()
        expect(harness.end).toHaveBeenCalledTimes(1)
        expect(harness.abort).not.toHaveBeenCalled()
    })

    it('触点取消中止，但 pointerType=touch 的 buttons=0 不误判鼠标丢失释放', async () => {
        /** 当前手势 owner。 */
        const harness = createHarness()
        harness.guard.arm(input('pointerdown', 1, { pointerType: 'touch' }))
        harness.document.dispatchEvent(input('pointermove', 1, { pointerType: 'touch', buttons: 0 }))
        expect(harness.abort).not.toHaveBeenCalled()
        harness.document.dispatchEvent(input('pointercancel', 1, { pointerType: 'touch' }))
        expect(harness.abort).toHaveBeenCalledTimes(1)
    })

    it('只取消当前触点，且未送达官方处理器的正常释放会被补偿中止', async () => {
        /** 当前手势 owner。 */
        const harness = createHarness()
        harness.guard.arm(input('touchstart', 1, { changedTouches: [{ identifier: 11 }] }))
        harness.document.dispatchEvent(input('touchcancel', 1, { changedTouches: [{ identifier: 22 }] }))
        expect(harness.abort).not.toHaveBeenCalled()
        harness.document.dispatchEvent(input('touchcancel', 1, { changedTouches: [{ identifier: 11 }] }))
        expect(harness.abort).toHaveBeenCalledTimes(1)
        harness.own()
        harness.guard.arm(input('pointerdown', 3))
        harness.document.dispatchEvent(input('pointerup', 3))
        await settle()
        expect(harness.abort).toHaveBeenCalledTimes(2)
    })

    it('旧事件和旧检查任务不能终止下一次手势；clear 后不保留窗口监听', async () => {
        /** 当前手势 owner。 */
        const harness = createHarness()
        harness.guard.arm(input('pointerdown'))
        /** 第一手势产生、但延迟送达的事件。 */
        const stale = input('pointerup')
        harness.guard.clear()
        harness.guard.arm(input('pointerdown'))
        harness.document.addEventListener('pointerup', harness.end)
        harness.document.dispatchEvent(stale)
        await settle()
        expect(harness.end).not.toHaveBeenCalled()
        expect(harness.abort).not.toHaveBeenCalled()
        harness.guard.clear()
        harness.window.dispatchEvent(new Event('blur'))
        harness.document.dispatchEvent(input('pointermove', 1, { buttons: 0 }))
        expect(harness.abort).not.toHaveBeenCalled()
    })
})
