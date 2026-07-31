<script setup lang="ts">
import type { TabsRootEmits, TabsRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { TabsRoot, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

/** Tabs 根节点属性。 */
const props = defineProps<TabsRootProps & { class?: HTMLAttributes['class'] }>()

/** Tabs 根节点事件。 */
const emits = defineEmits<TabsRootEmits>()

/** 排除样式后的 Reka 属性。 */
const delegatedProps = reactiveOmit(props, 'class')

/** 透传给 Reka TabsRoot 的属性与事件。 */
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <TabsRoot
    v-slot="slotProps"
    data-slot="tabs"
    :data-orientation="forwarded.orientation || 'horizontal'"
    v-bind="forwarded"
    :class="cn('gap-2 group/tabs flex data-horizontal:flex-col', props.class)"
  >
    <slot v-bind="slotProps" />
  </TabsRoot>
</template>
