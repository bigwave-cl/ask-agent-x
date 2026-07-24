<script setup lang="ts">
import type { CheckboxRootEmits, CheckboxRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { Check, Minus } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { CheckboxIndicator, CheckboxRoot, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<CheckboxRootProps & {
  class?: HTMLAttributes['class']
}>()

const emits = defineEmits<CheckboxRootEmits>()
const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <CheckboxRoot
    v-slot="slotProps"
    data-slot="checkbox"
    v-bind="forwarded"
    :class="cn(
      'peer relative inline-flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border-2 border-input bg-background shadow-xs outline-none transition-[background-color,border-color,box-shadow] after:absolute after:-inset-1 hover:border-primary/70 hover:bg-primary/8 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:opacity-50',
      props.class,
    )"
  >
    <CheckboxIndicator data-slot="checkbox-indicator" class="grid place-items-center text-ds-text-white">
      <Minus v-if="slotProps.state === 'indeterminate'" class="size-3.5 stroke-[2.5]" />
      <Check v-else class="size-3.5 stroke-[2.5]" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
