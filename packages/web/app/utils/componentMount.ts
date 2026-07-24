import {
  createVNode,
  render,
  watch,
  type Component,
  type ComponentInstance,
  type VNode,
} from 'vue'

export interface MountComponentOptions<Props = Record<string, unknown>> {
  props?: Props
  onMounted?: () => void
  onUnmounted?: () => void
  containerEl?: string | HTMLElement
  unmountDelay?: number
  autoUnmount?: boolean
  watchStateKey?: string
}

type ExtractComponentProps<T> = ComponentInstance<T>['$props']

export interface MountComponentReturn<T extends Component = Component> {
  instance: ComponentInstance<T> | null
  container: HTMLElement | null
  unmount: () => void
}

function emptyMountResult<T extends Component>(): MountComponentReturn<T> {
  return {
    instance: null,
    container: null,
    unmount: () => {},
  }
}

export function mountComponent<
  T extends Component = Component,
  Props = ExtractComponentProps<T>,
>(
  ComponentToMount: T,
  options: MountComponentOptions<Props> = {},
): MountComponentReturn<T> {
  if (!import.meta.client) return emptyMountResult<T>()

  const mainVueApp = useNuxtApp().vueApp

  return mainVueApp.runWithContext(() => {
    let container: HTMLElement | null = null
    let vnode: VNode | null = null
    let instance: ComponentInstance<T> | null = null
    let stopWatcher: (() => void) | null = null
    let unmountTimer: ReturnType<typeof setTimeout> | null = null
    let isMounted = false

    const unmount = () => {
      if (!isMounted) return
      isMounted = false

      if (unmountTimer) {
        clearTimeout(unmountTimer)
        unmountTimer = null
      }

      stopWatcher?.()
      stopWatcher = null

      try {
        options.onUnmounted?.()
      }
      catch (error) {
        console.warn('[componentMount] onUnmounted callback failed:', error)
      }

      try {
        if (container) {
          render(null, container)
          container.remove()
        }
      }
      catch (error) {
        console.warn('[componentMount] Error during unmount:', error)
      }
      finally {
        container = null
        vnode = null
        instance = null
      }
    }

    try {
      container = document.createElement('div')
      container.dataset.askxComponentMount = ''

      const appendTarget = typeof options.containerEl === 'string'
        ? document.querySelector<HTMLElement>(options.containerEl) || document.body
        : options.containerEl || document.body

      vnode = createVNode(ComponentToMount, options.props || {})
      vnode.appContext = mainVueApp._context
      render(vnode, container)
      appendTarget.appendChild(container)
      isMounted = true

      if (vnode.component) {
        instance = (vnode.component.exposed || vnode.component.proxy) as ComponentInstance<T> | null
      }

      options.onMounted?.()

      if (options.autoUnmount === true && instance) {
        const stateKey = options.watchStateKey || 'isOpen'
        const stateRecord = instance as Record<string, unknown>

        if (stateRecord[stateKey] !== undefined) {
          stopWatcher = watch(
            () => {
              const currentState = (instance as Record<string, unknown> | null)?.[stateKey]
              if (currentState && typeof currentState === 'object' && 'value' in currentState) {
                return (currentState as { value: unknown }).value
              }
              return currentState
            },
            (value, previousValue) => {
              if (previousValue === true && value === false) {
                unmountTimer = setTimeout(unmount, options.unmountDelay ?? 300)
              }
            },
          )
        }
      }

      return {
        instance,
        container,
        unmount,
      }
    }
    catch (error) {
      console.error('[componentMount] Error mounting component:', error)

      if (isMounted) unmount()
      else if (container) {
        if (vnode) render(null, container)
        container.remove()
      }

      return emptyMountResult<T>()
    }
  })
}
