<script setup lang="ts">
definePageMeta({ layout: 'workspace' })
const { t } = useI18n()
useHead(() => ({ title: t('meta.skills') }))
</script>

<template>
  <WorkspaceApp view="skills" />
</template>
