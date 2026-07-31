<script setup lang="ts">
import type { TabsListProps } from 'reka-ui'
import type { AskxTabsListProps } from './tabsTypes'
import { reactiveOmit } from '@vueuse/core'
import { TabsList } from 'reka-ui'
import { cn } from '@/lib/utils'
import {
  tabsDefaultScrollable,
  tabsDefaultShape,
  tabsDefaultSize,
  tabsDefaultVariant,
} from './tabsTypes'
import { tabsListVariants } from './tabsVariants'

/** TabsList 属性。 */
const props = withDefaults(defineProps<AskxTabsListProps>(), {
  variant: tabsDefaultVariant,
  size: tabsDefaultSize,
  shape: tabsDefaultShape,
  scrollable: tabsDefaultScrollable,
})

/** 排除 AskX 视觉参数后的 Reka 属性。 */
const delegatedProps = reactiveOmit(props, 'class', 'variant', 'size', 'shape', 'scrollable') as TabsListProps
</script>

<template>
  <TabsList
    data-slot="tabs-list"
    :data-variant="variant"
    :data-size="size"
    :data-shape="shape"
    :data-scrollable="scrollable"
    v-bind="delegatedProps"
    :class="cn(tabsListVariants({ variant, shape, scrollable }), props.class)"
  >
    <slot />
  </TabsList>
</template>
