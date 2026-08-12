<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'

const localeHead = useLocaleHead({ dir: true, lang: true, seo: false })
const { t } = useI18n()
const loadingStore = useLoadingStore()

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
    <Toaster />
    <ClientOnly><CsFullLoader :model-value="loadingStore.ajaxLoader" /></ClientOnly>
</template>
