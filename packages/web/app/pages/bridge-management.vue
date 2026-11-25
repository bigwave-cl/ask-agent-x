<script setup lang="ts">
import BusBridgeManagement from '@/components/business/bridge-manager/BusBridgeManagement.vue'

definePageMeta({ layout: 'bridge', path: '/bridge/management' })
/** 独立管理页的翻译入口。 */
const { t } = useI18n()
useHead(() => ({ title: t('bridge.managementTitle') }))
</script>

<template>
    <BusBridgeManagement />
</template>
