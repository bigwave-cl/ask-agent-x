import { defineStore } from 'pinia'
import { useAjaxLoader } from '@/composables/useAjaxLoader'

/** 应用全屏 Loading Store。 */
export const useLoadingStore = defineStore('app-loading-store', () => {
    const controller = useAjaxLoader()
    return {
        ajaxLoader: controller.ajaxLoader,
        loader: controller.loader,
        wrapPromiseWithLoader: controller.wrapPromiseWithLoader,
        resetLoader: controller.resetLoader,
    }
})
