<script setup lang="ts">
definePageMeta({ layout: 'workspace' })
const { t } = useI18n()
useHead(() => ({ title: t('meta.settings') }))
</script>

<template>
  <WorkspaceApp view="settings" />
</template>
