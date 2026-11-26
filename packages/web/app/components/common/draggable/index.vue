<script setup lang="ts" generic="T">
import type Sortable from 'sortablejs'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import { getSortable } from '@/utils/getSortable'
import { beginDrag, cancelDrag, finishInitialOrder, registerList, scheduleFinish, setInsertionOrder, trackTemporary, unregisterList, visitList } from './transaction'
import type { DragEvent, SortableList } from './transaction'
import { useInsertionIndicator } from './useInsertionIndicator'
import { useDragReleaseGuard } from './useDragReleaseGuard'

/** 原生配置完整透传，简写仅覆盖调用方显式提供的值。 */
const props = withDefaults(defineProps<{
    /** 当前列表，跨列表移动和克隆均保留元素引用。 */
    modelValue: readonly T[]
    /** 返回唯一且稳定的字符串或数字标识。 */
    itemKey: keyof T | ((item: T) => string | number)
    /** 官方原生配置，回调仍使用官方参数和 this。 */
    options?: Sortable.Options
    /** 同组列表的移动、克隆与接收规则。 */
    group?: Sortable.Options['group']
    /** 可选拖拽手柄选择器。 */
    handle?: string
    /** 显式提供时覆盖 options.disabled。 */
    disabled?: boolean
    /** 官方位置过渡时长，单位毫秒。 */
    animation?: number
    /** 显式提供时覆盖 options.swap。 */
    swap?: boolean
    /** 纵向单列表使用插入线与紧凑预览，放手后才改变顺序。 */
    insertionIndicator?: boolean
}>(), { disabled: undefined, swap: undefined })
/** 每个变更列表仅有一次数据提交。 */
const emit = defineEmits<{ 'update:modelValue': [items: T[]] }>()
/** 每个项目的视觉内容由调用方提供。 */
defineSlots<{
    /** 常规项目内容。 */
    default: (props: { item: T, index: number }) => unknown
    /** 插入线模式的紧凑浮动内容，由调用方提供图标与名称。 */
    preview?: (props: { item: T }) => unknown
}>()
/** 官方实例只管理这一层直属项目。 */
const container = ref<HTMLElement>()
/** 系统动画偏好具有最终优先级。 */
const reducedMotion = usePreferredReducedMotion()
/** 运行时标识归一化，避免数字和字符串键冲突。 */
function getKey(item: T): string | undefined {
    /** 调用方声明的原始标识。 */
    const key = typeof props.itemKey === 'function' ? props.itemKey(item) : item[props.itemKey]
    return typeof key === 'string' || (typeof key === 'number' && Number.isFinite(key)) ? `${typeof key}:${key}` : undefined
}
/** 当前模型的稳定标识。 */
const keys = computed(() => props.modelValue.map(getKey))
/** 无效或重复标识时只展示列表，不允许排序。 */
const validKeys = computed(() => keys.value.every(key => key !== undefined) && new Set(keys.value).size === keys.value.length)
/** 合并原生选项与显式简写，不改写 group、filter、store 等原生能力。 */
const options = computed<Sortable.Options>(() => ({
    draggable: '.cs-draggable-item',
    animation: 150,
    fallbackOnBody: true,
    ghostClass: 'cs-draggable-ghost',
    chosenClass: 'cs-draggable-chosen',
    swapClass: 'cs-draggable-swap',
    ...props.options,
    ...(props.group !== undefined ? { group: props.group } : {}),
    ...(props.handle !== undefined ? { handle: props.handle } : {}),
    ...(props.disabled !== undefined ? { disabled: props.disabled } : {}),
    ...(props.animation !== undefined ? { animation: props.animation } : {}),
    ...(props.swap !== undefined ? { swap: props.swap } : {}),
    ...(!validKeys.value ? { disabled: true } : {}),
    ...(reducedMotion.value === 'reduce' ? { animation: 0 } : {}),
    ...(props.insertionIndicator ? { forceFallback: true, fallbackOnBody: true, fallbackClass: 'cs-draggable-insertion-fallback', ghostClass: 'cs-draggable-insertion-origin', swap: false, multiDrag: false, animation: 0, group: { name: '', pull: false, put: false } } : {}),
}))
/** 插入反馈不拥有最终数据，准备结果仍交给共享事务校验。 */
const indicator = useInsertionIndicator(() => container.value, () => props.modelValue, () => !!props.insertionIndicator && options.value.sort !== false, () => typeof props.options?.onMove === 'function', event => releaseGuard.matches(event), projectMove)
/** 浮动预览和插入线随手势统一清理。 */
const { preview, line } = indicator
/** 当前官方实例。 */
let instance: Sortable | undefined
/** 浏览器构造器用于清理回退手势的临时节点。 */
let Constructor: typeof Sortable | undefined
/** 当前组件对应的事务边界。 */
let list: SortableList | undefined
/** 异步创建流程的生命周期标识。 */
let generation = 0
/** 是否仍在客户端挂载。 */
let mounted = false
/** 上次应用的非回调选项快照，用于避免内联对象引起无意义重建。 */
let applied: Record<string, unknown> | undefined
/** 从按下开始覆盖官方 delay 窗口，异常释放统一走实例销毁与恢复。 */
const releaseGuard = useDragReleaseGuard(() => !!instance && !!Constructor?.dragged && (Constructor.active === instance || Constructor.dragged.parentNode === container.value), () => void restart())

/** 插入线模式的输入入口，默认原生模式不增加释放拦截。 */
function armReleaseGuard(event: Event): void {
    if (!props.insertionIndicator || !instance) return
    /** 官方运行时提供、当前上游类型尚未声明的输入监听开关。 */
    const pointerInput = (instance.options as Sortable.Options & { /** 是否由官方监听 PointerEvent。 */ supportPointer?: boolean }).supportPointer
    // 与官方实际监听的输入族一致，避免 supportPointer=false 时被更早的 pointerdown 错误布防。
    if ((event.type === 'pointerdown') === !!pointerInput) {
        if (releaseGuard.arm(event)) indicator.grab(event, instance.options.handle)
    }
}

/** 横向投影没有官方 dragover，仍按相同参数和 this 执行调用方的 onMove 策略。 */
function projectMove(related: HTMLElement, after: boolean, originalEvent: Event): unknown {
    /** 当前单列表及仍有效的官方拖动节点。 */
    const element = container.value
    /** 官方在 unchoose/end 结束前仍保留 dragged，失效时不允许提交。 */
    const dragged = Constructor?.dragged
    if (!instance || !element || !dragged) return false
    /** 与官方 MoveEvent 同构，目标始终是原列表。 */
    const event = Object.assign(new Event('move', { bubbles: true, cancelable: true }), {
        to: element,
        from: element,
        dragged,
        draggedRect: dragged.getBoundingClientRect(),
        related,
        relatedRect: related.getBoundingClientRect(),
        willInsertAfter: after,
    }) as Sortable.MoveEvent
    element.dispatchEvent(event)
    return props.options?.onMove?.call(instance, event, originalEvent)
}

/** 只复制普通配置对象，保留原生 DOM、函数和其他对象的身份。 */
function copy(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(copy)
    if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]))
    return value
}

/** 比较非回调配置的实际内容，而非 options 对象本身的引用。 */
function equal(left: unknown, right: unknown): boolean {
    if (left === right) return true
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false
    if (!Array.isArray(left) && Object.getPrototypeOf(left) !== Object.prototype) return false
    /** 配置的字段集合，移除字段也会触发恢复原生默认值。 */
    const leftKeys = Object.keys(left)
    return leftKeys.length === Object.keys(right).length && leftKeys.every(key => Object.hasOwn(right, key) && equal((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]))
}

/** 原生回调直接消费当前 props，不因内联 callback 引用变化销毁手势。 */
function configuration(): Record<string, unknown> {
    return Object.fromEntries(Object.entries(options.value).filter(([key]) => !/^on[A-Z]/.test(key)))
}

/** 销毁手势后清理官方在无事件 destroy 路径遗留的回退节点。 */
function dispose(): void {
    indicator.clear()
    releaseGuard.clear()
    /** 官方 destroy 会先执行插件 drop，事务 owner 随后统一恢复原节点。 */
    const previous = instance
    /** 无事件 drop 不会清除回退 ghost 和 clone。 */
    const owns = !!previous && (Constructor?.active ? Constructor.active === previous : Constructor?.dragged?.parentNode === previous.el)
    /** 官方无事件 drop 会遗留原行样式，必须保存正在拖动的确切节点。 */
    const dragged = owns ? Constructor?.dragged : undefined
    /** 只清理当前实例手势的临时节点。 */
    const temporary = owns ? [Constructor?.ghost, Constructor?.clone] : []
    instance = undefined
    previous?.destroy()
    for (const element of temporary) {
        element?.remove()
    }
    if (dragged && previous) {
        for (const name of [previous.options.ghostClass, previous.options.chosenClass, previous.options.dragClass]) {
            for (const token of name?.split(/\s+/).filter(Boolean) ?? []) dragged.classList.remove(token)
        }
        dragged.style.willChange = ''
    }
}

/** 配置变更、取消和源生命周期失效时重新创建原生实例。 */
async function restart(): Promise<void> {
    /** 并发重建只允许最后一次创建实例。 */
    const current = ++generation
    if (list) cancelDrag(list)
    dispose()
    await nextTick()
    if (mounted && current === generation) await initialize(current)
}

/** Escape 仅取消实际参与当前事务的列表。 */
function cancel(event: KeyboardEvent): void {
    if (event.key === 'Escape' && list) cancelDrag(list)
}

/** 保留原生回调的 this、全部参数与返回值，并收口 Vue 数据更新。 */
function nativeOptions(): Sortable.Options {
    /** 所有未拦截的原生选项原样交给官方构造器。 */
    const result = { ...options.value }
    /** 回调保持原生触发顺序，包装层只读取最新函数并维护事务边界。 */
    const handlers = new Set(['onChoose', 'onUnchoose', 'onStart', 'onEnd', 'onAdd', 'onRemove', 'onUpdate', 'onSort', 'onFilter', 'onMove', 'onClone', 'onChange', 'onSelect', 'onDeselect', 'onSpill', ...Object.keys(options.value).filter(key => /^on[A-Z]/.test(key))])
    for (const name of handlers) {
        (result as Record<string, unknown>)[name] = function (this: Sortable, ...args: unknown[]) {
            if (!mounted || this !== instance) return
            /** 回调函数始终读取最新 options，避免内联函数导致重建。 */
            const callback = (options.value as Record<string, unknown>)[name] as ((this: Sortable, ...args: unknown[]) => unknown) | undefined
            /** 官方事件参数保持原样。 */
            const event = args[0] as DragEvent
            if ((name === 'onChoose' || name === 'onStart') && list) beginDrag(list)
            if (props.insertionIndicator && name === 'onChoose') indicator.choose(event)
            if (props.insertionIndicator && name === 'onStart') indicator.start()
            trackTemporary([event.clone, ...(event.clones ?? []), Constructor?.ghost])
            try {
                /** onMove 的 false、-1、1 必须原样返回给官方。 */
                const returned = callback?.apply(this, args)
                if (name === 'onMove' && props.insertionIndicator) {
                    indicator.approve(event as unknown as Sortable.MoveEvent, returned, args[1] as Event | undefined)
                    return false
                }
                if (name === 'onMove' && returned !== false) visitList(event.to)
                return returned
            }
            finally {
                if (name === 'onUnchoose' || name === 'onEnd') {
                    if (props.insertionIndicator && list) {
                        /** 即使原生 onMove 返回 false，仍按可见插入线准备提交。 */
                        const order = indicator.finish(event.originalEvent)
                        if (order) setInsertionOrder(list, order)
                    }
                    releaseGuard.clear()
                    scheduleFinish(event)
                }
            }
        }
    }
    return result
}

/** 挂载后按需加载；初始 store.get 的排序也通过同一个 Vue 提交边界。 */
async function initialize(current: number): Promise<void> {
    try {
        Constructor = await getSortable()
        if (!mounted || current !== generation || !container.value || !list) return
        /** 保存构造器可能通过 store.get 改变的初始顺序。 */
        const initial = list.capture()
        instance = new Constructor(container.value, nativeOptions())
        applied = copy(configuration()) as Record<string, unknown>
        finishInitialOrder(list, initial)
    }
    catch (error) {
        if (mounted && current === generation) console.error('拖拽组件加载失败', error)
    }
}

watch([() => props.modelValue.slice(), keys], () => {
    if (list) cancelDrag(list)
}, { flush: 'sync' })
watch(options, () => {
    if (mounted && instance && !equal(applied, configuration())) void restart()
}, { deep: true, flush: 'post' })
onMounted(() => {
    mounted = true
    list = {
        element: container.value!,
        capture: () => {
            /** choose 与首次 move 均先于官方移动节点，不维护易受旧 vnode 卸载影响的 ref 索引。 */
            const nodes = Array.from(container.value!.children) as HTMLElement[]
            return { items: [...props.modelValue], elements: nodes, boundary: nodes.at(-1)?.nextSibling ?? container.value!.lastChild }
        },
        valid: snapshot => snapshot.items.length === props.modelValue.length && snapshot.items.every((item, index) => item === props.modelValue[index]),
        accepts: items => {
            /** 接收后必须仍能提供目标列表自己的唯一 itemKey。 */
            const nextKeys = (items as T[]).map(getKey)
            return nextKeys.every(key => key !== undefined) && new Set(nextKeys).size === nextKeys.length
        },
        update: items => emit('update:modelValue', items as T[]),
        restart: () => void restart(),
    }
    registerList(list)
    for (const type of ['pointerdown', 'mousedown', 'touchstart']) container.value!.addEventListener(type, armReleaseGuard, true)
    document.addEventListener('keydown', cancel)
    void initialize(++generation)
})
onBeforeUnmount(() => {
    mounted = false
    ++generation
    document.removeEventListener('keydown', cancel)
    for (const type of ['pointerdown', 'mousedown', 'touchstart']) container.value?.removeEventListener(type, armReleaseGuard, true)
    if (list) unregisterList(list)
    dispose()
})
</script>

<template>
    <div ref="container">
        <div
            v-for="(item, index) in modelValue"
            :key="validKeys ? keys[index] : `invalid-${index}`"
            class="cs-draggable-item"
            :data-draggable-key="keys[index]"
        >
            <slot
                :item="item"
                :index="index"
            />
        </div>
        <Teleport
            v-if="preview"
            to="body"
        >
            <div
                class="cs-draggable-preview"
                :style="{ left: `${preview.left}px`, top: `${preview.top}px`, transform: `translate(${-preview.anchorX * 100}%, ${-preview.anchorY * 100}%)` }"
                aria-hidden="true"
            >
                <slot
                    name="preview"
                    :item="preview.item"
                >
                    <slot
                        :item="preview.item"
                        :index="preview.index"
                    />
                </slot>
            </div>
            <div
                v-if="line"
                class="cs-draggable-insertion-line"
                :style="{ left: `${line.left}px`, top: `${line.top}px`, width: `${line.width}px` }"
                aria-hidden="true"
            />
        </Teleport>
    </div>
</template>

<style scoped>
.cs-draggable-ghost {
    opacity: 0.35;
}

.cs-draggable-insertion-origin {
    opacity: 0.35;
}

:global(.cs-draggable-insertion-fallback) {
    opacity: 0 !important;
    pointer-events: none !important;
}

.cs-draggable-preview {
    position: fixed;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 248px;
    max-height: 44px;
    padding: 8px 12px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--popover);
    color: var(--popover-foreground);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--foreground) 12%, transparent);
    pointer-events: none;
}

.cs-draggable-insertion-line {
    position: fixed;
    z-index: 9999;
    height: 2px;
    background: var(--ds-color-drag-indicator);
    transform: translateY(-1px);
    pointer-events: none;
}

.cs-draggable-insertion-line::before {
    position: absolute;
    top: 50%;
    left: 0;
    width: 8px;
    height: 8px;
    border: 2px solid var(--ds-color-drag-indicator);
    border-radius: 50%;
    background: var(--background);
    content: '';
    transform: translate(-50%, -50%);
}

.cs-draggable-swap {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
}
</style>
