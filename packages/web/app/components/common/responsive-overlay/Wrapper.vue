<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import ResponsiveOverlayDrawer from './Drawer.vue'
import { responsiveOverlayShellDefaults } from './overlayOptions'
import type {
  ResponsiveOverlayPresentation,
  ResponsiveOverlaySlotProps,
  ResponsiveOverlayWrapperProps,
} from './types'
import { resolveResponsiveOverlayPresentation } from './types'

defineOptions({ name: 'ResponsiveOverlayWrapper' })

const props = withDefaults(defineProps<ResponsiveOverlayWrapperProps>(), {
  ...responsiveOverlayShellDefaults,
  desktopMode: 'dialog',
  desktopQuery: '(min-width: 768px)',
  dismissible: true,
  drawer: undefined,
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
  desktop: (props: ResponsiveOverlaySlotProps) => unknown
  footer?: (props: ResponsiveOverlaySlotProps) => unknown
  header?: (props: ResponsiveOverlaySlotProps) => unknown
  title?: (props: ResponsiveOverlaySlotProps) => unknown
  trigger: (props: ResponsiveOverlaySlotProps) => unknown
  'top-left'?: (props: ResponsiveOverlaySlotProps) => unknown
}>()

const mounted = ref(false)
const desktopMedia = useMediaQuery(() => props.desktopQuery)
const presentation = computed<ResponsiveOverlayPresentation>(() => (
  resolveResponsiveOverlayPresentation(mounted.value, desktopMedia.value, props.desktopMode)
))
const slotProps = computed<ResponsiveOverlaySlotProps>(() => ({
  close: closeOverlay,
  isMobile: presentation.value === 'drawer',
  mode: presentation.value === 'pending' ? props.desktopMode : presentation.value,
  open: open.value,
  topLeft: () => emit('top-left'),
}))

function openOverlay() {
  open.value = true
}

function closeOverlay() {
  open.value = false
}

function toggleOverlay() {
  open.value = !open.value
}

onMounted(() => {
  mounted.value = true
})

defineExpose({ close: closeOverlay, open: openOverlay, presentation, toggle: toggleOverlay })
</script>

<template>
  <slot v-if="presentation === 'pending'" name="trigger" v-bind="slotProps" />

  <ResponsiveOverlayDrawer
    v-else-if="presentation === 'drawer'"
    v-model:open="open"
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
    <template #trigger="props"><slot name="trigger" v-bind="props" /></template>
    <template v-if="$slots.header" #header="props"><slot name="header" v-bind="props" /></template>
    <template v-if="$slots.title" #title="props"><slot name="title" v-bind="props" /></template>
    <template v-if="$slots['top-left']" #top-left="props"><slot name="top-left" v-bind="props" /></template>
    <template #default="props"><slot v-bind="props" /></template>
    <template v-if="$slots.footer" #footer="props"><slot name="footer" v-bind="props" /></template>
  </ResponsiveOverlayDrawer>

  <slot v-else name="desktop" v-bind="slotProps" />
</template>
