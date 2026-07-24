<script setup lang="ts">
import type { RadioGroupItemEmits, RadioGroupItemProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { RadioGroupIndicator, RadioGroupItem, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<RadioGroupItemProps & {
  class?: HTMLAttributes['class']
}>()

const emits = defineEmits<RadioGroupItemEmits>()
const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <RadioGroupItem
    data-slot="radio-group-item"
    v-bind="forwarded"
    :class="cn(
      'peer relative inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-input bg-background shadow-xs outline-none transition-[background-color,border-color,box-shadow] after:absolute after:-inset-1 hover:border-primary/70 hover:bg-primary/8 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 data-[state=checked]:border-primary aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:opacity-50',
      props.class,
    )"
  >
    <RadioGroupIndicator data-slot="radio-group-indicator" class="grid place-items-center">
      <span class="size-2 rounded-full bg-primary" />
    </RadioGroupIndicator>
  </RadioGroupItem>
</template>
