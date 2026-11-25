import { defineAsyncComponent, defineComponent, h, inject, onScopeDispose, provide, ref, shallowRef, type InjectionKey } from 'vue'
import { bridgeServiceControlKey, createBridgeSettingsPresenter, createSettingsControl, type BridgeServiceControl } from './useBridgeServiceControl'
import { mountComponent } from '../utils/componentMount'
import TooltipProvider from '../components/ui/tooltip/TooltipProvider.vue'

/** 项目设置的明确业务目标。 */
export type BridgeProjectSettingsTarget
    = | { /** 群项目绑定。 */ kind: 'group', /** 群身份。 */ chatId: string }
      | { /** 项目目录编辑。 */ kind: 'project', /** 项目目录身份。 */ projectPath: string }
      | { /** 登记本机已有项目。 */ kind: 'import' }
/** 打开项目设置时的目标与写入通知。 */
export type BridgeProjectSettingsOptions = BridgeProjectSettingsTarget & {
    /** 真实写入成功后刷新调用方；调用范围释放后不再执行。 */
    onSaved?: () => void | Promise<void>
}
/** 动态设置会话的调用范围与目标。 */
interface SettingsSession {
    /** 调用方作用域身份。 */
    caller: symbol
    /** 目标及保存回调。 */
    options: BridgeProjectSettingsOptions
    /** 组件目标身份，切换时卸载旧业务实例。 */
    key: string
}
/** 共享挂载控制器，布局与外部调用采用同一生命周期实现。 */
interface ProjectSettingsPresenter {
    /** 打开或复用指定目标。 */
    open: (options: BridgeProjectSettingsOptions, caller: symbol) => void
    /** 释放当前调用方拥有的弹窗。 */
    release: (caller: symbol) => void
    /** 释放布局拥有的挂载资源。 */
    dispose: () => void
}
/** Bridge 布局中的唯一项目设置挂载入口。 */
const projectSettingsKey: InjectionKey<ProjectSettingsPresenter> = Symbol('bridge-project-settings')

/** 捕获应用上下文，仅在用户打开时挂载动态宿主。 */
function createProjectSettingsPresenter(control?: BridgeServiceControl): ProjectSettingsPresenter {
    /** setup 中捕获，事件及异步加载不再依赖当前实例。 */
    const nuxtApp = useNuxtApp()
    /** 当前目标与调用范围。 */
    const session = shallowRef<SettingsSession>()
    /** 宿主控制的弹窗开关。 */
    const open = ref(false)
    /** 布局释放后禁止继续打开。 */
    let active = true
    /** 复用标准 presenter；取消当前调用后可重新建立挂载周期。 */
    let presenter = createBridgeSettingsPresenter(mount)
    /** 实际动态挂载边界，业务状态仍由 Relations 独占。 */
    function mount(afterClose: () => void) {
        /** 显式恢复动态挂载丢失的布局 provide 链。 */
        const Host = defineComponent({
            name: 'BridgeProjectSettingsHost',
            setup() {
                /** 外部入口只在打开期间创建非轮询服务控制器。 */
                const serviceControl = control ?? createSettingsControl()
                provide(bridgeServiceControlKey, serviceControl)
                provide(projectSettingsKey, controller)
                if (!control) onScopeDispose(serviceControl.dispose)
                /** 点击打开后才加载关系与编辑器代码。 */
                const Relations = defineAsyncComponent(() => import('../components/business/bridge-manager/BusBridgeRelations.vue'))
                return () => {
                    /** 本次渲染对应的目标，隔离旧组件的事件。 */
                    const current = session.value
                    if (!current) return null
                    return h(TooltipProvider, { delayDuration: 150 }, () => h(Relations, {
                        key: current.key,
                        target: current.options,
                        open: open.value,
                        'onUpdate:open': (value: boolean) => { if (session.value === current) open.value = value },
                        committed: current.options.onSaved,
                        onAfterClose: () => { if (session.value === current && !open.value) afterClose() },
                    }))
                }
            },
        })
        /** 挂载失败返回空句柄，后续调用仍可重试。 */
        const mounted = nuxtApp.runWithContext(() => mountComponent(Host)) as ReturnType<typeof mountComponent>
        return mounted.container ? mounted : undefined
    }
    /** 布局或调用范围的资源控制契约。 */
    const controller: ProjectSettingsPresenter = {
        open(options, caller) {
            if (!active || import.meta.server) return
            /** 业务身份只来自明确目标，不扫描目录。 */
            const key = JSON.stringify(options.kind === 'group' ? ['group', options.chatId] : options.kind === 'project' ? ['project', options.projectPath] : ['import'])
            session.value = { options, caller, key }
            open.value = true
            presenter.open()
        },
        release(caller) {
            if (session.value?.caller !== caller) return
            session.value = undefined
            open.value = false
            presenter.dispose()
            presenter = createBridgeSettingsPresenter(mount)
        },
        dispose() { active = false; session.value = undefined; open.value = false; presenter.dispose() },
    }
    return controller
}

/** 在 Bridge 布局复用唯一 presenter 与服务控制器。 */
export function provideBridgeProjectSettings(control: BridgeServiceControl): void {
    /** 当前布局专属的项目设置挂载资源。 */
    const presenter = createProjectSettingsPresenter(control)
    provide(projectSettingsKey, presenter)
    onScopeDispose(presenter.dispose)
}

/** 任意模块的项目设置入口，setup 捕获上下文，点击时才挂载。 */
export function useBridgeProjectSettings() {
    /** 布局内复用，外部创建随调用范围释放的 presenter。 */
    const shared = inject(projectSettingsKey, null)
    /** 当前调用方使用的挂载入口。 */
    const presenter = shared ?? createProjectSettingsPresenter()
    /** 回调和清理都绑定当前调用作用域。 */
    const caller = Symbol('project-settings-caller')
    /** 作用域释放后不允许晚到事件重新打开或通知。 */
    let active = true
    onScopeDispose(() => { active = false; if (shared) presenter.release(caller); else presenter.dispose() })
    /** 打开群绑定、目录编辑或导入，并保护调用方保存回调。 */
    function openProjectSettings(options: BridgeProjectSettingsOptions): void {
        if (!active) return
        presenter.open({ ...options, onSaved: () => { if (active) return options.onSaved?.() } }, caller)
    }
    return { openProjectSettings }
}
