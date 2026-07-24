<script setup lang="ts">
import type { ScrollAreaScrollbarProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ScrollAreaScrollbar, ScrollAreaThumb } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<ScrollAreaScrollbarProps & { class?: HTMLAttributes['class'] }>(), {
  orientation: 'vertical',
})

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ScrollAreaScrollbar
    data-slot="scroll-area-scrollbar"
    :data-orientation="orientation"
    v-bind="delegatedProps"
    :class="cn('group/scrollbar flex touch-none select-none bg-transparent p-0.5 transition-colors data-horizontal:h-[9px] data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-[9px] data-vertical:border-l data-vertical:border-l-transparent', props.class)"
  >
    <ScrollAreaThumb
      data-slot="scroll-area-thumb"
      class="relative flex-1 rounded-lg bg-transparent before:absolute before:rounded-lg before:bg-ds-fill-bw-transparent-5 before:transition-colors before:content-[''] group-hover/scrollbar:before:bg-ds-fill-bw-transparent-10 group-active/scrollbar:before:bg-ds-fill-bw-transparent-10 group-data-horizontal/scrollbar:before:inset-x-0 group-data-horizontal/scrollbar:before:top-1/2 group-data-horizontal/scrollbar:before:h-1 group-data-horizontal/scrollbar:before:-translate-y-1/2 group-data-vertical/scrollbar:before:inset-y-0 group-data-vertical/scrollbar:before:left-1/2 group-data-vertical/scrollbar:before:w-1 group-data-vertical/scrollbar:before:-translate-x-1/2"
    />
  </ScrollAreaScrollbar>
</template>
