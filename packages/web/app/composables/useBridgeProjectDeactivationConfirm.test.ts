import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBridgeProjectDeactivationConfirm } from './useBridgeProjectDeactivationConfirm'

/** 捕获动态弹窗配置与资源释放入口。 */
const dialogs = vi.hoisted(() => [] as { options: { onOk: (done: () => void) => void, onCancel: (done: () => void) => void }, destroy: ReturnType<typeof vi.fn> }[])
vi.mock('./useConfirm', () => ({ useConfirm: (options: typeof dialogs[number]['options']) => {
    /** 模拟动态挂载的资源控制器。 */
    const destroy = vi.fn()
    dialogs.push({ options, destroy })
    return { destroy, close: vi.fn(), init: vi.fn() }
} }))

/** 在独立作用域中建立待验证的授权入口。 */
function setup() {
    vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
    /** 测试拥有的调用作用域。 */
    const scope = effectScope()
    /** 绑定作用域的确认控制器。 */
    const control = scope.run(() => useBridgeProjectDeactivationConfirm())!
    return { scope, control }
}
afterEach(() => { dialogs.length = 0; vi.unstubAllGlobals() })
describe('群聊项目关闭确认', () => {
    it('取消不提交，过期确认不能恢复授权', () => {
        /** 当前测试独占的授权作用域与入口。 */
        const { scope, control } = setup()
        /** 记录最终业务提交。 */
        const submit = vi.fn()
        control.requestDeactivation('项目', submit)
        dialogs[0]!.options.onCancel(vi.fn())
        dialogs[0]!.options.onOk(vi.fn())
        expect(submit).not.toHaveBeenCalled()
        scope.stop()
    })
    it('确认最多提交一次', () => {
        /** 当前测试独占的授权作用域与入口。 */
        const { scope, control } = setup()
        /** 记录最终业务提交。 */
        const submit = vi.fn()
        /** 记录确认框的完成关闭请求。 */
        const done = vi.fn()
        control.requestDeactivation('项目', submit)
        dialogs[0]!.options.onOk(done)
        dialogs[0]!.options.onOk(done)
        expect(submit).toHaveBeenCalledTimes(1)
        expect(done).toHaveBeenCalledTimes(1)
        scope.stop()
    })
    it('重复打开释放旧弹窗，旧回调失效', () => {
        /** 当前测试独占的授权作用域与入口。 */
        const { scope, control } = setup()
        /** 被替换弹窗绑定的旧提交入口。 */
        const oldSubmit = vi.fn()
        /** 当前弹窗绑定的提交入口。 */
        const newSubmit = vi.fn()
        control.requestDeactivation('旧项目', oldSubmit)
        control.requestDeactivation('新项目', newSubmit)
        expect(dialogs[0]!.destroy).toHaveBeenCalledOnce()
        dialogs[0]!.options.onOk(vi.fn())
        dialogs[1]!.options.onOk(vi.fn())
        expect(oldSubmit).not.toHaveBeenCalled()
        expect(newSubmit).toHaveBeenCalledOnce()
        scope.stop()
    })
    it('主动取消和作用域释放均销毁资源并撤销授权', () => {
        /** 当前测试独占的授权作用域与入口。 */
        const { scope, control } = setup()
        /** 记录最终业务提交。 */
        const submit = vi.fn()
        control.requestDeactivation('项目', submit)
        control.cancel()
        expect(dialogs[0]!.destroy).toHaveBeenCalledOnce()
        dialogs[0]!.options.onOk(vi.fn())
        control.requestDeactivation('项目', submit)
        scope.stop()
        expect(dialogs[1]!.destroy).toHaveBeenCalledOnce()
        dialogs[1]!.options.onOk(vi.fn())
        control.requestDeactivation('已释放', submit)
        expect(dialogs).toHaveLength(2)
        expect(submit).not.toHaveBeenCalled()
    })
})
