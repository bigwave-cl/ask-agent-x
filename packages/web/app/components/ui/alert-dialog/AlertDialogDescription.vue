<script setup lang="ts">
import type { AlertDialogDescriptionProps } from 'reka-ui'
import { AlertDialogDescription, useForwardProps } from 'reka-ui'

const props = defineProps<AlertDialogDescriptionProps>()
const forwarded = useForwardProps(props)
</script>

<template><AlertDialogDescription v-bind="forwarded" class="text-sm leading-6 text-muted-foreground"><slot /></AlertDialogDescription></template>
