import { provideSSRWidth } from '@vueuse/core'
import type { Plugin } from 'nuxt/app'

/** 为服务端渲染提供稳定的默认视口宽度。 */
const ssrWidthPlugin: Plugin = defineNuxtPlugin((nuxtApp) => {
  provideSSRWidth(1024, nuxtApp.vueApp)
})

export default ssrWidthPlugin
