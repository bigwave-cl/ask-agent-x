import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from './useToast'

const toastMocks = vi.hoisted(() => ({
  show: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  loading: vi.fn(),
  promise: vi.fn(),
  dismiss: vi.fn(),
}))

vi.mock('vue-sonner', () => ({
  toast: Object.assign(toastMocks.show, {
    success: toastMocks.success,
    error: toastMocks.error,
    info: toastMocks.info,
    warning: toastMocks.warning,
    loading: toastMocks.loading,
    promise: toastMocks.promise,
    dismiss: toastMocks.dismiss,
  }),
}))

describe('useToast', () => {
  beforeEach(() => {
    Object.values(toastMocks).forEach(mock => mock.mockReset())
  })

  it.each(['success', 'error', 'info', 'warning'] as const)('forwards %s to vue-sonner', (method) => {
    const options = { description: '说明', duration: 2400 }

    useToast()[method]('操作结果', options)

    expect(toastMocks[method]).toHaveBeenCalledWith('操作结果', options)
  })

  it('exposes the default and lifecycle helpers', () => {
    const toast = useToast()

    toast.show('默认提示')
    toast.loading('处理中')
    toast.dismiss('toast-id')

    expect(toastMocks.show).toHaveBeenCalledWith('默认提示')
    expect(toastMocks.loading).toHaveBeenCalledWith('处理中')
    expect(toastMocks.dismiss).toHaveBeenCalledWith('toast-id')
    expect(toast.promise).toBe(toastMocks.promise)
  })
})
