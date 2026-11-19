<script setup lang="ts">
import BusBridgeManager from '@/components/business/bridge-manager/BusBridgeManager.vue'
import BusBridgeSettings from '@/components/business/bridge-manager/BusBridgeSettings.vue'
import { provideBridgeServiceControl } from '@/composables/useBridgeServiceControl'

definePageMeta({ layout: false })
/** 页面翻译。 */
const { t } = useI18n()
/** 设置面板开关。 */
const { settingsOpen } = provideBridgeServiceControl()
useHead(() => ({ title: t('meta.bridge') }))
</script>

<template>
    <div>
        <BusBridgeManager />
        <BusBridgeSettings v-model:open="settingsOpen" />
    </div>
</template>
