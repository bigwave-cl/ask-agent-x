import { describe, expect, it, vi } from 'vitest'
import mitt from 'mitt'
import {
  useCleanupQueue,
  useEventHandler,
  useMittEventHandler,
  useObserverEventHandler,
} from './messageHandler'

type TestEvents = {
  update: { revision: number }
  reset: undefined
  selection: number[]
}

describe('useEventHandler', () => {
  it('supports positional arguments and removes the listener once', () => {
    const listener = vi.fn()
    const options = { passive: true }
    const target = {
      target: '_blank',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }

    const cleanup = useEventHandler(target, 'change', listener, options)
    cleanup()
    cleanup()

    expect(target.addEventListener).toHaveBeenCalledWith('change', listener, options)
    expect(target.removeEventListener).toHaveBeenCalledOnce()
    expect(target.removeEventListener).toHaveBeenCalledWith('change', listener, options)
  })

  it('supports the original options object signature', () => {
    const listener = vi.fn()
    const target = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }

    const cleanup = useEventHandler({ target, type: 'update', listener })
    cleanup()

    expect(target.addEventListener).toHaveBeenCalledWith('update', listener, undefined)
    expect(target.removeEventListener).toHaveBeenCalledWith('update', listener, undefined)
  })

  it('supports observer-style on and off methods', () => {
    const listener = vi.fn()
    const observer = { on: vi.fn(), off: vi.fn() }

    const cleanup = useObserverEventHandler(observer, 'message', listener)
    cleanup()

    expect(observer.on).toHaveBeenCalledWith('message', listener, undefined)
    expect(observer.off).toHaveBeenCalledWith('message', listener, undefined)
  })
})

describe('useMittEventHandler', () => {
  it('returns a cleanup that removes the typed mitt listener', () => {
    const emitter = mitt<TestEvents>()
    const listener = vi.fn()
    const cleanup = useMittEventHandler(emitter, 'update', listener)

    emitter.emit('update', { revision: 1 })
    cleanup()
    emitter.emit('update', { revision: 2 })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({ revision: 1 })
  })

  it('keeps an array payload as one mitt event argument', () => {
    const emitter = mitt<TestEvents>()
    const listener = vi.fn()
    useMittEventHandler(emitter, 'selection', listener)

    emitter.emit('selection', [1, 2, 3])

    expect(listener).toHaveBeenCalledWith([1, 2, 3])
  })
})

describe('useCleanupQueue', () => {
  it('accepts individual, array, and multiple cleanup functions', () => {
    const order: number[] = []
    const { addCleanup, cleanup } = useCleanupQueue()

    addCleanup(() => order.push(1))
    addCleanup([() => order.push(2), () => order.push(3)])
    addCleanup(() => order.push(4), () => order.push(5))
    cleanup()
    cleanup()

    expect(order).toEqual([1, 2, 3, 4, 5])
  })

  it('continues cleaning after one cleanup fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const successfulCleanup = vi.fn()
    const { addCleanup, cleanup } = useCleanupQueue()

    addCleanup(
      () => { throw new Error('cleanup failed') },
      successfulCleanup,
    )
    cleanup()

    expect(successfulCleanup).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
