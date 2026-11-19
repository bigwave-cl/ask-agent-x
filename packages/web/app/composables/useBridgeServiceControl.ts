import { computed, inject, onMounted, onUnmounted, provide, readonly, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue'

/** 页面消费的桥接运行状态，来自服务端唯一状态接口。 */
export interface BridgeServiceSnapshot {
    /** 实际进程状态。 */
    runtimeStatus: 'stopped' | 'starting' | 'running' | 'scheduled_off' | 'stopping' | 'updating' | 'failed'
    /** 用户保存的启停意图。 */
    desiredState: 'enabled' | 'disabled'
    /** 运行健康检查结果。 */
    healthy: boolean
    /** 当前是否位于允许工作时间。 */
    insideWindow: boolean
    /** 下一个工作时间边界。 */
    nextTransitionAt: string | null
    /** 最近一次服务错误原因。 */
    lastError: string | null
}

/** 同一桥接页面共享的状态与交互准入契约。 */
export interface BridgeServiceControl {
    /** 最近一次完成核验的服务状态，只允许 owner 写入。 */
    status: Readonly<Ref<BridgeServiceSnapshot | null>>
    /** 服务健康、运行且处于工作时间时允许桥接操作。 */
    ready: ComputedRef<boolean>
    /** 服务状态的统一语义图标。 */
    statusIcon: ComputedRef<string>
    /** 设置面板开关。 */
    settingsOpen: Ref<boolean>
    /** 当前设置页；受阻操作始终打开服务控制。 */
    settingsTab: Ref<'service' | 'feishu'>
    /** 刷新真实状态；force 使旧读取失效，适用于服务操作完成后。 */
    refreshStatus: (force?: boolean) => Promise<BridgeServiceSnapshot | null>
    /** 操作前重新核验；未运行时只打开服务面板，不重放业务操作。 */
    requireRunning: () => Promise<boolean>
    /** 手动打开服务控制面板。 */
    openSettings: () => void
    /** 页面离开时使请求与后续提交失效。 */
    dispose: () => void
}

/** 同一页面中的组件共享一个服务状态 owner。 */
const bridgeServiceControlKey: InjectionKey<BridgeServiceControl> = Symbol('bridge-service-control')

/** 创建状态 owner；注入读取能力以便验证竞态而不启动真实服务。 */
export function createBridgeServiceControl(readStatus: (signal: AbortSignal) => Promise<BridgeServiceSnapshot>): BridgeServiceControl {
    /** 已完成核验的唯一状态快照。 */
    const status = ref<BridgeServiceSnapshot | null>(null)
    /** 设置弹层开关。 */
    const settingsOpen = ref(false)
    /** 设置中的当前页。 */
    const settingsTab = ref<'service' | 'feishu'>('service')
    /** 页面生命周期是否仍有效。 */
    let active = true
    /** 状态请求失效序号。 */
    let generation = 0
    /** 当前状态请求的取消控制器。 */
    let controller: AbortController | null = null
    /** 合并轮询与点击产生的并发状态读取。 */
    let flight: Promise<BridgeServiceSnapshot | null> | null = null
    /** 业务可操作条件不依赖内部 loading。 */
    const ready = computed(() => status.value?.runtimeStatus === 'running' && status.value.healthy && status.value.insideWindow)
    /** 状态图标与配置面板、侧栏保持一致。 */
    const statusIcon = computed(() => {
        if (ready.value) return 'askx-status:check'
        if (status.value?.runtimeStatus === 'failed') return 'askx-status:error'
        if (status.value?.runtimeStatus === 'scheduled_off') return 'askx-status:prohibited'
        if (['starting', 'stopping', 'updating'].includes(status.value?.runtimeStatus || '')) return 'askx-status:loading'
        return 'askx-status:info'
    })

    /** 服务状态唯一提交入口；失效响应不能覆盖后发请求或离开的页面。 */
    function refreshStatus(force = false): Promise<BridgeServiceSnapshot | null> {
        if (!active) return Promise.resolve(null)
        if (flight && !force) return flight
        controller?.abort()
        /** 本次刷新所在的生命周期。 */
        const current = ++generation
        /** 本次请求独立的取消控制器。 */
        const requestController = new AbortController()
        controller = requestController
        /** 将失败也收口为未知状态，禁止沿用过期的运行中快照。 */
        const pending = Promise.resolve().then(() => readStatus(requestController.signal)).then(value => {
            if (!active || current !== generation) return null
            status.value = value
            return value
        }).catch(() => {
            if (active && current === generation) status.value = null
            return null
        }).finally(() => {
            if (flight === pending) { flight = null; controller = null }
        })
        flight = pending
        return pending
    }

    /** 进入设置时总是定位服务控制，保留已有配置草稿。 */
    function openSettings(): void {
        if (!active) return
        settingsTab.value = 'service'
        settingsOpen.value = true
    }

    /** 点击业务操作后重新读取状态，失败时交给用户启动服务。 */
    async function requireRunning(): Promise<boolean> {
        /** 当前动作等待的实时状态。 */
        const runtime = await refreshStatus()
        if (!active) return false
        if (runtime && ready.value) return true
        openSettings()
        return false
    }

    /** 只释放当前 owner 的资源，不改动服务本身。 */
    function dispose(): void {
        active = false
        generation += 1
        controller?.abort()
        controller = null
        flight = null
    }

    return { status: readonly(status), ready, statusIcon, settingsOpen, settingsTab, refreshStatus, requireRunning, openSettings, dispose }
}

/** 在桥接页面建立单个状态 owner，并维护不重叠的后台轮询。 */
export function provideBridgeServiceControl(): BridgeServiceControl {
    /** 当前页面的控制器实例。 */
    const control = createBridgeServiceControl(signal => $fetch<BridgeServiceSnapshot>('/api/bridge/status', { signal, timeout: 10000, retry: 0 }))
    /** 轮询生命周期。 */
    let active = false
    /** 完成当前读取之后再安排下一次轮询。 */
    let timer: ReturnType<typeof setTimeout> | undefined
    /** 串行刷新状态，避免后台请求积压。 */
    async function poll(): Promise<void> {
        await control.refreshStatus()
        if (active) timer = setTimeout(() => void poll(), 5000)
    }
    provide(bridgeServiceControlKey, control)
    onMounted(() => { active = true; void poll() })
    onUnmounted(() => { active = false; if (timer) clearTimeout(timer); control.dispose() })
    return control
}

/** 子组件消费页面 owner，禁止自行创建第二套服务状态。 */
export function useBridgeServiceControl(): BridgeServiceControl {
    /** 父页面提供的唯一控制器。 */
    const control = inject(bridgeServiceControlKey)
    if (!control) throw new Error('Bridge service control requires its page provider')
    return control
}
