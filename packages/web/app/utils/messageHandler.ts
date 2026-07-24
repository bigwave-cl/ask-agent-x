import type { Emitter, EventType, Handler } from 'mitt'

export type CleanupFunction = () => void
export type CleanupInput = CleanupFunction | readonly CleanupFunction[]

interface AskXMediaQueryListEventMap {
  change: MediaQueryListEvent
}

export type TargetEventMap<T> = T extends Window
  ? WindowEventMap
  : T extends Document
    ? DocumentEventMap
    : T extends HTMLElement
      ? HTMLElementEventMap
      : T extends SVGElement
        ? SVGElementEventMap
        : T extends MediaQueryList
          ? AskXMediaQueryListEventMap
          : T extends Emitter<infer Events>
            ? Events
            : Record<EventType, Event>

export type EventListenerFunction<T, Type extends keyof TargetEventMap<T>> = (
  event: TargetEventMap<T>[Type],
) => void

export interface EventHandlerMethodNames {
  on: string
  off: string
}

export interface EventHandlerOptions<T, Type extends keyof TargetEventMap<T>> {
  target: T
  type: Type
  listener: EventListenerFunction<T, Type>
  options?: boolean | AddEventListenerOptions
  advOptions?: EventHandlerMethodNames
}

type EventMethod = (
  type: EventType,
  listener: (...args: unknown[]) => void,
  options?: boolean | AddEventListenerOptions,
) => unknown

const nativeEventMethods: EventHandlerMethodNames = {
  on: 'addEventListener',
  off: 'removeEventListener',
}

function getEventMethod(target: unknown, methodName: string): EventMethod {
  const method = (target as Record<string, unknown>)[methodName]
  if (typeof method !== 'function') {
    throw new TypeError(`[useEventHandler] Target does not implement ${methodName}()`)
  }
  return method as EventMethod
}

function isEventHandlerOptions<T, Type extends keyof TargetEventMap<T>>(
  value: EventHandlerOptions<T, Type> | T,
  type: Type | EventListenerFunction<T, Type> | undefined,
): value is EventHandlerOptions<T, Type> {
  return type === undefined
    && typeof value === 'object'
    && value !== null
    && 'target' in value
    && 'type' in value
    && 'listener' in value
}

export function useEventHandler<T, Type extends keyof TargetEventMap<T>>(
  options: EventHandlerOptions<T, Type>,
): CleanupFunction

export function useEventHandler<T, Type extends keyof TargetEventMap<T>>(
  target: T,
  type: Type,
  listener: EventListenerFunction<T, Type>,
  options?: boolean | AddEventListenerOptions,
  advOptions?: EventHandlerMethodNames,
): CleanupFunction

export function useEventHandler<T, Type extends keyof TargetEventMap<T>>(
  value: EventHandlerOptions<T, Type> | T,
  eventType?: Type | EventListenerFunction<T, Type>,
  eventListener?: EventListenerFunction<T, Type> | boolean | AddEventListenerOptions,
  eventOptions?: boolean | AddEventListenerOptions,
  eventMethods?: EventHandlerMethodNames,
): CleanupFunction {
  let target: T
  let type: Type
  let listener: EventListenerFunction<T, Type>
  let options: boolean | AddEventListenerOptions | undefined
  let methods = nativeEventMethods

  if (isEventHandlerOptions(value, eventType)) {
    target = value.target
    type = value.type
    listener = value.listener
    options = value.options
    methods = value.advOptions || nativeEventMethods
  }
  else {
    target = value
    type = eventType as Type
    listener = eventListener as EventListenerFunction<T, Type>
    options = eventOptions
    methods = eventMethods || nativeEventMethods
  }

  const on = getEventMethod(target, methods.on)
  const off = getEventMethod(target, methods.off)
  const callableListener = listener as (...args: unknown[]) => void
  on.call(target, type as EventType, callableListener, options)

  let isListening = true
  return () => {
    if (!isListening) return
    isListening = false
    off.call(target, type as EventType, callableListener, options)
  }
}

export function useObserverEventHandler<T, Type extends keyof TargetEventMap<T>>(
  emitter: T,
  type: Type,
  listener: EventListenerFunction<T, Type>,
  options?: boolean | AddEventListenerOptions,
): CleanupFunction {
  return useEventHandler({
    target: emitter,
    type,
    listener,
    options,
    advOptions: {
      on: 'on',
      off: 'off',
    },
  })
}

export function useMittEventHandler<
  Events extends Record<EventType, unknown>,
  Type extends keyof Events,
>(
  emitter: Emitter<Events>,
  type: Type,
  listener: Handler<Events[Type]>,
): CleanupFunction {
  return useObserverEventHandler(emitter, type, listener)
}

export function useCleanupQueue() {
  const cleanups: CleanupFunction[] = []

  function addCleanup(...inputs: CleanupInput[]) {
    inputs.forEach((input) => {
      if (Array.isArray(input)) cleanups.push(...input)
      else cleanups.push(input as CleanupFunction)
    })
  }

  function cleanup() {
    // Clear first so a cleanup can safely register work for the next cycle.
    const pendingCleanups = cleanups.splice(0)

    pendingCleanups.forEach((dispose) => {
      try {
        dispose()
      }
      catch (error) {
        console.warn('[useCleanupQueue] Cleanup failed:', error)
      }
    })
  }

  return {
    addCleanup,
    cleanup,
  }
}
