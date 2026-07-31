<script setup lang="ts">
import type { TabsTriggerProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { TabsTrigger, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'
import { tabsTriggerClass } from './tabsVariants'

/** TabsTrigger 属性。 */
const props = defineProps<TabsTriggerProps & { class?: HTMLAttributes['class'] }>()

/** 排除样式后的 Reka 属性。 */
const delegatedProps = reactiveOmit(props, 'class')

/** 透传给 Reka TabsTrigger 的属性。 */
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <TabsTrigger
    data-slot="tabs-trigger"
    :class="cn(tabsTriggerClass, props.class)"
    v-bind="forwardedProps"
  >
    <slot />
  </TabsTrigger>
</template>
