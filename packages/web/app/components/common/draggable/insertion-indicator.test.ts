import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginDrag, cancelDrag, registerList, scheduleFinish, setInsertionOrder, unregisterList } from './transaction'
import type { SortableList } from './transaction'
import { useInsertionIndicator } from './useInsertionIndicator'

/** 每个测试结束时清理真实控制器和共享事务。 */
let cleanup: (() => void) | undefined

/** 创建带浏览器坐标的原生事件。 */
function pointer(y: number, type = 'pointermove', x = 50): Event {
    return Object.assign(new Event(type), { clientX: x, clientY: y })
}

/** 等待共享事务结束的两轮微任务。 */
async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) await Promise.resolve()
}

/** 使用确定的真实行几何验证控制器，不重写插入算法。 */
function createHarness(hasMoveCallback = false, projectedMove?: (related: HTMLElement, after: boolean, event: Event) => unknown) {
    /** 父级持有的模型及其唯一提交记录。 */
    let items = ['a', 'b', 'c', 'd'].map(id => ({ id }))
    /** 当前滚动偏移。 */
    let offset = 0
    /** Vue 已知的结束锚点。 */
    const boundary = {} as ChildNode
    /** 不允许拖动期间发生原生 DOM 换位。 */
    const insertBefore = vi.fn()
    /** 当前单列表容器。 */
    const root = { insertBefore, contains: (element: unknown) => element === root, getBoundingClientRect: () => ({ top: 100 + offset, bottom: 284 + offset, left: 20, right: 320 }) } as unknown as HTMLElement
    /** 稳定的原始项目节点。 */
    const elements = items.map((item, index) => ({
        id: item.id,
        parentNode: root,
        get nextSibling() { return elements[index + 1] ?? boundary },
        getBoundingClientRect: () => ({ top: 100 + index * 48 + offset, bottom: 140 + index * 48 + offset, height: 40, left: 20, width: 300 }),
    })) as unknown as HTMLElement[]
    Object.defineProperty(root, 'children', { get: () => elements })
    Object.defineProperty(boundary, 'parentNode', { value: root })
    /** 文档命中可切换为空，以模拟拖出滚动容器。 */
    const document = Object.assign(new EventTarget(), { elementFromPoint: vi.fn((): HTMLElement | null => root) })
    /** 视口与尺寸事件保持原生 EventTarget 行为。 */
    const window = Object.assign(new EventTarget(), { innerWidth: 1000, innerHeight: 700 })
    vi.stubGlobal('document', document)
    vi.stubGlobal('window', window)
    /** 实际组件使用的插入反馈 owner。 */
    const indicator = useInsertionIndicator(() => root, () => items, () => true, () => hasMoveCallback, () => true, projectedMove)
    /** 断言提交前节点仍保持 Vue 的原始顺序。 */
    const update = vi.fn((next: unknown[]) => {
        expect(elements.map(element => element.id)).toEqual(['a', 'b', 'c', 'd'])
        items = next as typeof items
    })
    /** 实际共享事务边界，用于验证不是只计算一个孤立索引。 */
    const list: SortableList = {
        element: root,
        capture: () => ({ items: [...items], elements, boundary }),
        valid: snapshot => snapshot.items.length === items.length && snapshot.items.every((item, index) => item === items[index]),
        accepts: () => true,
        update,
        restart: () => indicator.clear(),
    }
    registerList(list)
    cleanup = () => { unregisterList(list); indicator.clear() }
    return {
        indicator, root, elements, document, window, insertBefore, update,
        ids: () => items.map(item => item.id),
        scroll: () => { offset -= 24; document.dispatchEvent(new Event('scroll')) },
        replace: () => { items = [{ id: 'replacement' }]; cancelDrag(list) },
        cancel: () => cancelDrag(list),
        start: (from: number) => {
            beginDrag(list)
            indicator.choose({ item: elements[from]!, originalEvent: pointer(110 + from * 48, 'pointerdown') } as Parameters<typeof indicator.choose>[0])
            indicator.start()
        },
        finish: async (y: number, type = 'pointerup', x = 50) => {
            /** 使用组件相同的准备、统一提交流程。 */
            const order = indicator.finish(pointer(y, type, x))
            if (order) setInsertionOrder(list, order)
            scheduleFinish({ from: root, to: root, originalEvent: pointer(y, type) } as Parameters<typeof scheduleFinish>[0])
            await settle()
        },
    }
}

afterEach(() => {
    cleanup?.()
    cleanup = undefined
    vi.unstubAllGlobals()
})

describe('插入线单列表事务', () => {
    it.each([
        [0, 270, ['b', 'c', 'd', 'a'], 284],
        [3, 110, ['d', 'a', 'b', 'c'], 100],
        [0, 200, ['b', 'a', 'c', 'd'], 192],
        [0, 230, ['b', 'c', 'a', 'd'], 240],
    ])('拖动 %s 到纵坐标 %s 时先显示准确插入线、放手再提交', async (from, y, expected, top) => {
        /** 当前测试的实际控制器和共享事务。 */
        const harness = createHarness()
        harness.start(from)
        harness.document.dispatchEvent(pointer(y))
        expect(harness.indicator.line.value?.top).toBe(top)
        expect(harness.indicator.preview.value?.item.id).toBe(['a', 'b', 'c', 'd'][from])
        expect(harness.ids()).toEqual(['a', 'b', 'c', 'd'])
        expect(harness.insertBefore).not.toHaveBeenCalled()
        await harness.finish(y)
        expect(harness.ids()).toEqual(expected)
        expect(harness.update).toHaveBeenCalledTimes(1)
        expect(harness.indicator.preview.value).toBeUndefined()
        expect(harness.indicator.line.value).toBeUndefined()
    })

    it('滚动后重算线的位置，保持放手结果与线一致', async () => {
        /** 当前测试的实际控制器和共享事务。 */
        const harness = createHarness()
        harness.start(0)
        harness.document.dispatchEvent(pointer(175))
        expect(harness.indicator.line.value?.top).toBe(192)
        harness.scroll()
        expect(harness.indicator.line.value?.top).toBe(168)
        await harness.finish(175)
        expect(harness.ids()).toEqual(['b', 'a', 'c', 'd'])
    })

    it('窗口内横向全宽投影到原列表，插入线保持原行宽度与位置', async () => {
        /** 当前测试的实际控制器和共享事务。 */
        const harness = createHarness()
        harness.start(0)
        harness.document.dispatchEvent(pointer(200, 'pointermove', 750))
        expect(harness.indicator.line.value).toEqual({ left: 20, top: 192, width: 300 })
        expect(harness.document.elementFromPoint).toHaveBeenCalledWith(170, 200)
        expect(harness.insertBefore).not.toHaveBeenCalled()
        await harness.finish(200, 'pointerup', 750)
        expect(harness.ids()).toEqual(['b', 'a', 'c', 'd'])
        expect(harness.update).toHaveBeenCalledTimes(1)
    })

    it.each([90, 300])('横向投影仍拒绝纵坐标 %s 超出列表的释放', async y => {
        /** 当前测试的实际控制器和共享事务。 */
        const harness = createHarness()
        harness.start(0)
        harness.document.dispatchEvent(pointer(y, 'pointermove', 750))
        expect(harness.indicator.line.value).toBeUndefined()
        await harness.finish(y, 'pointerup', 750)
        expect(harness.update).not.toHaveBeenCalled()
    })

    it.each([[115, 110, 284], [270, 100, 280]])('指针 %s 在可见行内、候选线被滚动裁剪时不展示或提交', async (y, top, bottom) => {
        /** 当前测试的实际控制器和共享事务。 */
        const harness = createHarness()
        harness.document.elementFromPoint.mockImplementation((_x = 0, hitY = 0) => hitY >= top && hitY <= bottom ? harness.root : null)
        harness.start(0)
        harness.document.dispatchEvent(pointer(y, 'pointermove', 750))
        expect(harness.indicator.line.value).toBeUndefined()
        await harness.finish(y, 'pointerup', 750)
        expect(harness.update).not.toHaveBeenCalled()
    })

    it.each([false, undefined, -1, 1])('横向投影继续执行 onMove=%s 的策略', async verdict => {
        /** 不在列表内时由组件按相同契约评估投影目标。 */
        const projectedMove = vi.fn(() => verdict)
        /** 当前测试的实际控制器和共享事务。 */
        const harness = createHarness(true, projectedMove)
        harness.start(0)
        harness.document.dispatchEvent(pointer(200, 'pointermove', 750))
        expect(projectedMove).toHaveBeenCalledWith(harness.elements[2], false, expect.objectContaining({ clientX: 750, clientY: 200 }))
        await harness.finish(200, 'pointerup', 750)
        if (verdict === false) expect(harness.update).not.toHaveBeenCalled()
        else expect(harness.ids()).toEqual(verdict === 1 ? ['b', 'c', 'a', 'd'] : ['b', 'a', 'c', 'd'])
    })

    it.each(['pointercancel', 'touchcancel'])('%s 取消时清理反馈且不提交', async type => {
        /** 当前测试的实际控制器和共享事务。 */
        const harness = createHarness()
        harness.start(0)
        harness.document.dispatchEvent(pointer(270))
        await harness.finish(270, type)
        expect(harness.update).not.toHaveBeenCalled()
        expect(harness.indicator.preview.value).toBeUndefined()
        expect(harness.indicator.line.value).toBeUndefined()
    })

    it('原生 onMove 拒绝时不能绕过校验提交', async () => {
        /** 当前测试的实际控制器和共享事务。 */
        const harness = createHarness(true)
        harness.start(0)
        harness.indicator.approve({ to: harness.root, related: harness.elements[2] } as Parameters<typeof harness.indicator.approve>[0], false, pointer(200))
        expect(harness.indicator.line.value).toBeUndefined()
        await harness.finish(200)
        expect(harness.update).not.toHaveBeenCalled()
    })

    it.each(['cancel', 'replace'] as const)('%s 失效后清除浮层且旧结束事件不提交', async operation => {
        /** 当前测试的实际控制器和共享事务。 */
        const harness = createHarness()
        harness.start(0)
        harness.document.dispatchEvent(pointer(270))
        harness[operation]()
        await harness.finish(270)
        expect(harness.update).not.toHaveBeenCalled()
        expect(harness.indicator.preview.value).toBeUndefined()
        expect(harness.indicator.line.value).toBeUndefined()
    })

    it('拖出可见区域放手取消，随后仍可重复拖动', async () => {
        /** 当前测试的实际控制器和共享事务。 */
        const harness = createHarness()
        harness.start(0)
        harness.document.elementFromPoint.mockReturnValue(null)
        await harness.finish(270)
        expect(harness.update).not.toHaveBeenCalled()
        harness.document.elementFromPoint.mockReturnValue(harness.root)
        harness.start(1)
        await harness.finish(270)
        expect(harness.ids()).toEqual(['a', 'c', 'd', 'b'])
        expect(harness.update).toHaveBeenCalledTimes(1)
    })
})
