import Confirm from '@/components/common/Confirm.vue'
import type { ConfirmDone, ConfirmOptions } from '@/components/common/Confirm.vue'
import { mountComponent } from '@/utils/componentMount'

/** 动态确认框控制器。 */
export interface ConfirmController {
    /** 关闭确认框。 */
    close: () => void
    /** 销毁动态实例。 */
    destroy: () => void
    /** 更新确认框内容。 */
    init: (options: ConfirmOptions) => void
}

/** 挂载一个基于 AlertDialog 的通用确认框。 */
export function useConfirm(options: ConfirmOptions & { onOk?: (done: ConfirmDone) => void | Promise<void>, onCancel?: (done: ConfirmDone) => void | Promise<void> }): ConfirmController {
    if (import.meta.server) return { close: () => {}, destroy: () => {}, init: () => {} }
    let mountedUnmount = () => {}
    const mounted = mountComponent(Confirm, { props: { open: true, onOk: options.onOk, onCancel: options.onCancel, onAfterClose: () => mountedUnmount() } })
    mountedUnmount = mounted.unmount
    const instance = mounted.instance as InstanceType<typeof Confirm> | null
    instance?.init(options)
    return { close: () => instance?.close(), destroy: mounted.unmount, init: value => instance?.init(value) }
}
