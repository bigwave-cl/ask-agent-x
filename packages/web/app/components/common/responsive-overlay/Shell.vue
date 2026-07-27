<script setup lang="ts">
import { ChevronLeft, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { PopoverDescription, PopoverTitle } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { responsiveOverlayClasses, responsiveOverlayShellDefaults } from './overlayOptions'
import type { ResponsiveOverlayShellProps, ResponsiveOverlaySlotProps } from './types'

defineOptions({ name: 'ResponsiveOverlayShell' })

const props = withDefaults(defineProps<ResponsiveOverlayShellProps>(), {
  ...responsiveOverlayShellDefaults,
})

const emit = defineEmits<{
  close: []
  'top-left': []
}>()

const slots = defineSlots<{
  default?: (props: ResponsiveOverlaySlotProps) => unknown
  footer?: (props: ResponsiveOverlaySlotProps) => unknown
  header?: (props: ResponsiveOverlaySlotProps) => unknown
  title?: (props: ResponsiveOverlaySlotProps) => unknown
  'top-left'?: (props: ResponsiveOverlaySlotProps) => unknown
}>()

const titleComponent = computed(() => ({
  dialog: DialogTitle,
  drawer: DrawerTitle,
  popover: PopoverTitle,
})[props.mode])
const descriptionComponent = computed(() => ({
  dialog: DialogDescription,
  drawer: DrawerDescription,
  popover: PopoverDescription,
})[props.mode])
const isHeaderEnabled = computed(() => {
  if (typeof props.showHeader === 'boolean') return props.showHeader
  return props.isMobile
    ? props.showHeader?.mobile !== false
    : props.showHeader?.desktop !== false
})
const isCloseEnabled = computed(() => {
  if (typeof props.showClose === 'boolean') return props.showClose
  return props.isMobile
    ? props.showClose?.mobile !== false
    : props.showClose?.desktop !== false
})
const shouldRenderTopLeft = computed(() => props.showTopLeft || Boolean(slots['top-left']))
const shouldRenderHeader = computed(() => isHeaderEnabled.value && (
  Boolean(slots.header) || Boolean(props.title) || shouldRenderTopLeft.value || isCloseEnabled.value
))
const shouldRenderHiddenTitle = computed(() => !shouldRenderHeader.value || Boolean(slots.header) || Boolean(slots.title))
const slotProps = computed<ResponsiveOverlaySlotProps>(() => ({
  close: () => emit('close'),
  isMobile: props.isMobile,
  mode: props.mode,
  open: props.open,
  topLeft: () => emit('top-left'),
}))
</script>

<template>
  <div data-slot="responsive-overlay-shell" :class="cn(responsiveOverlayClasses.shell.root, shellClass)">
    <template v-if="shouldRenderHiddenTitle">
      <component :is="titleComponent" class="sr-only">{{ title }}</component>
    </template>
    <component v-if="description" :is="descriptionComponent" class="sr-only">{{ description }}</component>

    <header
      v-if="shouldRenderHeader"
      :class="cn(responsiveOverlayClasses.shell.header, headerClass)"
    >
      <template v-if="$slots.header">
        <slot name="header" v-bind="slotProps" />
      </template>
      <template v-else>
        <div :class="responsiveOverlayClasses.shell.heading">
          <div v-if="shouldRenderTopLeft" :class="responsiveOverlayClasses.shell.topLeftArea">
            <slot name="top-left" v-bind="slotProps">
              <Button
                type="button"
                variant="ghost"
                size="36"
                square
                :disabled="topLeftDisabled"
                :class="cn(responsiveOverlayClasses.shell.topLeftButton, topLeftButtonClass)"
                :aria-label="topLeftLabel"
                @click="emit('top-left')"
              >
                <ChevronLeft class="size-3 md:size-5" />
              </Button>
            </slot>
          </div>
          <slot name="title" v-bind="slotProps">
            <component
              :is="titleComponent"
              :class="cn(responsiveOverlayClasses.shell.title, titleClass)"
            >
              {{ title }}
            </component>
          </slot>
        </div>
      </template>
    </header>

    <Button
      v-if="isCloseEnabled"
      type="button"
      variant="ghost"
      size="36"
      square
      :disabled="closeDisabled"
      :class="cn(responsiveOverlayClasses.shell.closeButton, closeButtonClass)"
      :aria-label="closeLabel"
      @click="emit('close')"
    >
      <X class="size-3" />
    </Button>

    <ScrollArea class="min-h-0 flex-1" :viewport-class="responsiveOverlayClasses.shell.viewport[mode]">
      <div :class="cn(responsiveOverlayClasses.shell.body[mode], bodyClass)">
        <slot v-bind="slotProps" />
      </div>
    </ScrollArea>

    <footer v-if="$slots.footer" :class="cn(responsiveOverlayClasses.shell.footer[mode], footerClass)">
      <slot name="footer" v-bind="slotProps" />
    </footer>
  </div>
</template>
