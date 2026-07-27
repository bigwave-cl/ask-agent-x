<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import type { ResponsiveOverlayClass } from '../responsive-overlay/types'
import type { ResponsiveSelectValueSlotProps } from './types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  responsiveSelectTriggerClass,
  responsiveSelectTriggerIconClass,
  responsiveSelectTriggerLabelClass,
} from './triggerStyles'

defineOptions({ name: 'ResponsiveSelectTriggerButton', inheritAttrs: false })

const props = defineProps<{
  disabled: boolean
  open: boolean
  placeholder: string
  title: string
  triggerClass?: ResponsiveOverlayClass
  valueSlotProps: ResponsiveSelectValueSlotProps
}>()

defineSlots<{
  value?: (props: ResponsiveSelectValueSlotProps) => unknown
}>()
</script>

<template>
  <Button
    v-bind="$attrs"
    type="button"
    variant="outline"
    size="default"
    :disabled="disabled"
    :class="cn(responsiveSelectTriggerClass, 'w-full justify-between', triggerClass)"
    :aria-label="title"
    :aria-expanded="open"
    :data-state="open ? 'open' : 'closed'"
    data-slot="responsive-select-trigger"
  >
    <span :class="responsiveSelectTriggerLabelClass">
      <slot name="value" v-bind="valueSlotProps">
        <span :class="valueSlotProps.option ? 'text-inherit' : 'text-ds-text-secondary'">
          {{ valueSlotProps.option?.label ?? placeholder }}
        </span>
      </slot>
    </span>
    <ChevronRight
      :class="cn(responsiveSelectTriggerIconClass, open && 'rotate-90 text-ds-text-secondary')"
    />
  </Button>
</template>
