import { createRenderer, defineComponent, h, nextTick, type Component } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBridgeSettingsPresenter, provideBridgeServiceControl, useBridgeServiceControl, useBridgeSettings, type BridgeServiceControl } from './useBridgeServiceControl'
import { mountComponent } from '../utils/componentMount'

vi.mock('../utils/componentMount', () => ({ mountComponent: vi.fn() }))

/** 无 DOM 的 Vue 宿主，真实执行 setup、provide/inject 与卸载钩子。 */
function renderComponent(component: Component) {
    /** 测试宿主节点只承担 Vue 生命周期。 */
    const renderer = createRenderer<object, object>({
        createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
        insert: () => {}, remove: () => {}, setText: () => {}, setElementText: () => {},
        parentNode: () => null, nextSibling: () => null, patchProp: () => {},
    })
    /** 当前测试对应的真实 Vue 应用。 */
    const app = renderer.createApp(component)
    app.mount({})
    return app
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('bridge 动态面板生命周期', () => {
    it('首次打开挂载、重复打开复用、关闭后重开不被旧清理销毁', async () => {
        /** 历次实例的关闭入口。 */
        const closes: (() => void)[] = []
        /** 历次实例的销毁记录。 */
        const releases: ReturnType<typeof vi.fn>[] = []
        /** 可检查实例数量的挂载替身。 */
        const mount = vi.fn((close: () => void) => {
            closes.push(close)
            /** 本次实例的销毁函数。 */
            const unmount = vi.fn()
            releases.push(unmount)
            return { unmount }
        })
        /** 待测生命周期 owner。 */
        const presenter = createBridgeSettingsPresenter(mount)
        presenter.open()
        presenter.open()
        expect(mount).toHaveBeenCalledTimes(1)
        closes[0]!()
        presenter.open()
        expect(mount).toHaveBeenCalledTimes(2)
        await nextTick()
        expect(releases[0]).toHaveBeenCalledTimes(1)
        expect(releases[1]).not.toHaveBeenCalled()
        closes[0]!()
        presenter.dispose()
        await nextTick()
        expect(releases[1]).toHaveBeenCalledTimes(1)
        presenter.open()
        expect(mount).toHaveBeenCalledTimes(2)
    })

    it('外部 hook 按需挂载、捕获上下文且调用 scope 卸载后不能再打开', async () => {
        /** 动态实例释放记录。 */
        const unmount = vi.fn()
        vi.mocked(mountComponent).mockReturnValue({ instance: null, container: {} as HTMLElement, unmount })
        /** 打开时必须恢复 Nuxt 上下文。 */
        const runWithContext = vi.fn((callback: () => unknown) => callback())
        vi.stubGlobal('useNuxtApp', () => ({ runWithContext }))
        /** 外部设置不启动定时轮询。 */
        const fetch = vi.fn().mockResolvedValue(null)
        vi.stubGlobal('$fetch', fetch)
        /** 保留 setup 返回的公共入口。 */
        let settings!: ReturnType<typeof useBridgeSettings>
        /** 独立模块的真实作用域。 */
        const app = renderComponent(defineComponent({ setup() { settings = useBridgeSettings(); return () => null } }))
        expect(fetch).not.toHaveBeenCalled()
        await Promise.resolve()
        settings.openSettings()
        settings.openSettings()
        expect(mountComponent).toHaveBeenCalledTimes(1)
        expect(runWithContext).toHaveBeenCalledTimes(1)
        app.unmount()
        settings.openSettings()
        expect(unmount).toHaveBeenCalledTimes(1)
        expect(mountComponent).toHaveBeenCalledTimes(1)
    })

    it('桥接内多个 hook 复用布局 owner，异步受阻准入后仍在应用上下文挂载', async () => {
        /** 设置实例销毁记录。 */
        const unmount = vi.fn()
        vi.mocked(mountComponent).mockReturnValue({ instance: null, container: {} as HTMLElement, unmount })
        /** 应用上下文恢复记录。 */
        const runWithContext = vi.fn((callback: () => unknown) => callback())
        vi.stubGlobal('useNuxtApp', () => ({ runWithContext }))
        vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(null))
        /** 子组件消费的布局 owner。 */
        let control!: BridgeServiceControl
        /** 多个 hook 返回的共享入口。 */
        let first!: ReturnType<typeof useBridgeSettings>
        /** 第二个调用方的设置入口。 */
        let second!: ReturnType<typeof useBridgeSettings>
        /** 模拟桥接子页面的组件。 */
        const Child = defineComponent({ setup() { control = useBridgeServiceControl(); first = useBridgeSettings(); second = useBridgeSettings(); return () => null } })
        /** 模拟桥接布局，真实建立 provide 与轮询生命周期。 */
        const app = renderComponent(defineComponent({ setup() { provideBridgeServiceControl(); return () => h(Child) } }))
        await expect(control.requireRunning()).resolves.toBe(false)
        first.openSettings()
        second.openSettings()
        expect(first.openSettings).toBe(control.openSettings)
        expect(mountComponent).toHaveBeenCalledTimes(1)
        expect(runWithContext).toHaveBeenCalledTimes(1)
        app.unmount()
        expect(unmount).toHaveBeenCalledTimes(1)
    })

    it('挂载失败不占用实例，允许下一次打开重试', () => {
        /** 首次失败后恢复的挂载实现。 */
        const mount = vi.fn().mockReturnValueOnce(undefined).mockReturnValue({ unmount: vi.fn() })
        /** 挂载重试的生命周期 owner。 */
        const presenter = createBridgeSettingsPresenter(mount)
        presenter.open()
        presenter.open()
        presenter.open()
        expect(mount).toHaveBeenCalledTimes(2)
        presenter.dispose()
    })
})
