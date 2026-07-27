<script setup lang="ts">
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ResponsiveOverlayDrawer from '../responsive-overlay/Drawer.vue'
import { useResponsiveOverlayViewport } from '../responsive-overlay/useResponsiveOverlayViewport'
import ResponsiveSelectOptionContent from './OptionContent.vue'
import ResponsiveSelectTriggerButton from './TriggerButton.vue'
import {
  responsiveSelectClearClass,
  responsiveSelectDefaultIconClass,
  responsiveSelectTriggerClass,
  responsiveSelectTriggerIconClass,
} from './triggerStyles'
import type {
  ResponsiveSelectChangeEvent,
  ResponsiveSelectItemSlotProps,
  ResponsiveSelectOption,
  ResponsiveSelectProps,
  ResponsiveSelectValueSlotProps,
} from './types'
import {
  findResponsiveSelectOption,
  getResponsiveSelectDrawerOptions,
  resolveResponsiveSelectCommit,
} from './types'

defineOptions({ name: 'ResponsiveSelect', inheritAttrs: false })

const props = withDefaults(defineProps<ResponsiveSelectProps>(), {
  clearable: false,
  clearValue: undefined,
  contentClass: undefined,
  description: undefined,
  desktopQuery: '(min-width: 768px)',
  disabled: false,
  drawer: undefined,
  name: undefined,
  triggerClass: undefined,
})
const modelValue = defineModel<string | undefined>()
const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  change: [event: ResponsiveSelectChangeEvent]
}>()

defineSlots<{
  item?: (props: ResponsiveSelectItemSlotProps) => unknown
  value?: (props: ResponsiveSelectValueSlotProps) => unknown
}>()

type RekaSelectEvent = CustomEvent<{
  originalEvent: Event
  value: string
}>

const attrs = useAttrs()
const selectedOption = computed(() => findResponsiveSelectOption(props.options, modelValue.value))
const hasValue = computed(() => modelValue.value !== undefined && modelValue.value !== '')
const accessibleDescription = computed(() => props.description ?? props.placeholder)
const selectDrawerOptions = computed(() => getResponsiveSelectDrawerOptions(props.drawer))
const { isMobile, isPending } = useResponsiveOverlayViewport(() => props.desktopQuery)
const valueSlotProps = (isMobile: boolean): ResponsiveSelectValueSlotProps => ({
  isMobile,
  open: open.value,
  option: selectedOption.value,
  placeholder: props.placeholder,
  value: modelValue.value,
})

function commitValue(
  value: string | undefined,
  source: 'clear' | 'select',
  originalEvent: Event,
) {
  const result = resolveResponsiveSelectCommit(props.options, value, source, props.disabled)
  if (!result.accepted) return

  modelValue.value = result.value
  emit('change', {
    originalEvent,
    value: result.value,
    option: result.option,
  })
  open.value = false
}

function emitDesktopChange(option: ResponsiveSelectOption, event: RekaSelectEvent) {
  const result = resolveResponsiveSelectCommit(props.options, option.value, 'select', props.disabled)
  if (!result.accepted) return

  emit('change', {
    originalEvent: event.detail.originalEvent,
    value: result.value,
    option: result.option,
  })
}

function selectMobileOption(option: ResponsiveSelectOption, event: MouseEvent) {
  commitValue(option.value, 'select', event)
}

function clearSelection(event: MouseEvent) {
  event.stopPropagation()
  commitValue(props.clearValue, 'clear', event)
}
</script>

<template>
  <input v-if="name" type="hidden" :name="name" :value="modelValue ?? ''">

  <ResponsiveSelectTriggerButton
    v-if="isPending"
    v-bind="attrs"
    :disabled="disabled"
    :open="open"
    :placeholder="placeholder"
    :title="title"
    :trigger-class="triggerClass"
    :value-slot-props="valueSlotProps(true)"
  >
    <template v-if="$slots.value" #value="slotProps">
      <slot name="value" v-bind="slotProps" />
    </template>
  </ResponsiveSelectTriggerButton>

  <ResponsiveOverlayDrawer
    v-else-if="isMobile"
    v-model:open="open"
    :title="title"
    :description="accessibleDescription"
    :drawer="selectDrawerOptions"
    :close-label="closeLabel"
    :show-header="true"
  >
    <template #trigger>
      <ResponsiveSelectTriggerButton
        v-bind="attrs"
        :disabled="disabled"
        :open="open"
        :placeholder="placeholder"
        :title="title"
        :trigger-class="triggerClass"
        :value-slot-props="valueSlotProps(true)"
      >
        <template v-if="$slots.value" #value="slotProps">
          <slot name="value" v-bind="slotProps" />
        </template>
      </ResponsiveSelectTriggerButton>
    </template>

    <div :class="cn('grid gap-1 p-1', contentClass)" data-slot="responsive-select-mobile-options">
      <Button
        v-if="clearable && hasValue"
        type="button"
        variant="ghost"
        size="40"
        class="w-full justify-start text-muted-foreground"
        @click="clearSelection"
      >
        <Icon name="askx-actions:close" />
        {{ clearLabel }}
      </Button>

      <p v-if="options.length === 0" class="px-3 py-8 text-center text-sm text-muted-foreground">
        {{ emptyText }}
      </p>
      <Button
        v-for="option in options"
        :key="option.value"
        type="button"
        variant="ghost"
        size="48"
        class="h-auto min-h-12 w-full justify-start whitespace-normal px-3 py-2.5"
        :class="option.value === modelValue ? 'bg-accent text-accent-foreground' : ''"
        :disabled="option.disabled"
        :aria-pressed="option.value === modelValue"
        @click="selectMobileOption(option, $event)"
      >
        <span class="grid size-5 shrink-0 place-items-center">
          <Icon name="askx-status:check" v-if="option.value === modelValue" class="text-primary" />
        </span>
        <slot name="item" :option="option" :selected="option.value === modelValue" :is-mobile="true">
          <ResponsiveSelectOptionContent :option="option" />
        </slot>
      </Button>
    </div>
  </ResponsiveOverlayDrawer>

  <div v-else class="group/responsive-select relative w-full">
    <Select v-model="modelValue" v-model:open="open" :disabled="disabled">
      <SelectTrigger
        v-bind="attrs"
        :class="cn(responsiveSelectTriggerClass, responsiveSelectDefaultIconClass, 'w-full', triggerClass)"
        :aria-label="title"
        data-slot="responsive-select-trigger"
      >
        <SelectValue v-if="$slots.value" :placeholder="placeholder">
          <slot name="value" v-bind="valueSlotProps(false)" />
        </SelectValue>
        <SelectValue v-else :placeholder="placeholder" />
        <Icon name="askx-navigation:chevron-right"
          :class="cn(
            responsiveSelectTriggerIconClass,
            open && 'rotate-90 text-ds-text-secondary',
            clearable && hasValue ? 'group-hover/responsive-select:opacity-0' : '',
          )"
        />
      </SelectTrigger>

      <SelectContent position="popper" :class="contentClass">
        <div v-if="options.length === 0" class="px-2 py-6 text-center text-sm text-muted-foreground">
          {{ emptyText }}
        </div>
        <SelectItem
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          :disabled="option.disabled"
          :text-value="option.label"
          @select="emitDesktopChange(option, $event)"
        >
          <slot name="item" :option="option" :selected="option.value === modelValue" :is-mobile="false">
            <ResponsiveSelectOptionContent :option="option" />
          </slot>
        </SelectItem>
      </SelectContent>
    </Select>

    <Button
      v-if="clearable && hasValue"
      type="button"
      variant="ghost"
      size="icon-xs"
      :aria-label="clearLabel"
      :class="responsiveSelectClearClass"
      data-slot="responsive-select-clear"
      @pointerdown.stop.prevent
      @click="clearSelection"
    >
      <Icon name="askx-actions:close" />
    </Button>
  </div>
</template>
