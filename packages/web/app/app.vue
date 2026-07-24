<script setup lang="ts">
const localeHead = useLocaleHead({ dir: true, lang: true, seo: false })
const { t } = useI18n()

useHead(() => ({
  htmlAttrs: localeHead.value.htmlAttrs,
  bodyAttrs: { class: 'bg-background text-foreground' },
  meta: [{ name: 'description', content: t('meta.description') }],
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
