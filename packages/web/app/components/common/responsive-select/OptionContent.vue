<script setup lang="ts">
import type { ResponsiveSelectOption } from './types'

defineOptions({ name: 'ResponsiveSelectOptionContent' })

defineProps<{
  option: ResponsiveSelectOption
}>()
</script>

<template>
  <span class="grid min-w-0 flex-1 gap-0.5 text-left">
    <span class="truncate font-medium">{{ option.label }}</span>
    <span v-if="option.description" class="whitespace-normal text-xs leading-5 text-muted-foreground">
      {{ option.description }}
    </span>
  </span>
</template>
