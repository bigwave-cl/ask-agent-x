<script setup lang="ts">
definePageMeta({ layout: 'workspace' })
const { t } = useI18n()
useHead(() => ({ title: t('meta.home') }))
</script>

<template>
  <WorkspaceApp view="home" />
</template>
