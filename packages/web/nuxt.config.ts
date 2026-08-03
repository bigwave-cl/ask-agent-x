import tailwindcss from '@tailwindcss/vite'
import { createResolver } from 'nuxt/kit'

const { resolve } = createResolver(import.meta.url)
const askxIconDirectories = {
  actions: resolve('./app/assets/icons/actions'),
  navigation: resolve('./app/assets/icons/navigation'),
  status: resolve('./app/assets/icons/status'),
  objects: resolve('./app/assets/icons/objects'),
  platforms: resolve('./app/assets/icons/platforms'),
}

export default defineNuxtConfig({
  compatibilityDate: '2026-07-16',
  devtools: { enabled: true },
  modules: ['shadcn-nuxt', '@nuxtjs/i18n', '@nuxt/icon'],
  components: [
    { path: '~/components/common', prefix: 'Cs', extensions: ['vue'] },
    { path: '~/components/ui', extensions: ['vue'] },
    { path: '~/components/business', prefix: 'Bus', extensions: ['vue'] },
    { path: '~/components/demo', prefix: 'Demo', extensions: ['vue'] },
    { path: '~/components', pathPrefix: false, pattern: '*.vue', extensions: ['vue'] },
  ],
  css: ['~/assets/css/main.css'],
  watch: ['../core/dist/**', '../platform-adapters/dist/**', '../modules/skills/dist/**', 'app/assets/icons/**/*.svg'],
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
  icon: {
    provider: 'server',
    fallbackToApi: false,
    localApiEndpoint: '/_askx/icon',
    customCollections: [
      { prefix: 'askx-actions', dir: askxIconDirectories.actions },
      { prefix: 'askx-navigation', dir: askxIconDirectories.navigation },
      { prefix: 'askx-status', dir: askxIconDirectories.status },
      { prefix: 'askx-objects', dir: askxIconDirectories.objects },
      { prefix: 'askx-platforms', dir: askxIconDirectories.platforms },
    ],
    clientBundle: {
      scan: false,
      includeCustomCollections: false,
      sizeLimitKb: 64,
      icons: [
        'askx-actions:external-link',
        'askx-actions:settings',
        'askx-objects:agent',
        'askx-objects:model',
        'askx-objects:palette',
        'askx-platforms:chatgpt-codex',
        'askx-platforms:claude-code',
        'askx-platforms:cursor',
        'askx-status:lock',
        'askx-status:star',
      ],
    },
  },
  shadcn: {
    prefix: '',
    componentDir: '@/components/ui',
  },
  vite: {
    plugins: [tailwindcss()],
    worker: {
      format: 'es',
    },
  },
  devServer: {
    host: '127.0.0.1',
    port: 4242,
  },
  runtimeConfig: {
    askxSessionToken: '',
    askxIconDirectories,
  },
  app: {
    head: {
      meta: [
        { name: 'theme-color', content: '#F5F6F8' },
      ],
    },
  },
})
