<script setup lang="ts">
import type { ResponsiveSelectOption } from '../responsive-select/types'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import ResponsiveOverlayDrawer from '../responsive-overlay/Drawer.vue'
import { useResponsiveOverlayViewport } from '../responsive-overlay/useResponsiveOverlayViewport'
import ResponsiveSelectTriggerButton from '../responsive-select/TriggerButton.vue'

defineOptions({ name: 'ResponsiveMultiSelect' })

const props = withDefaults(defineProps<{
  options: ResponsiveSelectOption[]
  modelValue?: string[]
  title: string
  placeholder: string
  closeLabel: string
  emptyText: string
  description?: string
  disabled?: boolean
  desktopQuery?: string
  triggerClass?: string
  contentClass?: string
  size?: '36' | '40' | '48'
}>(), { modelValue: () => [], disabled: false, desktopQuery: '(min-width: 768px)', description: undefined, triggerClass: undefined, contentClass: undefined, size: '36' })

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const open = ref(false)
const { isMobile, isPending } = useResponsiveOverlayViewport(() => props.desktopQuery)
const selectedOptions = computed(() => props.options.filter(option => props.modelValue.includes(option.value)))
const summary = computed(() => selectedOptions.value.length ? selectedOptions.value.map(option => option.label).join('、') : props.placeholder)

function toggle(value: string, checked: boolean | 'indeterminate') {
  if (props.disabled || checked === 'indeterminate') return
  const next = new Set(props.modelValue)
  checked ? next.add(value) : next.delete(value)
  emit('update:modelValue', [...next])
}
</script>

<template>
  <ResponsiveSelectTriggerButton
    v-if="isPending"
    :disabled="disabled"
    :open="open"
    :placeholder="placeholder"
    :title="title"
    :size="size"
    :trigger-class="triggerClass"
    :value-slot-props="{ isMobile: true, open, option: selectedOptions[0] ?? null, placeholder, value: selectedOptions[0]?.value }"
    @click="open = true"
  >
    <template #value><span class="truncate">{{ summary }}</span></template>
  </ResponsiveSelectTriggerButton>

  <ResponsiveOverlayDrawer v-else-if="isMobile" v-model:open="open" :title="title" :description="description" :close-label="closeLabel" :show-header="true">
    <div :class="cn('grid gap-1 p-1', contentClass)">
      <p v-if="options.length === 0" class="px-3 py-8 text-center text-sm text-muted-foreground">{{ emptyText }}</p>
      <label v-for="option in options" v-else :key="option.value" class="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted" :class="option.disabled ? 'cursor-not-allowed opacity-50' : ''">
        <Checkbox :model-value="modelValue.includes(option.value)" :disabled="disabled || option.disabled" @update:model-value="toggle(option.value, $event)" />
        <span class="min-w-0 flex-1"><strong class="block truncate">{{ option.label }}</strong><small v-if="option.description" class="block truncate text-muted-foreground">{{ option.description }}</small></span>
      </label>
    </div>
  </ResponsiveOverlayDrawer>

  <Popover v-else v-model:open="open">
    <PopoverTrigger as-child>
      <ResponsiveSelectTriggerButton
        :disabled="disabled"
        :open="open"
        :placeholder="placeholder"
        :title="title"
        :size="size"
        :trigger-class="triggerClass"
        :value-slot-props="{ isMobile: false, open, option: selectedOptions[0] ?? null, placeholder, value: selectedOptions[0]?.value }"
      >
        <template #value><span class="truncate">{{ summary }}</span></template>
      </ResponsiveSelectTriggerButton>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-[var(--reka-popover-trigger-width)] p-2" :class="contentClass">
      <p v-if="options.length === 0" class="px-3 py-6 text-center text-sm text-muted-foreground">{{ emptyText }}</p>
      <label v-for="option in options" v-else :key="option.value" class="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted" :class="option.disabled ? 'cursor-not-allowed opacity-50' : ''">
        <Checkbox :model-value="modelValue.includes(option.value)" :disabled="disabled || option.disabled" @update:model-value="toggle(option.value, $event)" />
        <span class="min-w-0 flex-1"><strong class="block truncate">{{ option.label }}</strong><small v-if="option.description" class="block truncate text-muted-foreground">{{ option.description }}</small></span>
      </label>
    </PopoverContent>
  </Popover>
</template>
