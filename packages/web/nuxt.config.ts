export default defineNuxtConfig({
  compatibilityDate: '2026-07-16',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
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
        { name: 'theme-color', content: '#101511' },
      ],
    },
  },
})

