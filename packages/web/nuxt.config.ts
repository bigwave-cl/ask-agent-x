import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-16',
  devtools: { enabled: true },
  modules: ['shadcn-nuxt'],
  css: ['~/assets/css/main.css'],
  watch: ['../core/dist/**'],
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
      htmlAttrs: { lang: 'zh-CN' },
      title: 'AskAgent X · Local Control',
      meta: [
        { name: 'description', content: 'AskAgent X local extension control surface' },
        { name: 'theme-color', content: '#F5F6F8' },
      ],
    },
  },
})
