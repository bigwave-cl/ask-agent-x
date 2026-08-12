<script setup lang="ts">
import type { AlertDialogActionProps } from 'reka-ui'
import type { ButtonVariants } from '@/components/ui/button'
import { AlertDialogAction, useForwardProps } from 'reka-ui'
import Button from '@/components/ui/button/Button.vue'

const props = withDefaults(defineProps<AlertDialogActionProps & { variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive', size?: ButtonVariants['size'] }>(), { variant: 'default', size: 'default' })
const forwarded = useForwardProps(props)
</script>

<template>
    <Button
        as-child
        :variant="variant"
        :size="size"
    >
        <AlertDialogAction v-bind="forwarded">
            <slot />
        </AlertDialogAction>
    </Button>
</template>
