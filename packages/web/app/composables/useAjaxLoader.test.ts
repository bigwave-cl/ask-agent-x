import { describe, expect, it, vi } from 'vitest'
import { useAjaxLoader } from './useAjaxLoader'

/** 等待客户端释放任务进入下一事件循环。 */
async function settleLoader(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0))
}

describe('useAjaxLoader', () => {
    it('单个任务能够正确开启和关闭', async () => {
        const controller = useAjaxLoader()
        controller.loader(true)
        expect(controller.ajaxLoader.value).toBe(true)
        controller.loader(false)
        await settleLoader()
        expect(controller.ajaxLoader.value).toBe(false)
    })

    it('并发任务全部结束后才关闭', async () => {
        const controller = useAjaxLoader()
        controller.loader(true)
        controller.loader(true)
        controller.loader(false)
        await settleLoader()
        expect(controller.ajaxLoader.value).toBe(true)
        controller.loader(false)
        await settleLoader()
        expect(controller.ajaxLoader.value).toBe(false)
    })

    it('包装函数在失败时释放并保留原错误', async () => {
        const controller = useAjaxLoader()
        const failure = new Error('failed')
        const task = controller.wrapPromiseWithLoader(async () => { throw failure })
        await expect(task()).rejects.toBe(failure)
        await settleLoader()
        expect(controller.ajaxLoader.value).toBe(false)
    })

    it('第一个包装任务会在执行前让出绘制时机', async () => {
        const order: string[] = []
        const controller = useAjaxLoader()
        const task = controller.wrapPromiseWithLoader(async () => { order.push('task') })
        const promise = task()
        order.push(controller.ajaxLoader.value ? 'loading' : 'idle')
        await promise
        expect(order).toEqual(['loading', 'task'])
    })

    it('多余释放不会导致后续任务提前关闭', async () => {
        const controller = useAjaxLoader()
        controller.loader(false)
        controller.loader(true)
        controller.loader(false)
        await settleLoader()
        expect(controller.ajaxLoader.value).toBe(false)
    })

    it('重置会清空状态并通知观察者', () => {
        const observer = vi.fn()
        const controller = useAjaxLoader(observer)
        controller.loader(true)
        controller.resetLoader()
        expect(controller.ajaxLoader.value).toBe(false)
        expect(observer).toHaveBeenLastCalledWith(false)
    })
})
