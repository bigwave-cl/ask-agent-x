<script setup lang="ts">
import BusBridgeManager from '@/components/business/bridge-manager/BusBridgeManager.vue'

definePageMeta({ layout: 'bridge' })
/** 页面翻译。 */
const { t } = useI18n()
useHead(() => ({ title: t('meta.bridge') }))
</script>

<template>
    <BusBridgeManager />
</template>
