import type { Action, ExternalToast } from 'vue-sonner'
import { toast } from 'vue-sonner'

export type ToastOptions = ExternalToast
export type ToastAction = Action

export function useToast() {
  return {
    show: toast,
    success: (message: Parameters<typeof toast>[0], options?: ToastOptions) => toast.success(message, options),
    error: (message: Parameters<typeof toast>[0], options?: ToastOptions) => toast.error(message, options),
    info: (message: Parameters<typeof toast>[0], options?: ToastOptions) => toast.info(message, options),
    warning: (message: Parameters<typeof toast>[0], options?: ToastOptions) => toast.warning(message, options),
    loading: toast.loading,
    promise: toast.promise,
    dismiss: toast.dismiss,
  }
}
