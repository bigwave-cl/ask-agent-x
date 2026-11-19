import { describe, expect, it, vi } from 'vitest'
import { createBridgeServiceControl, type BridgeServiceSnapshot } from './useBridgeServiceControl'

/** 创建满足运行准入条件的服务快照，可覆盖单个条件。 */
function snapshot(patch: Partial<BridgeServiceSnapshot> = {}): BridgeServiceSnapshot {
    return { runtimeStatus: 'running', desiredState: 'enabled', healthy: true, insideWindow: true, nextTransitionAt: null, lastError: null, ...patch }
}

/** 可主动控制响应先后顺序的状态请求。 */
function deferred() {
    /** 本次请求完成入口。 */
    let resolve!: (value: BridgeServiceSnapshot) => void
    /** 本次请求失败入口。 */
    let reject!: (reason: Error) => void
    /** 模拟网络读取结果。 */
    const promise = new Promise<BridgeServiceSnapshot>((done, fail) => { resolve = done; reject = fail })
    return { promise, resolve, reject }
}

describe('createBridgeServiceControl', () => {
    it.each([
        { runtimeStatus: 'stopped' as const },
        { runtimeStatus: 'failed' as const },
        { runtimeStatus: 'scheduled_off' as const },
        { healthy: false },
        { insideWindow: false },
    ])('受阻状态 %j 打开服务设置且不放行业务操作', async patch => {
        /** 当前测试独占的服务状态 owner。 */
        const control = createBridgeServiceControl(vi.fn(async () => snapshot(patch)))
        control.settingsTab.value = 'feishu'
        expect(await control.requireRunning()).toBe(false)
        expect(control.ready.value).toBe(false)
        expect(control.settingsOpen.value).toBe(true)
        expect(control.settingsTab.value).toBe('service')
        control.dispose()
    })

    it('运行健康且位于工作时间时放行，不自动打开或切换设置', async () => {
        /** 当前测试独占的服务状态 owner。 */
        const control = createBridgeServiceControl(vi.fn(async () => snapshot()))
        control.settingsTab.value = 'feishu'
        expect(await control.requireRunning()).toBe(true)
        expect(control.ready.value).toBe(true)
        expect(control.settingsOpen.value).toBe(false)
        expect(control.settingsTab.value).toBe('feishu')
        control.dispose()
    })

    it('每次业务动作重新读取，缓存运行状态不能放行后续已停止的服务', async () => {
        /** 连续两次读取分别模拟运行与停止。 */
        const read = vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot({ runtimeStatus: 'stopped' }))
        /** 当前测试独占的服务状态 owner。 */
        const control = createBridgeServiceControl(read)
        expect(await control.requireRunning()).toBe(true)
        expect(await control.requireRunning()).toBe(false)
        expect(read).toHaveBeenCalledTimes(2)
        expect(control.status.value?.runtimeStatus).toBe('stopped')
        expect(control.settingsOpen.value).toBe(true)
        control.dispose()
    })

    it('并发刷新与操作准入合并成一次状态读取', async () => {
        /** 尚未完成的模拟网络请求。 */
        const response = deferred()
        /** 统计状态读取次数。 */
        const read = vi.fn(() => response.promise)
        /** 当前测试独占的服务状态 owner。 */
        const control = createBridgeServiceControl(read)
        /** 轮询和两个交互并发等待同一个结果。 */
        const refresh = control.refreshStatus()
        /** 第二次刷新必须复用原 promise。 */
        const repeated = control.refreshStatus()
        /** 业务操作也应复用当前正在读取的实时状态。 */
        const admission = control.requireRunning()
        expect(repeated).toBe(refresh)
        await Promise.resolve()
        expect(read).toHaveBeenCalledOnce()
        response.resolve(snapshot())
        expect(await admission).toBe(true)
        await refresh
        control.dispose()
    })

    it('强制刷新使旧 running 响应失效，不能覆盖新 stopped', async () => {
        /** 较早发出但较晚返回的读取。 */
        const oldResponse = deferred()
        /** 服务操作之后发出的新读取。 */
        const newResponse = deferred()
        /** 保存请求信号以验证旧读取被取消。 */
        const signals: AbortSignal[] = []
        /** 按次序返回两个独立请求。 */
        const read = vi.fn((signal: AbortSignal) => {
            signals.push(signal)
            return signals.length === 1 ? oldResponse.promise : newResponse.promise
        })
        /** 当前测试独占的服务状态 owner。 */
        const control = createBridgeServiceControl(read)
        /** 最早的状态读取。 */
        const first = control.refreshStatus()
        await Promise.resolve()
        /** 强制刷新必须使最早读取失效。 */
        const latest = control.refreshStatus(true)
        await Promise.resolve()
        expect(signals[0]?.aborted).toBe(true)
        newResponse.resolve(snapshot({ runtimeStatus: 'stopped' }))
        await latest
        expect(control.ready.value).toBe(false)
        oldResponse.resolve(snapshot())
        expect(await first).toBeNull()
        expect(control.status.value?.runtimeStatus).toBe('stopped')
        expect(control.ready.value).toBe(false)
        control.dispose()
    })

    it('刷新失败清除旧 running 快照，后续操作不能沿用缓存', async () => {
        /** 第一次成功后状态读取失败。 */
        const read = vi.fn().mockResolvedValueOnce(snapshot()).mockRejectedValue(new Error('network unavailable'))
        /** 当前测试独占的服务状态 owner。 */
        const control = createBridgeServiceControl(read)
        await control.refreshStatus()
        expect(control.ready.value).toBe(true)
        expect(await control.refreshStatus()).toBeNull()
        expect(control.status.value).toBeNull()
        expect(control.ready.value).toBe(false)
        expect(await control.requireRunning()).toBe(false)
        expect(control.settingsOpen.value).toBe(true)
        control.dispose()
    })

    it('dispose 之后晚返回不能写状态或打开设置，后续刷新不再请求', async () => {
        /** 页面离开时仍未返回的请求。 */
        const response = deferred()
        /** 捕获取消信号，模拟忽略取消的网络层。 */
        let signal: AbortSignal | undefined
        /** 当前测试使用的读取函数。 */
        const read = vi.fn((current: AbortSignal) => { signal = current; return response.promise })
        /** 当前测试独占的服务状态 owner。 */
        const control = createBridgeServiceControl(read)
        control.settingsTab.value = 'feishu'
        /** 等待状态的业务动作。 */
        const admission = control.requireRunning()
        await Promise.resolve()
        control.dispose()
        expect(signal?.aborted).toBe(true)
        response.resolve(snapshot({ runtimeStatus: 'stopped' }))
        expect(await admission).toBe(false)
        expect(control.status.value).toBeNull()
        expect(control.settingsOpen.value).toBe(false)
        expect(control.settingsTab.value).toBe('feishu')
        control.openSettings()
        expect(control.settingsOpen.value).toBe(false)
        expect(await control.refreshStatus(true)).toBeNull()
        expect(read).toHaveBeenCalledOnce()
    })
})
