<script setup lang="ts">
import type { ResponsiveSelectOption } from './types'

defineOptions({ name: 'ResponsiveSelectOptionContent' })

defineProps<{
    option: ResponsiveSelectOption
}>()
</script>

<template>
    <span class="grid min-w-0 flex-1 gap-0 text-left">
        <span class="truncate text-sm font-medium leading-[22px]">{{ option.label }}</span>
        <span
            v-if="option.description"
            class="whitespace-normal text-[10px] leading-[14px] text-muted-foreground"
        >
            {{ option.description }}
        </span>
    </span>
</template>
