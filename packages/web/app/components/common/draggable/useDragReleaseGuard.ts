/** 当前手势身份，避免其他手指及兼容鼠标事件终止合法拖动。 */
interface Gesture {
    /** 浏览器输入事件族。 */
    kind: 'pointer' | 'touch' | 'mouse'
    /** 指针或触点标识。 */
    id?: number
    /** 正常松开后不再把 lostpointercapture 当作异常。 */
    ending: boolean
    /** 发起事件时间，迟到的旧事件不能污染下一次手势。 */
    since: number
}

/** 为官方回退手势补齐窗口失焦、丢失释放与输入身份保护。 */
export function useDragReleaseGuard(ownsGesture: () => boolean, abort: () => void) {
    /** 只在用户按下到官方结束的短窗口内持有临时监听。 */
    let gesture: Gesture | undefined
    /** 原生事件各监听器之间可能运行微任务，必须等整轮事件传播结束再检查官方状态。 */
    const pending = new Set<ReturnType<typeof setTimeout>>()

    /** 宏任务检查与本次手势绑定，清理时会取消且不会污染下一手势。 */
    function defer(current: Gesture, check: () => void): void {
        /** 当前事件后的检查任务。 */
        const timer = setTimeout(() => {
            pending.delete(timer)
            if (gesture === current) check()
        }, 0)
        pending.add(timer)
    }

    /** 判断事件是否属于当前输入，触控结束只检查 changedTouches。 */
    function matches(event: Event): boolean {
        if (!gesture || event.timeStamp < gesture.since) return false
        if (gesture.kind === 'pointer') return (event.type.startsWith('pointer') || event.type === 'lostpointercapture') && (event as PointerEvent).pointerId === gesture.id
        if (gesture.kind === 'mouse') return event.type.startsWith('mouse')
        return event.type.startsWith('touch') && Array.from((event as TouchEvent).changedTouches).some(touch => touch.identifier === gesture!.id)
    }

    /** 同一清理入口移除所有临时监听并使已排队的检查失效。 */
    function clear(): void {
        gesture = undefined
        for (const timer of pending) clearTimeout(timer)
        pending.clear()
        for (const type of ['pointermove', 'mousemove', 'touchmove', 'pointerup', 'mouseup', 'touchend', 'pointercancel', 'touchcancel', 'lostpointercapture']) document.removeEventListener(type, inspect, true)
        document.removeEventListener('visibilitychange', visibility)
        window.removeEventListener('blur', interrupt)
        window.removeEventListener('pagehide', interrupt)
    }

    /** 先失效监听，再走组件统一销毁和恢复入口。 */
    function abortGesture(): void {
        if (!gesture) return
        clear()
        abort()
    }

    /** 正常释放已到达后，浏览器后续失焦不应撤销合法提交。 */
    function interrupt(): void {
        if (gesture && !gesture.ending) abortGesture()
    }

    /** 页面隐藏和失焦等价于放弃尚未提交的手势。 */
    function visibility(): void {
        if (document.visibilityState === 'hidden') interrupt()
    }

    /** 正常松开先交给官方；异常释放则销毁原实例，防止延迟任务复活。 */
    function inspect(event: Event): void {
        if (!gesture) return
        if (!matches(event)) {
            // 官方没有校验 pointerId / changedTouches；只阻止同一输入族的其他手指触发其全局处理器。
            if ((gesture.kind === 'pointer' && event.type.startsWith('pointer')) || (gesture.kind === 'touch' && (event.type.startsWith('touch') || event.type === 'mouseup')) || (gesture.kind === 'mouse' && (event.type === 'touchend' || event.type === 'touchcancel'))) event.stopImmediatePropagation()
            return
        }
        /** 当前监听周期，用于隔离迟到检查和新手势。 */
        const current = gesture
        if (event.type === 'mouseup' && (event as MouseEvent).button !== 0) { event.stopImmediatePropagation(); return }
        if (event.type === 'pointerup' && ((event as PointerEvent).buttons & 1) !== 0) { event.stopImmediatePropagation(); return }
        if (event.type.endsWith('cancel')) { if (!current.ending) abortGesture(); return }
        if (event.type === 'lostpointercapture') {
            defer(current, () => { if (!current.ending) abortGesture() })
            return
        }
        if (event.type.endsWith('move')) {
            /** 触摸及其兼容鼠标事件不使用 buttons 推导释放。 */
            const input = event as PointerEvent
            if (!current.ending && gesture.kind !== 'touch' && input.pointerType !== 'touch' && typeof input.buttons === 'number' && (input.buttons & 1) === 0) abortGesture()
            return
        }
        current.ending = true
        defer(current, () => {
            // 官方已清理全局 dragged 表示合法释放；否则属于未到达官方处理器的释放。
            if (ownsGesture()) abortGesture()
            else clear()
        })
    }

    /** 在 root 的 capture 阶段布防；返回是否新建手势，避免其他输入覆盖按下快照。 */
    function arm(event: Event): boolean {
        if (gesture) return false
        /** 当前主输入。 */
        const pointer = event as PointerEvent
        if (event.type !== 'touchstart' && (pointer.button !== 0 || pointer.isPrimary === false)) return false
        /** 触控选择发起手势的那一根手指。 */
        const touch = (event as TouchEvent).changedTouches?.[0]
        gesture = event.type === 'pointerdown' ? { kind: 'pointer', id: pointer.pointerId, ending: false, since: event.timeStamp } : event.type === 'touchstart' ? { kind: 'touch', id: touch?.identifier, ending: false, since: event.timeStamp } : { kind: 'mouse', ending: false, since: event.timeStamp }
        /** 事件传播后确认官方确实接受此次按下，filter/handle 拒绝则不保留监听。 */
        const current = gesture
        for (const type of ['pointermove', 'mousemove', 'touchmove', 'pointerup', 'mouseup', 'touchend', 'pointercancel', 'touchcancel', 'lostpointercapture']) document.addEventListener(type, inspect, true)
        document.addEventListener('visibilitychange', visibility)
        window.addEventListener('blur', interrupt)
        window.addEventListener('pagehide', interrupt)
        defer(current, () => { if (!ownsGesture()) clear() })
        return true
    }

    return { arm, clear, matches }
}
