import { computed, defineAsyncComponent, defineComponent, h, inject, nextTick, onScopeDispose, onMounted, onUnmounted, provide, readonly, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import { mountComponent } from '../utils/componentMount'

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
    /** 服务状态圆点颜色与本地化文案键。 */
    statusIndicator: ComputedRef<{
        /** 圆点的语义背景色类名。 */
        colorClass: string
        /** 当前状态的国际化文案键。 */
        labelKey: string
    }>
    /** 设置面板开关。 */
    settingsOpen: Ref<boolean>
    /** 当前设置页；受阻操作始终打开服务控制。 */
    settingsTab: Ref<'service' | 'config' | 'feishu'>
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
export const bridgeServiceControlKey: InjectionKey<BridgeServiceControl> = Symbol('bridge-service-control')

/**
 * 创建状态 owner；注入读取能力以便验证竞态而不启动真实服务。
 * @param readStatus 读取服务状态的异步函数。
 * @param onSettingsOpen 设置面板首次打开时执行的动态挂载回调。
 */
export function createBridgeServiceControl(
    readStatus: (signal: AbortSignal) => Promise<BridgeServiceSnapshot>,
    onSettingsOpen?: () => void,
): BridgeServiceControl {
    /** 已完成核验的唯一状态快照。 */
    const status = ref<BridgeServiceSnapshot | null>(null)
    /** 设置弹层开关。 */
    const settingsOpen = ref(false)
    /** 设置中的当前页。 */
    const settingsTab = ref<'service' | 'config' | 'feishu'>('service')
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
    /** 状态圆点颜色与准确运行状态文案。 */
    const statusIndicator = computed(() => {
        /** 服务端最近确认的实际运行状态。 */
        const runtime = status.value?.runtimeStatus
        /** 保留全部运行状态的准确文案。 */
        const labelKey = runtime ? `bridge.runtime.${runtime}` : 'bridge.runtime.unknown'
        if (runtime === 'failed') return { colorClass: 'bg-destructive', labelKey }
        if (runtime === 'starting' || runtime === 'stopping' || runtime === 'updating' || (runtime === 'running' && !ready.value)) return { colorClass: 'bg-warning', labelKey }
        if (ready.value) return { colorClass: 'bg-success', labelKey }
        return { colorClass: 'bg-muted-foreground', labelKey }
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
        onSettingsOpen?.()
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

    return { status: readonly(status), ready, statusIndicator, settingsOpen, settingsTab, refreshStatus, requireRunning, openSettings, dispose }
}

/** 动态面板会话：关闭异步释放，重开与失效不会销毁新实例。 */
export function createBridgeSettingsPresenter(mount: (afterClose: () => void) => { unmount: () => void } | undefined) {
    /** 当前挂载实例。 */
    let instance: { unmount: () => void } | undefined
    /** 会话有效标记。 */
    let active = true
    /** 每次重新打开或销毁都会取消已排队的关闭清理。 */
    let generation = 0
    /** 包含退场动画期间在内，重复打开始终复用同一实例。 */
    function open(): void {
        if (!active) return
        generation += 1
        if (instance) return
        /** 本次实例用于隔离旧关闭回调。 */
        const current = mount(() => {
            if (!active || instance !== current) return
            /** 关闭完成所在的打开周期。 */
            const closingGeneration = generation
            void nextTick(() => {
                if (!active || generation !== closingGeneration || instance !== current) return
                instance = undefined
                current?.unmount()
            })
        })
        instance = current
    }
    /** 布局或调用范围失效时立即释放实例，无需等待退场动画。 */
    function dispose(): void { active = false; generation += 1; instance?.unmount(); instance = undefined }
    return { open, dispose }
}

/** 创建动态面板与唯一服务 owner，不在这里启动轮询。 */
export function createSettingsControl(): BridgeServiceControl {
    /** 捕获应用上下文，异步准入完成后仍可挂载。 */
    const nuxtApp = useNuxtApp()
    /** 每个控制器仅拥有一个动态实例。 */
    const presenter = createBridgeSettingsPresenter(afterClose => {
        /** 动态宿主继承应用上下文并显式提供现有服务 owner。 */
        const SettingsHost = defineComponent({
            name: 'BridgeSettingsHost',
            setup() {
                provide(bridgeServiceControlKey, control)
                /** 设置代码只在打开时加载。 */
                const Settings = defineAsyncComponent(() => import('../components/business/bridge-manager/BusBridgeSettings.vue'))
                return () => h(Settings, {
                    open: control.settingsOpen.value,
                    onAfterClose: () => { if (!control.settingsOpen.value) afterClose() },
                    'onUpdate:open': (value: boolean) => {
                        control.settingsOpen.value = value
                    },
                })
            },
        })
        /** 工具返回空句柄表示挂载失败，下次打开仍可重试。 */
        const mounted = nuxtApp.runWithContext(() => mountComponent(SettingsHost)) as ReturnType<typeof mountComponent>
        return mounted.container ? mounted : undefined
    })
    /** 当前设置与服务状态的共享控制器，挂载回调在初始化后才执行。 */
    const control: BridgeServiceControl = createBridgeServiceControl(
        signal => $fetch<BridgeServiceSnapshot>('/api/bridge/status', { signal, timeout: 10000, retry: 0 }),
        () => { if (import.meta.server) return; presenter.open(); void control.refreshStatus() },
    )
    /** 保留状态 owner 自身的失效入口。 */
    const disposeStatus = control.dispose
    control.dispose = () => { presenter.dispose(); disposeStatus() }
    return control
}

/** 任意模块的设置入口；桥接内复用 owner，外部只创建随调用范围释放的临时 owner。 */
export function useBridgeSettings(): Pick<BridgeServiceControl, 'openSettings'> {
    if (import.meta.server) return { openSettings: () => {} }
    /** 优先复用布局提供的运行状态。 */
    const shared = inject(bridgeServiceControlKey, null)
    if (shared) return { openSettings: shared.openSettings }
    /** 外部入口不启动永久轮询。 */
    const control = createSettingsControl()
    onScopeDispose(control.dispose)
    return { openSettings: control.openSettings }
}

/** 在桥接布局建立单个状态 owner，并维护不重叠的后台轮询。 */
export function provideBridgeServiceControl(): BridgeServiceControl {
    /** 当前布局的共享控制器。 */
    const control = createSettingsControl()
    /** 轮询生命周期。 */
    let active = false
    /** 当前轮询计时器。 */
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

/** 子组件消费布局 owner，禁止自行创建第二套服务状态。 */
export function useBridgeServiceControl(): BridgeServiceControl {
    /** 父布局提供的唯一控制器。 */
    const control = inject(bridgeServiceControlKey)
    if (!control) throw new Error('Bridge service control requires its layout provider')
    return control
}
