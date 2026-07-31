<script setup lang="ts">
definePageMeta({ layout: 'workspace' })
const { t } = useI18n()
useHead(() => ({ title: t('meta.skillsX') }))
</script>

<template>
  <WorkspaceApp view="skills-x" />
</template>
