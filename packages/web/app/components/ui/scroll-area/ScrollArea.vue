<script setup lang="ts">
import type { ScrollAreaRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import {
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaViewport,
} from 'reka-ui'
import { cn } from '@/lib/utils'
import ScrollBar from './ScrollBar.vue'

type ScrollAreaOrientation = 'vertical' | 'horizontal' | 'both'

const props = withDefaults(defineProps<ScrollAreaRootProps & {
  class?: HTMLAttributes['class']
  viewportClass?: HTMLAttributes['class']
  orientation?: ScrollAreaOrientation
}>(), {
  orientation: 'vertical',
})

const delegatedProps = reactiveOmit(props, 'class', 'viewportClass', 'orientation')
const viewportRef = ref<{ viewportElement?: HTMLElement } | null>(null)

const hasVerticalScrollbar = computed(() => props.orientation !== 'horizontal')
const hasHorizontalScrollbar = computed(() => props.orientation !== 'vertical')

function getViewportElement() {
  return viewportRef.value?.viewportElement ?? null
}

function scrollTo(options: ScrollToOptions) {
  getViewportElement()?.scrollTo(options)
}

defineExpose({ getViewportElement, scrollTo })
</script>

<template>
  <ScrollAreaRoot
    data-slot="scroll-area"
    v-bind="delegatedProps"
    :class="cn('relative overflow-hidden', props.class)"
  >
    <ScrollAreaViewport
      ref="viewportRef"
      data-slot="scroll-area-viewport"
      :class="cn('size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1', props.viewportClass)"
    >
      <slot />
    </ScrollAreaViewport>
    <ScrollBar v-if="hasVerticalScrollbar" orientation="vertical" />
    <ScrollBar v-if="hasHorizontalScrollbar" orientation="horizontal" />
    <ScrollAreaCorner data-slot="scroll-area-corner" class="bg-transparent" />
  </ScrollAreaRoot>
</template>
