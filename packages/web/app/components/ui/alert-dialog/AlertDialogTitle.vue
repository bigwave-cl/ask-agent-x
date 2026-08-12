<script setup lang="ts">
import type { AlertDialogTitleProps } from 'reka-ui'
import { AlertDialogTitle, useForwardProps } from 'reka-ui'

const props = defineProps<AlertDialogTitleProps>()
const forwarded = useForwardProps(props)
</script>

<template>
    <AlertDialogTitle
        v-bind="forwarded"
        class="text-lg font-semibold"
    >
        <slot />
    </AlertDialogTitle>
</template>
