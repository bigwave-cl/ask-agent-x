<script setup lang="ts">
import { responsiveOverlayShellDefaults } from './overlayOptions'
import ResponsiveOverlayPopover from './Popover.vue'
import type {
  ResponsiveOverlayPopoverDrawerProps,
  ResponsiveOverlaySlotProps,
} from './types'
import ResponsiveOverlayWrapper from './Wrapper.vue'

defineOptions({ name: 'ResponsiveOverlayPopoverDrawer' })

const props = withDefaults(defineProps<ResponsiveOverlayPopoverDrawerProps>(), {
  ...responsiveOverlayShellDefaults,
  desktopQuery: '(min-width: 768px)',
  dismissible: true,
  drawer: undefined,
  popover: undefined,
})
const open = defineModel<boolean>('open', { default: false })
const wrapperRef = ref<InstanceType<typeof ResponsiveOverlayWrapper> | null>(null)

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

defineExpose({
  close: () => wrapperRef.value?.close(),
  open: () => wrapperRef.value?.open(),
  toggle: () => wrapperRef.value?.toggle(),
})
</script>

<template>
  <ResponsiveOverlayWrapper
    ref="wrapperRef"
    v-model:open="open"
    desktop-mode="popover"
    :desktop-query="desktopQuery"
    :title="title"
    :description="description"
    :dismissible="dismissible"
    :drawer="drawer"
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
    @show="emit('show')"
    @hide="emit('hide')"
    @close="emit('close')"
    @top-left="emit('top-left')"
  >
    <template #trigger="slotProps"><slot name="trigger" v-bind="slotProps" /></template>
    <template #desktop>
      <ResponsiveOverlayPopover
        v-model:open="open"
        :title="title"
        :description="description"
        :dismissible="dismissible"
        :popover="popover"
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
        @show="emit('show')"
        @hide="emit('hide')"
        @close="emit('close')"
        @top-left="emit('top-left')"
      >
        <template #trigger="slotProps"><slot name="trigger" v-bind="slotProps" /></template>
        <template v-if="$slots.header" #header="slotProps"><slot name="header" v-bind="slotProps" /></template>
        <template v-if="$slots.title" #title="slotProps"><slot name="title" v-bind="slotProps" /></template>
        <template v-if="$slots['top-left']" #top-left="slotProps"><slot name="top-left" v-bind="slotProps" /></template>
        <template #default="slotProps"><slot v-bind="slotProps" /></template>
        <template v-if="$slots.footer" #footer="slotProps"><slot name="footer" v-bind="slotProps" /></template>
      </ResponsiveOverlayPopover>
    </template>

    <template v-if="$slots.header" #header="slotProps"><slot name="header" v-bind="slotProps" /></template>
    <template v-if="$slots.title" #title="slotProps"><slot name="title" v-bind="slotProps" /></template>
    <template v-if="$slots['top-left']" #top-left="slotProps"><slot name="top-left" v-bind="slotProps" /></template>
    <template #default="slotProps"><slot v-bind="slotProps" /></template>
    <template v-if="$slots.footer" #footer="slotProps"><slot name="footer" v-bind="slotProps" /></template>
  </ResponsiveOverlayWrapper>
</template>
