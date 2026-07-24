<script setup lang="ts">
const { t } = useI18n()
useHead(() => ({ title: t('meta.login') }))
</script>

<template>
  <WorkspaceApp login />
</template>
