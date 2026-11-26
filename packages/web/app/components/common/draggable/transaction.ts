import type Sortable from 'sortablejs'

/** 某个列表在拖动前由 Vue 持有的状态。 */
export interface ListSnapshot {
    /** 原始数据引用及顺序。 */
    items: readonly unknown[]
    /** 原始项目节点，与数据一一对应。 */
    elements: HTMLElement[]
    /** Vue 循环的结束锚点。 */
    boundary: ChildNode | null
}

/** 参与原生拖拽的 Vue 列表边界。 */
export interface SortableList {
    /** Sortable 的容器。 */
    element: HTMLElement
    /** 读取 Vue 持有的当前快照，不依赖被 Sortable 移动后的 DOM。 */
    capture: () => ListSnapshot
    /** 校验快照对应的父级状态仍有效。 */
    valid: (snapshot: ListSnapshot) => boolean
    /** 校验目标列表能够使用自己的 itemKey 展示这些数据。 */
    accepts: (items: readonly unknown[]) => boolean
    /** 唯一的数据提交入口。 */
    update: (items: unknown[]) => void
    /** 销毁当前原生手势，并在下个更新周期重新创建实例。 */
    restart: () => void
}

/** 官方类型尚未声明原始浏览器事件。 */
export type DragEvent = Sortable.SortableEvent & {
    /** 由官方事件原样携带的浏览器事件。 */
    originalEvent?: Event
    /** MultiDrag 原样提供的临时克隆节点。 */
    clones?: HTMLElement[]
}

/** 当前页的组件注册表，只按实际容器查找，不扫描无关列表。 */
const lists = new Map<HTMLElement, SortableList>()
/** 浏览器原生拖动同时只有一个事务。 */
let active: { source: SortableList, snapshots: Map<SortableList, ListSnapshot>, temporary: Set<HTMLElement> } | undefined

/** 注册组件边界。 */
export function registerList(list: SortableList): void {
    lists.set(list.element, list)
}

/** 只在源列表按下时建立快照，兼容 MultiDrag 开始前的折叠。 */
export function beginDrag(source: SortableList): void {
    if (active) return
    active = { source, snapshots: new Map([[source, source.capture()]]), temporary: new Set() }
}

/** 只记录官方明确提供的 ghost 和 clone，不猜测未知节点的身份。 */
export function trackTemporary(elements: (HTMLElement | null | undefined)[]): void {
    for (const element of elements) {
        if (element) active?.temporary.add(element)
    }
}

/** 在官方确认允许进入目标后、DOM 移动前保存目标状态。 */
export function visitList(element: HTMLElement): void {
    /** 仅查询实际进入的目标。 */
    const list = lists.get(element)
    if (active && list && !active.snapshots.has(list)) active.snapshots.set(list, list.capture())
}

/** 统一恢复两侧节点，再让 Vue 消费新的数据顺序。 */
function restore(snapshots: Map<SortableList, ListSnapshot>, temporary: Iterable<HTMLElement>): void {
    /** 真实节点集合用于区分官方 ghost 和 clone。 */
    const originals = new Set([...snapshots.values()].flatMap(snapshot => snapshot.elements))
    for (const element of temporary) {
        if (!originals.has(element)) element.remove()
    }
    for (const [list, snapshot] of snapshots) {
        /** 从 Vue 的结束锚点倒序恢复，只移动偏离位置的节点。 */
        let anchor = snapshot.boundary
        if (anchor && anchor.parentNode !== list.element) continue
        for (let index = snapshot.elements.length - 1; index >= 0; index--) {
            /** 节点可能正在另一个参与列表中。 */
            const element = snapshot.elements[index]!
            if (element.parentNode !== list.element || element.nextSibling !== anchor) list.element.insertBefore(element, anchor)
            anchor = element
        }
    }
}

/** 计算所有参与方的最终数据；任何一侧过期时一起撤销。 */
function complete(source: SortableList, snapshots: Map<SortableList, ListSnapshot>, temporary: Iterable<HTMLElement>, event?: DragEvent): void {
    /** 原始 DOM 节点是跨列表和 Swap 的唯一身份映射。 */
    const items = new Map([...snapshots.values()].flatMap(snapshot => snapshot.elements.map((element, index) => [element, snapshot.items[index]] as const)))
    /** 所有提交在还原 DOM 之前准备完毕。 */
    const updates = new Map<SortableList, unknown[]>()
    /** 官方在 clone 模式移动原节点，并把克隆留在源列表。 */
    const cloning = event?.pullMode === 'clone' && event.to !== event.from
    /** 取消手势或者任一参与方失效时整笔事务回退。 */
    const originalEvent = event?.originalEvent
    /** 浏览器取消时不提交临时位置。 */
    let valid = originalEvent?.type !== 'touchcancel' && originalEvent?.type !== 'pointercancel'
      && !(originalEvent?.type === 'dragend' && (originalEvent as globalThis.DragEvent).dataTransfer?.dropEffect === 'none')
    if (event && event.to !== event.from && ![...snapshots.keys()].some(list => list.element === event.to)) valid = false
    for (const [list, snapshot] of snapshots) {
        /** 忽略临时克隆，只读取各列表中的真实节点。 */
        const next = cloning && list === source ? [...snapshot.items] : Array.from(list.element.children).filter(element => items.has(element as HTMLElement)).map(element => items.get(element as HTMLElement))
        valid = valid && snapshot.items.length === snapshot.elements.length && list.valid(snapshot) && list.accepts(next)
        updates.set(list, next)
    }
    restore(snapshots, temporary)
    if (!valid) return
    for (const [list, next] of updates) {
        /** 只向发生变化的列表提交一次。 */
        const previous = snapshots.get(list)!.items
        if (next.length !== previous.length || next.some((item, index) => item !== previous[index])) list.update(next)
    }
}

/** 官方完成 DOM 操作后收口，后续 add/remove/end 不会重复提交。 */
export function finishDrag(event: DragEvent): void {
    /** 先清空事务，避免双边 emit 触发父级 watcher 再次取消。 */
    const transaction = active
    if (!transaction) return
    active = undefined
    complete(transaction.source, transaction.snapshots, transaction.temporary, event)
}

/** 等官方回调及 store.set 全部结束，再恢复 Vue DOM 并提交模型。 */
export function scheduleFinish(event: DragEvent): void {
    /** 原手势的延迟收口不能影响随后开始的新手势。 */
    const transaction = active
    if (!transaction) return
    queueMicrotask(() => {
        // unchoose 早于 end；再留一轮微任务，让 end 回调触发的父级更新先失效旧事务。
        queueMicrotask(() => {
            if (active === transaction) finishDrag(event)
        })
    })
}

/** store.get 的初始原生排序同样由 Vue 提交，避免 DOM 与模型脱离。 */
export function finishInitialOrder(list: SortableList, snapshot: ListSnapshot): void {
    complete(list, new Map([[list, snapshot]]), [])
}

/** 父级刷新、配置变化、取消或卸载只影响已参与的拖拽。 */
export function cancelDrag(list: SortableList): void {
    /** 先失效，再销毁；Swap 的 drop 钩子执行完后统一复原。 */
    const transaction = active
    if (!transaction?.snapshots.has(list)) return
    active = undefined
    transaction.source.restart()
    restore(transaction.snapshots, transaction.temporary)
}

/** 释放注册表中的组件边界。 */
export function unregisterList(list: SortableList): void {
    cancelDrag(list)
    lists.delete(list.element)
}
