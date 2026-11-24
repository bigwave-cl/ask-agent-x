<script setup lang="ts">
import BusBridgeManager from '@/components/business/bridge-manager/BusBridgeManager.vue'
import BusBridgeSettings from '@/components/business/bridge-manager/BusBridgeSettings.vue'
import { provideBridgeServiceControl } from '@/composables/useBridgeServiceControl'

definePageMeta({ layout: false, path: '/bridge/management' })
/** 独立管理页的翻译入口。 */
const { t } = useI18n()
/** 当前页面的唯一服务控制器和设置面板。 */
const { settingsOpen } = provideBridgeServiceControl()
useHead(() => ({ title: t('bridge.managementTitle') }))
</script>

<template>
    <div>
        <BusBridgeManager />
        <BusBridgeSettings v-model:open="settingsOpen" />
    </div>
</template>
