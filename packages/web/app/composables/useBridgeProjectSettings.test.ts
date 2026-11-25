import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, type VNode } from 'vue'
import { provideBridgeProjectSettings, useBridgeProjectSettings } from './useBridgeProjectSettings'
import { bridgeServiceControlKey, createSettingsControl, type BridgeServiceControl } from './useBridgeServiceControl'

/** 测试隔离 provide 链与动态宿主，避免加载真实页面和发送请求。 */
const state = vi.hoisted(() => ({ providers: new Map<symbol, unknown>(), mounted: [] as { render: () => VNode, unmount: ReturnType<typeof vi.fn> }[], fail: false }))
vi.mock('../components/ui/tooltip/TooltipProvider.vue', () => ({ default: {} }))
vi.mock('vue', async original => ({
    ...await original<typeof import('vue')>(),
    inject: (key: symbol, fallback: unknown) => state.providers.get(key) ?? fallback,
    provide: (key: symbol, value: unknown) => state.providers.set(key, value),
}))
vi.mock('./useBridgeServiceControl', async original => ({
    ...await original<typeof import('./useBridgeServiceControl')>(),
    createSettingsControl: vi.fn(() => ({ dispose: vi.fn() })),
}))
vi.mock('../utils/componentMount', () => ({ mountComponent: (Host: { setup: () => () => VNode }) => {
    if (state.fail) return { container: null, unmount: vi.fn() }
    /** 模拟挂载拥有独立组件作用域。 */
    const scope = effectScope()
    /** 动态宿主真实 render 函数。 */
    const render = scope.run(() => Host.setup())!
    /** 模拟真实卸载，释放宿主临时控制器。 */
    const unmount = vi.fn(() => scope.stop())
    state.mounted.push({ render, unmount })
    return { container: {}, unmount }
} }))

beforeEach(() => {
    state.providers.clear()
    state.mounted.length = 0
    state.fail = false
    vi.mocked(createSettingsControl).mockClear()
    vi.stubGlobal('useNuxtApp', () => ({ runWithContext: (callback: () => unknown) => callback() }))
})
afterEach(() => { vi.unstubAllGlobals() })

/** 在调用范围内建立入口，允许测试主动销毁。 */
function caller() {
    /** 当前调用范围。 */
    const scope = effectScope()
    /** setup 捕获的公开入口。 */
    const hook = scope.run(() => useBridgeProjectSettings())!
    return { scope, ...hook }
}
/** 从宿主真实 render 读取当前目标的公开事件。 */
function events(index = state.mounted.length - 1) {
    /** TooltipProvider 插槽中的业务目标。 */
    const vnode = state.mounted[index]!.render()
    return (vnode.children as unknown as { default: () => VNode }).default().props as {
        /** 目标身份。 */
        key: string
        /** 宿主开关。 */
        open: boolean
        /** 模型更新。 */
        'onUpdate:open': (value: boolean) => void
        /** 真实保存事件。 */
        committed: () => void
        /** 不再监听界面saved事件，避免双通知。 */
        onSaved?: () => void
        /** 关闭动画完成。 */
        onAfterClose: () => void
    }
}

describe('项目设置动态入口', () => {
    it('关窗卸载后已提交请求仍通知一次，调用scope释放后不再通知', async () => {
        /** 当前外部调用。 */
        const entry = caller()
        /** 保存通知。 */
        const saved = vi.fn()
        expect(createSettingsControl).not.toHaveBeenCalled()
        entry.openProjectSettings({ kind: 'import', onSaved: saved })
        expect(createSettingsControl).toHaveBeenCalledOnce()
        /** 关闭前的事件，模拟随后晚到的异步完成。 */
        const old = events()
        old['onUpdate:open'](false)
        old.onAfterClose()
        await nextTick()
        expect(state.mounted[0]!.unmount).toHaveBeenCalledOnce()
        old.committed()
        expect(saved).toHaveBeenCalledOnce()
        expect(old.onSaved).toBeUndefined()
        entry.scope.stop()
        old.committed()
        expect(saved).toHaveBeenCalledOnce()
        expect(state.mounted[0]!.unmount).toHaveBeenCalledOnce()
        expect(vi.mocked(createSettingsControl).mock.results[0]!.value.dispose).toHaveBeenCalledOnce()
    })
    it('Bridge调用共享同一宿主与原控制器，同目标打开和关闭动画中重开不被旧清理销毁', async () => {
        /** 布局生命周期。 */
        const layout = effectScope()
        /** 原有布局控制器，仅验证显式提供身份。 */
        const control = { dispose: vi.fn() } as unknown as BridgeServiceControl
        layout.run(() => provideBridgeProjectSettings(control))
        /** 两个模块入口共享布局。 */
        const first = caller()
        /** 第二个模块入口。 */
        const second = caller()
        first.openProjectSettings({ kind: 'group', chatId: 'group' })
        /** 旧关闭事件。 */
        const old = events()
        old['onUpdate:open'](false)
        old.onAfterClose()
        second.openProjectSettings({ kind: 'group', chatId: 'group' })
        await nextTick()
        expect(state.mounted).toHaveLength(1)
        expect(state.mounted[0]!.unmount).not.toHaveBeenCalled()
        expect(state.providers.get(bridgeServiceControlKey)).toBe(control)
        expect(createSettingsControl).not.toHaveBeenCalled()
        first.scope.stop()
        expect(state.mounted[0]!.unmount).not.toHaveBeenCalled()
        second.scope.stop()
        expect(state.mounted[0]!.unmount).toHaveBeenCalledOnce()
        layout.stop()
        expect(control.dispose).not.toHaveBeenCalled()
    })
    it('切换目标丢弃旧界面事件，但旧请求成功仍只通知原调用方，关闭完成释放实例', async () => {
        /** 当前入口。 */
        const entry = caller()
        /** 旧目标回调。 */
        const oldSaved = vi.fn()
        /** 新目标回调。 */
        const newSaved = vi.fn()
        entry.openProjectSettings({ kind: 'group', chatId: 'old', onSaved: oldSaved })
        /** 切换前的事件快照。 */
        const old = events()
        entry.openProjectSettings({ kind: 'project', projectPath: '/new', onSaved: newSaved })
        /** 新目标事件。 */
        const current = events()
        expect(current.key).not.toBe(old.key)
        old['onUpdate:open'](false)
        old.committed()
        old.onAfterClose()
        await nextTick()
        expect(events().open).toBe(true)
        expect(state.mounted[0]!.unmount).not.toHaveBeenCalled()
        expect(oldSaved).toHaveBeenCalledOnce()
        expect(newSaved).not.toHaveBeenCalled()
        expect(current.onSaved).toBeUndefined()
        current.committed()
        expect(newSaved).toHaveBeenCalledOnce()
        current['onUpdate:open'](false)
        current.onAfterClose()
        await nextTick()
        expect(state.mounted[0]!.unmount).toHaveBeenCalledOnce()
        entry.scope.stop()
    })
    it('挂载失败可以重试，销毁调用范围后不能再打开', () => {
        /** 当前入口。 */
        const entry = caller()
        state.fail = true
        entry.openProjectSettings({ kind: 'import' })
        expect(state.mounted).toHaveLength(0)
        state.fail = false
        entry.openProjectSettings({ kind: 'import' })
        expect(state.mounted).toHaveLength(1)
        entry.scope.stop()
        entry.openProjectSettings({ kind: 'import' })
        expect(state.mounted).toHaveLength(1)
    })
})
