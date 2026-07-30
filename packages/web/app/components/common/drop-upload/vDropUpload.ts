import type { ObjectDirective } from 'vue'
import type {
  DropUploadExpose,
  DropUploadOptions,
} from './dropUploadTypes'
import DropUploadOverlay from './Overlay.vue'
import { hasSupportedDropData } from './dropUploadUtils'
import { mountComponent } from '@/utils/componentMount'

/** 覆盖层退场动画时长。 */
const OVERLAY_HIDE_DELAY = 200
/** 局部挂载容器使用的 Tailwind CSS 类。 */
const LOCAL_OVERLAY_CONTAINER_CLASSES = [
  'absolute',
  'inset-0',
  'z-[1000]',
  'pointer-events-auto',
  'rounded-[inherit]',
] as const
/** 全屏挂载容器使用的 Tailwind CSS 类。 */
const FULLSCREEN_OVERLAY_CONTAINER_CLASSES = [
  'fixed',
  'inset-0',
  'z-[1000]',
  'pointer-events-auto',
] as const
/** 需要在已挂载覆盖层中同步的配置字段。 */
const OVERLAY_OPTION_KEYS: Array<keyof DropUploadOptions> = [
  'class',
  'onDrop',
  'onError',
  'onBeforeUpload',
  'maxFiles',
  'multiple',
  'disabled',
  'overlayHint',
  'limitHint',
  'fullWidth',
]

/** 指令注册的拖拽事件处理器。 */
interface DropUploadEventHandlers {
  /** 进入绑定区域。 */
  handleDragEnter: (event: DragEvent) => void
  /** 在绑定区域内移动。 */
  handleDragOver: (event: DragEvent) => void
  /** 离开绑定区域。 */
  handleDragLeave: (event: DragEvent) => void
  /** 在绑定区域内放置。 */
  handleDrop: (event: DragEvent) => void
  /** 窗口级拖拽结束兜底。 */
  handleWindowDragEnd: () => void
  /** 窗口级放置兜底。 */
  handleWindowDrop: () => void
}

/** 指令运行期间保存的状态。 */
interface DropUploadState {
  /** 当前配置。 */
  options: DropUploadOptions
  /** 指令绑定元素，用作目标选择器未命中时的回退。 */
  bindingElement: HTMLElement
  /** 拖拽监听与覆盖层挂载目标。 */
  targetElement: HTMLElement
  /** 是否由指令补充了 relative 类。 */
  hasAddedRelativeClass: boolean
  /** 嵌套 dragenter/dragleave 计数。 */
  dragCounter: number
  /** 覆盖层挂载结果。 */
  mountedOverlay?: ReturnType<typeof mountComponent<typeof DropUploadOverlay>>
  /** 延迟卸载定时器。 */
  hideTimer?: number
  /** 当前绑定的事件处理器。 */
  eventHandlers?: DropUploadEventHandlers
}

/** 每个指令绑定元素对应的内部状态。 */
const dropUploadStates = new WeakMap<HTMLElement, DropUploadState>()

/**
 * 复制指令配置，保证内部始终持有普通对象。
 *
 * @param options 指令绑定值。
 * @returns 可安全读取的配置对象。
 */
function normalizeOptions(options?: DropUploadOptions): DropUploadOptions {
  return { ...(options || {}) }
}

/**
 * 根据配置解析覆盖层目标元素。
 *
 * @param bindingElement 指令绑定元素。
 * @param options 当前指令配置。
 * @returns 命中的目标元素或绑定元素。
 */
function resolveTargetElement(
  bindingElement: HTMLElement,
  options: DropUploadOptions,
): HTMLElement {
  if (!options.targetSelector) return bindingElement
  const matchedElement = document.querySelector(options.targetSelector)
  return matchedElement instanceof HTMLElement ? matchedElement : bindingElement
}

/**
 * 判断目标是否为页面级全局节点。
 *
 * @param targetElement 拖拽监听与覆盖层挂载目标。
 * @returns 是否需要使用视口级固定定位。
 */
function isGlobalTargetElement(targetElement: HTMLElement) {
  return targetElement === document.body || targetElement === document.documentElement
}

/**
 * 为静态定位的目标补充覆盖层定位上下文。
 *
 * @param state 指令内部状态。
 */
function setupTargetPosition(state: DropUploadState) {
  if (isGlobalTargetElement(state.targetElement)) return
  state.hasAddedRelativeClass = getComputedStyle(state.targetElement).position === 'static'
  if (state.hasAddedRelativeClass) state.targetElement.classList.add('relative')
}

/**
 * 恢复指令为目标元素补充的定位类。
 *
 * @param state 指令内部状态。
 */
function restoreTargetPosition(state: DropUploadState) {
  if (!state.hasAddedRelativeClass) return
  state.targetElement.classList.remove('relative')
  state.hasAddedRelativeClass = false
}

/**
 * 读取覆盖层组件暴露的方法。
 *
 * @param state 指令内部状态。
 * @returns 覆盖层暴露实例。
 */
function getOverlayExpose(state: DropUploadState): DropUploadExpose | null {
  return state.mountedOverlay?.instance as unknown as DropUploadExpose | null
}

/**
 * 创建或重新显示覆盖层。
 *
 * @param state 指令内部状态。
 */
function showOverlay(state: DropUploadState) {
  if (state.hideTimer) {
    window.clearTimeout(state.hideTimer)
    state.hideTimer = undefined
  }

  if (state.mountedOverlay?.container) {
    getOverlayExpose(state)?.show()
    return
  }

  const options = state.options
  state.mountedOverlay = mountComponent(DropUploadOverlay, {
    containerEl: state.targetElement,
    props: {
      class: options.class,
      onDrop: options.onDrop,
      onError: options.onError,
      onBeforeUpload: options.onBeforeUpload,
      maxFiles: options.maxFiles,
      multiple: options.multiple,
      disabled: options.disabled,
      overlayHint: options.overlayHint,
      limitHint: options.limitHint,
      fullWidth: options.fullWidth,
      stopPropagation: false,
    },
  })
  const containerClasses = isGlobalTargetElement(state.targetElement)
    ? FULLSCREEN_OVERLAY_CONTAINER_CLASSES
    : LOCAL_OVERLAY_CONTAINER_CLASSES
  state.mountedOverlay.container?.classList.add(...containerClasses)
}

/**
 * 隐藏覆盖层并在动画结束后卸载。
 *
 * @param state 指令内部状态。
 * @param immediately 是否立即卸载。
 */
function hideOverlay(state: DropUploadState, immediately = false) {
  if (state.hideTimer) {
    window.clearTimeout(state.hideTimer)
    state.hideTimer = undefined
  }

  const mountedOverlay = state.mountedOverlay
  if (!mountedOverlay) return
  getOverlayExpose(state)?.hide()

  /** 卸载当前捕获的覆盖层实例。 */
  const unmountOverlay = () => {
    mountedOverlay.unmount()
    if (state.mountedOverlay === mountedOverlay) state.mountedOverlay = undefined
    state.hideTimer = undefined
  }

  if (immediately) {
    unmountOverlay()
    return
  }
  state.hideTimer = window.setTimeout(unmountOverlay, OVERLAY_HIDE_DELAY)
}

/**
 * 判断会传入覆盖层的配置是否变化。
 *
 * @param previousOptions 更新前配置。
 * @param nextOptions 更新后配置。
 * @returns 是否需要刷新已挂载覆盖层。
 */
function hasOverlayOptionsChanged(
  previousOptions: DropUploadOptions,
  nextOptions: DropUploadOptions,
) {
  return OVERLAY_OPTION_KEYS.some(key => previousOptions[key] !== nextOptions[key])
}

/**
 * 将覆盖层迁移到新的目标元素。
 *
 * @param state 指令内部状态。
 * @param nextTargetElement 新的挂载目标。
 */
function moveOverlayTarget(state: DropUploadState, nextTargetElement: HTMLElement) {
  cleanupDragListeners(state)
  hideOverlay(state, true)
  restoreTargetPosition(state)
  state.targetElement = nextTargetElement
  setupTargetPosition(state)
  setupDragListeners(state)
  if (state.dragCounter > 0 && !state.options.disabled) showOverlay(state)
}

/**
 * 注册目标区域拖拽监听与窗口级清理兜底。
 *
 * @param state 指令内部状态。
 */
function setupDragListeners(state: DropUploadState) {
  /** 阻止浏览器默认打开文件或 URL。 */
  const preventDefault = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }
  /** 重置嵌套计数并清理覆盖层。 */
  const resetDragState = () => {
    state.dragCounter = 0
    hideOverlay(state)
  }
  /** 处理拖拽进入。 */
  const handleDragEnter = (event: DragEvent) => {
    if (state.options.disabled || !hasSupportedDropData(event)) return
    preventDefault(event)
    state.dragCounter += 1
    showOverlay(state)
    if (state.dragCounter === 1) state.options.onDragEnter?.(event)
  }
  /** 处理区域内拖拽移动。 */
  const handleDragOver = (event: DragEvent) => {
    if (state.options.disabled || !hasSupportedDropData(event)) return
    preventDefault(event)
  }
  /** 处理拖拽离开。 */
  const handleDragLeave = (event: DragEvent) => {
    if (state.options.disabled || state.dragCounter === 0) return
    preventDefault(event)
    state.dragCounter = Math.max(0, state.dragCounter - 1)
    if (state.dragCounter !== 0) return
    hideOverlay(state)
    state.options.onDragLeave?.(event)
  }
  /** 处理区域内放置后的状态清理。 */
  const handleDrop = (event: DragEvent) => {
    if (state.options.disabled) return
    preventDefault(event)
    resetDragState()
  }

  state.eventHandlers = {
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleWindowDragEnd: resetDragState,
    handleWindowDrop: resetDragState,
  }
  state.targetElement.addEventListener('dragenter', handleDragEnter)
  state.targetElement.addEventListener('dragover', handleDragOver)
  state.targetElement.addEventListener('dragleave', handleDragLeave)
  state.targetElement.addEventListener('drop', handleDrop)
  window.addEventListener('dragend', resetDragState)
  window.addEventListener('drop', resetDragState)
}

/**
 * 移除指令注册的全部拖拽监听。
 *
 * @param state 指令内部状态。
 */
function cleanupDragListeners(state: DropUploadState) {
  const handlers = state.eventHandlers
  if (!handlers) return
  state.targetElement.removeEventListener('dragenter', handlers.handleDragEnter)
  state.targetElement.removeEventListener('dragover', handlers.handleDragOver)
  state.targetElement.removeEventListener('dragleave', handlers.handleDragLeave)
  state.targetElement.removeEventListener('drop', handlers.handleDrop)
  window.removeEventListener('dragend', handlers.handleWindowDragEnd)
  window.removeEventListener('drop', handlers.handleWindowDrop)
  state.eventHandlers = undefined
}

/** 拖拽上传指令。 */
const vDropUpload: ObjectDirective<HTMLElement, DropUploadOptions> = {
  mounted(element, binding) {
    const options = normalizeOptions(binding.value)
    const state: DropUploadState = {
      options,
      bindingElement: element,
      targetElement: resolveTargetElement(element, options),
      hasAddedRelativeClass: false,
      dragCounter: 0,
    }
    setupTargetPosition(state)
    setupDragListeners(state)
    dropUploadStates.set(element, state)
  },

  updated(element, binding) {
    const state = dropUploadStates.get(element)
    if (!state) return
    const previousOptions = state.options
    const nextOptions = normalizeOptions(binding.value)
    const nextTargetElement = resolveTargetElement(element, nextOptions)
    const hasTargetChanged = nextTargetElement !== state.targetElement
    const shouldRefreshOverlay = hasOverlayOptionsChanged(previousOptions, nextOptions)
    state.options = nextOptions

    if (hasTargetChanged) {
      moveOverlayTarget(state, nextTargetElement)
      return
    }
    if (state.options.disabled) {
      state.dragCounter = 0
      hideOverlay(state)
      return
    }
    if (shouldRefreshOverlay && state.mountedOverlay) {
      hideOverlay(state, true)
      if (state.dragCounter > 0) showOverlay(state)
    }
  },

  unmounted(element) {
    const state = dropUploadStates.get(element)
    if (!state) return
    cleanupDragListeners(state)
    hideOverlay(state, true)
    restoreTargetPosition(state)
    dropUploadStates.delete(element)
  },
}

export default vDropUpload
