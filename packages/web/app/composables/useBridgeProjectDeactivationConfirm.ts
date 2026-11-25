import { onScopeDispose } from 'vue'
import { useConfirm, type ConfirmController } from './useConfirm'

/** 共用关闭群聊项目确认，仅管理授权回调和弹窗生命周期。 */
export function useBridgeProjectDeactivationConfirm() {
    /** 国际化入口。 */
    const { t } = useI18n()
    /** 当前动态确认实例。 */
    let controller: ConfirmController | undefined
    /** 每次替换或取消使先前的授权失效。 */
    let generation = 0
    /** 调用作用域已释放。 */
    let disposed = false
    /** 撤销当前授权并释放弹窗。 */
    function cancel(): void {
        generation++
        controller?.destroy()
        controller = undefined
    }
    /** 请求关闭授权，确认回调最多执行一次。 */
    function requestDeactivation(projectName: string, onConfirm: () => void): void {
        cancel()
        if (disposed) return
        /** 本次弹窗的授权身份。 */
        const current = generation
        controller = useConfirm({
            title: t('bridge.deactivateProjectTitle'),
            desc: t('bridge.deactivateProjectHint', { name: projectName }),
            okText: t('bridge.confirmDeactivateProject'),
            cancelText: t('common.cancel'),
            onOk: done => {
                if (disposed || current !== generation) return
                generation++
                done()
                onConfirm()
            },
            onCancel: done => {
                if (current !== generation) return
                generation++
                done()
            },
        })
    }
    onScopeDispose(() => { disposed = true; cancel() })
    return { requestDeactivation, cancel }
}
