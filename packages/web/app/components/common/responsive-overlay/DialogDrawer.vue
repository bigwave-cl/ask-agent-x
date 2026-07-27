<script setup lang="ts">
import ResponsiveOverlayDialog from './Dialog.vue'
import { responsiveOverlayShellDefaults } from './overlayOptions'
import type {
  ResponsiveOverlayDialogDrawerProps,
  ResponsiveOverlaySlotProps,
} from './types'
import ResponsiveOverlayWrapper from './Wrapper.vue'

defineOptions({ name: 'ResponsiveOverlayDialogDrawer' })

const props = withDefaults(defineProps<ResponsiveOverlayDialogDrawerProps>(), {
  ...responsiveOverlayShellDefaults,
  desktopQuery: '(min-width: 768px)',
  dialog: undefined,
  dismissible: true,
  drawer: undefined,
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
    desktop-mode="dialog"
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
      <ResponsiveOverlayDialog
        v-model:open="open"
        :title="title"
        :description="description"
        :dismissible="dismissible"
        :dialog="dialog"
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
      </ResponsiveOverlayDialog>
    </template>

    <template v-if="$slots.header" #header="slotProps"><slot name="header" v-bind="slotProps" /></template>
    <template v-if="$slots.title" #title="slotProps"><slot name="title" v-bind="slotProps" /></template>
    <template v-if="$slots['top-left']" #top-left="slotProps"><slot name="top-left" v-bind="slotProps" /></template>
    <template #default="slotProps"><slot v-bind="slotProps" /></template>
    <template v-if="$slots.footer" #footer="slotProps"><slot name="footer" v-bind="slotProps" /></template>
  </ResponsiveOverlayWrapper>
</template>
