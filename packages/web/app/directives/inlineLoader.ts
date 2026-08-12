import type { App, ObjectDirective } from 'vue'
import { createApp, h, reactive } from 'vue'
import InlineLoader from '@/components/common/inline-loader/index.vue'

/** 局部 Loading 指令配置。 */
export interface InlineLoaderOptions {
    /** 是否加载中。 */
    loading: boolean
    /** 图标尺寸。 */
    size?: string
    /** 提示文字。 */
    text?: string
    /** 激活色。 */
    color?: string
    /** 轨道色。 */
    trackColor?: string
    /** Loader 容器样式。 */
    class?: string
}

/** 局部 Loading 指令值。 */
export type InlineLoaderValue = boolean | InlineLoaderOptions

interface InlineLoaderMount {
    app: App
    container: HTMLDivElement
    options: InlineLoaderOptions
    originalPosition: string
}

const mounts = new WeakMap<HTMLElement, InlineLoaderMount>()

/** 规范化指令值。 */
function resolveOptions(value: InlineLoaderValue): InlineLoaderOptions {
    if (typeof value === 'boolean') return { loading: value }
    return {
        loading: Boolean(value.loading),
        size: value.size,
        text: value.text,
        color: value.color,
        trackColor: value.trackColor,
        class: value.class,
    }
}

/** 挂载一个局部 Loader。 */
function mountLoader(el: HTMLElement, next: InlineLoaderOptions): void {
    const options = reactive({ ...next }) as InlineLoaderOptions
    const container = document.createElement('div')
    container.className = 'pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-[inherit] bg-background/72 backdrop-blur-[1px]'
    const originalPosition = el.style.position
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
    const app = createApp({ render: () => h(InlineLoader, options) })
    app.mount(container)
    el.appendChild(container)
    mounts.set(el, { app, container, options, originalPosition })
}

/** 卸载局部 Loader。 */
function unmountLoader(el: HTMLElement): void {
    const mounted = mounts.get(el)
    if (!mounted) return
    mounted.app.unmount()
    mounted.container.remove()
    el.style.position = mounted.originalPosition
    mounts.delete(el)
}

/** 同步局部 Loader 状态。 */
function syncLoader(el: HTMLElement, value: InlineLoaderValue): void {
    const next = resolveOptions(value)
    const mounted = mounts.get(el)
    if (!next.loading) {
        unmountLoader(el)
        return
    }
    if (!mounted) {
        mountLoader(el, next)
        return
    }
    Object.assign(mounted.options, next)
}

/** AskX 局部 Loading 指令。 */
const inlineLoaderDirective: ObjectDirective<HTMLElement, InlineLoaderValue> = {
    mounted: (el, binding) => syncLoader(el, binding.value),
    updated: (el, binding) => syncLoader(el, binding.value),
    unmounted: el => unmountLoader(el),
}

export default inlineLoaderDirective
