<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { PrimitiveProps } from 'reka-ui'
import { Primitive } from 'reka-ui'
import { cn } from '@/lib/utils'

defineOptions({ name: 'WorkspaceContent' })

/** 工作台统一内容容器属性。 */
interface WorkspaceContentProps extends PrimitiveProps {
  /** 追加到统一容器的样式。 */
  class?: HTMLAttributes['class']
}

/** 工作台内容容器属性。 */
const props = withDefaults(defineProps<WorkspaceContentProps>(), {
  as: 'div',
})
</script>

<template>
  <Primitive
    data-slot="workspace-content"
    :as="props.as"
    :as-child="props.asChild"
    :class="cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', props.class)"
  >
    <slot />
  </Primitive>
</template>
