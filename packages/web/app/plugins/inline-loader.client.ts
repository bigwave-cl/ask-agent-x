import inlineLoaderDirective from '@/directives/inlineLoader'

/** 注册客户端局部 Loading 指令。 */
export default defineNuxtPlugin(nuxtApp => {
    nuxtApp.vueApp.directive('inline-loader', inlineLoaderDirective)
})
