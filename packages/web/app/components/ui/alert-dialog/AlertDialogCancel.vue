<script setup lang="ts">
import type { AlertDialogCancelProps } from 'reka-ui'
import type { ButtonVariants } from '@/components/ui/button'
import { AlertDialogCancel, useForwardProps } from 'reka-ui'
import Button from '@/components/ui/button/Button.vue'

const props = withDefaults(defineProps<AlertDialogCancelProps & { variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive', size?: ButtonVariants['size'] }>(), { variant: 'outline', size: 'default' })
const forwarded = useForwardProps(props)
</script>

<template>
    <Button
        as-child
        :variant="variant"
        :size="size"
    >
        <AlertDialogCancel v-bind="forwarded">
            <slot />
        </AlertDialogCancel>
    </Button>
</template>
