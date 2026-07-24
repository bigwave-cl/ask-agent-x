<script setup lang="ts">
definePageMeta({ layout: 'workspace' })
const { t } = useI18n()
useHead(() => ({ title: t('meta.theme') }))
</script>

<template>
  <WorkspaceApp view="theme" />
</template>
