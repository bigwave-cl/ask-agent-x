<script setup lang="ts">
import type { DemoLocale } from '../../catalog'
import DemoButton from './DemoButton.vue'

defineOptions({ name: 'DemoComponentsModule' })

defineProps<{
  locale: DemoLocale
}>()
</script>

<template>
  <DemoButton :locale="locale" />
</template>
