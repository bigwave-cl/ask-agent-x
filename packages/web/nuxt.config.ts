import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-16',
  devtools: { enabled: true },
  modules: ['shadcn-nuxt', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  watch: ['../core/dist/**'],
  i18n: {
    defaultLocale: 'zh-CN',
    strategy: 'prefix_except_default',
    detectBrowserLanguage: false,
    locales: [
      { code: 'zh-CN', language: 'zh-CN', name: '简体中文', file: 'zh-CN.json' },
      { code: 'en', language: 'en', name: 'English', file: 'en.json' },
    ],
    vueI18n: './i18n.config.ts',
  },
  shadcn: {
    prefix: '',
    componentDir: '@/components/ui',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  devServer: {
    host: '127.0.0.1',
    port: 4242,
  },
  runtimeConfig: {
    askxSessionToken: '',
  },
  app: {
    head: {
      meta: [
        { name: 'theme-color', content: '#F5F6F8' },
      ],
    },
  },
})
