<script setup lang="ts">
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getPopoverOptions, responsiveOverlayShellDefaults } from './overlayOptions'
import ResponsiveOverlayShell from './Shell.vue'
import type { ResponsiveOverlayPopoverProps, ResponsiveOverlaySlotProps } from './types'

defineOptions({ name: 'ResponsiveOverlayPopover' })

const props = withDefaults(defineProps<ResponsiveOverlayPopoverProps>(), {
  ...responsiveOverlayShellDefaults,
  dismissible: true,
  isMobile: false,
  popover: undefined,
})
const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  close: []
  hide: []
  show: []
  'top-left': []
}>()

defineSlots<{
  default?: (props: ResponsiveOverlaySlotProps) => unknown
  footer?: (props: ResponsiveOverlaySlotProps) => unknown
  header?: (props: ResponsiveOverlaySlotProps) => unknown
  title?: (props: ResponsiveOverlaySlotProps) => unknown
  trigger: (props: ResponsiveOverlaySlotProps) => unknown
  'top-left'?: (props: ResponsiveOverlaySlotProps) => unknown
}>()

const popoverOptions = computed(() => getPopoverOptions(props.popover))
const slotProps = computed<ResponsiveOverlaySlotProps>(() => ({
  close: closeOverlay,
  isMobile: props.isMobile,
  mode: 'popover',
  open: open.value,
  topLeft: () => emit('top-left'),
}))

function updateOpen(value: boolean) {
  open.value = value
}

function openOverlay() {
  open.value = true
}

function closeOverlay() {
  open.value = false
}

function toggleOverlay() {
  open.value = !open.value
}

function preventDismiss(event: Event) {
  if (!props.dismissible) event.preventDefault()
}

watch(open, (next, previous) => {
  if (next && !previous) emit('show')
  if (!next && previous) {
    emit('hide')
    emit('close')
  }
})

defineExpose({ close: closeOverlay, open: openOverlay, toggle: toggleOverlay })
</script>

<template>
  <Popover v-bind="popoverOptions.root" :open="open" @update:open="updateOpen">
    <PopoverTrigger as-child>
      <slot name="trigger" v-bind="slotProps" />
    </PopoverTrigger>
    <PopoverContent
      v-bind="popoverOptions.content"
      @escape-key-down="preventDismiss"
      @interact-outside="preventDismiss"
    >
      <ResponsiveOverlayShell
        mode="popover"
        :is-mobile="isMobile"
        :open="open"
        :title="title"
        :description="description"
        :show-header="showHeader"
        :show-top-left="showTopLeft"
        :top-left-disabled="topLeftDisabled"
        :top-left-label="topLeftLabel"
        :show-close="showClose"
        :close-disabled="closeDisabled"
        :close-label="closeLabel"
        :shell-class="shellClass"
        :header-class="headerClass"
        :title-class="titleClass"
        :description-class="descriptionClass"
        :body-class="bodyClass"
        :footer-class="footerClass"
        :top-left-button-class="topLeftButtonClass"
        :close-button-class="closeButtonClass"
        @close="closeOverlay"
        @top-left="emit('top-left')"
      >
        <template v-if="$slots.header" #header="props"><slot name="header" v-bind="props" /></template>
        <template v-if="$slots.title" #title="props"><slot name="title" v-bind="props" /></template>
        <template v-if="$slots['top-left']" #top-left="props"><slot name="top-left" v-bind="props" /></template>
        <template #default="props"><slot v-bind="props" /></template>
        <template v-if="$slots.footer" #footer="props"><slot name="footer" v-bind="props" /></template>
      </ResponsiveOverlayShell>
    </PopoverContent>
  </Popover>
</template>
