import { shallowRef } from 'vue'
import type Sortable from 'sortablejs'

/** 浏览器指针位置，触控与鼠标使用同一坐标系。 */
interface Point {
    /** 视口横坐标。 */
    x: number
    /** 视口纵坐标。 */
    y: number
}

/** 插入线模式只负责反馈和候选节点顺序，提交仍交给共享事务。 */
export function useInsertionIndicator<T>(root: () => HTMLElement | undefined, items: () => readonly T[], enabled: () => boolean, hasMoveCallback: () => boolean, acceptsInput: (event: Event) => boolean = () => true, projectedMove?: (related: HTMLElement, after: boolean, event: Event) => unknown) {
    /** 浮动预览的当前内容和视口位置。 */
    const preview = shallowRef<{ item: T, index: number, left: number, top: number }>()
    /** 插入线的视口位置和宽度。 */
    const line = shallowRef<{ left: number, top: number, width: number }>()
    /** 当前手势的原始项目节点，拖动过程中不移动这些节点。 */
    let drag: { elements: HTMLElement[], item: T, from: number, point?: Point, started: boolean, boundary?: number, touchId?: number, event?: Event } | undefined
    /** 用户原生 onMove 对各目标的判断，不能因拦截原生换位而绕过。 */
    const verdicts = new Map<HTMLElement, boolean | -1 | 1 | undefined>()

    /** 从原生鼠标、指针或触控事件读取坐标。 */
    function pointFrom(event?: Event, touchId = drag?.touchId): Point | undefined {
        /** 触控结束时坐标在 changedTouches 中。 */
        const input = event as (MouseEvent & { touches?: TouchList, changedTouches?: TouchList }) | undefined
        /** 兼容官方回退模式的触控事件。 */
        const point = touchId === undefined ? input?.touches?.[0] ?? input?.changedTouches?.[0] ?? input : [...Array.from(input?.touches ?? []), ...Array.from(input?.changedTouches ?? [])].find(touch => touch.identifier === touchId)
        return point && Number.isFinite(point.clientX) && Number.isFinite(point.clientY) ? { x: point.clientX, y: point.clientY } : undefined
    }

    /** 滚动、尺寸或指针位置变化时，从当前真实几何重新计算插入位置。 */
    function update(): void {
        line.value = undefined
        if (!drag?.started || !drag.point) return
        /** 浮动预览与鼠标保持间隔，不参与命中判断。 */
        const point = drag.point
        preview.value = { item: drag.item, index: drag.from, left: Math.max(8, Math.min(point.x + 14, window.innerWidth - 260)), top: Math.max(8, Math.min(point.y + 14, window.innerHeight - 56)) }
        /** 窗口内的横向位置都投影到原列表，纵向仍受列表和滚动裁剪约束。 */
        const element = root()
        if (!element || point.x < 0 || point.x >= window.innerWidth || point.y < 0 || point.y >= window.innerHeight) { drag.boundary = undefined; return }
        /** 使用列表可见横向区间的中心检测同一纵坐标。 */
        const bounds = element.getBoundingClientRect()
        /** 列表完全移出窗口时不能投放。 */
        const left = Math.max(0, bounds.left)
        /** 列表横向可见区间的右边界。 */
        const right = Math.min(window.innerWidth, bounds.right)
        if (left >= right || point.y < bounds.top || point.y > bounds.bottom) { drag.boundary = undefined; return }
        /** 实际命中检测同时排除遮挡和滚动裁剪。 */
        const projectedX = (left + right) / 2
        /** 固定在原列表上检测，避免右侧内容区变成排序容器。 */
        const hit = document.elementFromPoint(projectedX, point.y)
        if (!hit || !element.contains(hit)) { drag.boundary = undefined; return }
        /** 保留原始行的布局，位置随滚动实时读取。 */
        const rectangles = drag.elements.map(element => element.getBoundingClientRect())
        /** 上半行表示前插，下半行表示后插。 */
        let boundary = rectangles.findIndex(rectangle => point.y < rectangle.top + rectangle.height / 2)
        if (boundary < 0) boundary = rectangles.length
        /** 当前指针所在行，间隔区采用最近的一侧。 */
        const relatedIndex = rectangles.findIndex(rectangle => point.y >= rectangle.top && point.y <= rectangle.bottom)
        /** 原生 onMove 存在时，必须先获得该目标的原生判断。 */
        const related = drag.elements[relatedIndex < 0 ? Math.min(boundary, drag.elements.length - 1) : relatedIndex]!
        if (hasMoveCallback()) {
            if ((point.x < bounds.left || point.x > bounds.right) && drag.event && projectedMove) {
                /** 横向投影不会触发官方 dragover，因此仍需执行原生 onMove 策略。 */
                const current = drag
                /** 策略返回 false/-1/1 的语义与列表内部一致。 */
                const returned = projectedMove(related, boundary > drag.elements.indexOf(related), drag.event)
                if (drag !== current) return
                verdicts.set(related, returned as boolean | -1 | 1 | undefined)
            }
            if (!verdicts.has(related) || verdicts.get(related) === false) { drag.boundary = undefined; return }
            if (verdicts.get(related) === -1) boundary = drag.elements.indexOf(related)
            if (verdicts.get(related) === 1) boundary = drag.elements.indexOf(related) + 1
        }
        /** 首尾使用行边界，中间间隔使用相邻行之间的中心。 */
        const top = boundary === 0 ? rectangles[0]!.top : boundary === rectangles.length ? rectangles.at(-1)!.bottom : (rectangles[boundary - 1]!.bottom + rectangles[boundary]!.top) / 2
        /** 插入位置本身被裁掉时不能展示悬空线，也不能提交不可见位置。 */
        const lineHit = top >= 0 && top <= window.innerHeight ? document.elementFromPoint(projectedX, top + (boundary === 0 ? 1 : boundary === rectangles.length ? -1 : 0)) : null
        if (!lineHit || !element.contains(lineHit)) { drag.boundary = undefined; return }
        drag.boundary = boundary
        /** 插入线与项目行的左右边界一致。 */
        const rectangle = rectangles[Math.min(boundary, rectangles.length - 1)]!
        line.value = { left: rectangle.left, top, width: rectangle.width }
    }

    /** 记录当前指针；不改变列表节点或父级数据。 */
    function move(event: Event): void {
        if (!drag || !acceptsInput(event)) return
        drag.event = event
        drag.point = pointFrom(event) ?? drag.point
        update()
    }

    /** 同一入口清除指针监听、浮层和候选位置。 */
    function clear(): void {
        drag = undefined
        preview.value = undefined
        line.value = undefined
        verdicts.clear()
        document.removeEventListener('pointermove', move, true)
        document.removeEventListener('mousemove', move, true)
        document.removeEventListener('touchmove', move, true)
        document.removeEventListener('scroll', update, true)
        window.removeEventListener('resize', update)
    }

    /** choose 发生在官方创建 ghost 前，此时保存真实行及原始索引。 */
    function choose(event: Sortable.SortableEvent & { originalEvent?: Event }): void {
        clear()
        /** 单列表插入模式的当前容器。 */
        const element = root()
        if (!enabled() || !element) return
        /** 原生节点与模型在此阶段仍一一对应。 */
        const elements = Array.from(element.children) as HTMLElement[]
        /** 拖动行的原始位置。 */
        const from = elements.indexOf(event.item)
        if (from < 0 || elements.length !== items().length) return
        /** 多指场景中只跟随此次按下的手指，不依赖 touches 数组位置。 */
        const touchId = (event.originalEvent as TouchEvent | undefined)?.changedTouches?.[0]?.identifier
        drag = { elements, item: items()[from]!, from, point: pointFrom(event.originalEvent, touchId), started: false, touchId, event: event.originalEvent }
        document.addEventListener('pointermove', move, { capture: true, passive: true })
        document.addEventListener('mousemove', move, { capture: true, passive: true })
        document.addEventListener('touchmove', move, { capture: true, passive: true })
        document.addEventListener('scroll', update, { capture: true, passive: true })
        window.addEventListener('resize', update)
    }

    /** 真正开始拖动后才显示紧凑预览。 */
    function start(): void {
        if (!drag) return
        drag.started = true
        update()
    }

    /** 消费官方 onMove 的判断，列表本身始终拒绝实时换位。 */
    function approve(event: Sortable.MoveEvent, returned: unknown, originalEvent?: Event): void {
        if (!drag) return
        if (event.to !== root()) { drag.boundary = undefined; line.value = undefined; return }
        verdicts.set(event.related, returned as boolean | -1 | 1 | undefined)
        drag.event = originalEvent ?? drag.event
        drag.point = pointFrom(originalEvent) ?? drag.point
        update()
    }

    /** 放手时按可见插入线生成最终节点顺序，然后释放全部手势状态。 */
    function finish(event?: Event): HTMLElement[] | undefined {
        try {
            if (!drag?.started || event?.type === 'pointercancel' || event?.type === 'touchcancel') return
            drag.event = event ?? drag.event
            drag.point = pointFrom(event) ?? drag.point
            update()
            if (!drag || drag.boundary === undefined) return
            /** 去掉原位置后，向下移动的插入索引需要减一。 */
            const destination = drag.boundary > drag.from ? drag.boundary - 1 : drag.boundary
            /** 只准备候选顺序，由共享事务校验并提交模型。 */
            const ordered = [...drag.elements]
            ordered.splice(drag.from, 1)
            ordered.splice(destination, 0, drag.elements[drag.from]!)
            return ordered
        }
        finally { clear() }
    }

    return { preview, line, choose, start, approve, finish, clear }
}
