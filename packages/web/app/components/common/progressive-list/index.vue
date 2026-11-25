<script setup lang="ts" generic="T">
import { computed, ref, watch } from 'vue'
import { CollapsibleRoot, CollapsibleContent } from 'reka-ui'
import Button from '@/components/ui/button/Button.vue'

/** 渐进展示集合与父级展开生命周期。 */
const props = withDefaults(defineProps<{
    /** 已排序的完整集合，组件不修改顺序。 */
    items: readonly T[]
    /** 父层是否展开，重开时恢复初始条数。 */
    expanded: boolean
    /** 带所属对象名称的按钮可访问说明。 */
    label: string
    /** 每批内部的布局与间距。 */
    chunkClass?: string
    /** 追加批次和上一批之间的间距。 */
    batchClass?: string
}>(), { chunkClass: '', batchClass: '' })
/** 每批向调用方保留原始元素类型。 */
defineSlots<{ default: (props: { items: readonly T[] }) => unknown }>()
/** 通用按钮文案。 */
const { t } = useI18n()
/** 已请求展开的十条批次数，刷新集合不降低该上限。 */
const revealedBatchCount = ref(0)
/** 重开时重建全部批次及其插槽子树。 */
const renderGeneration = ref(0)
/** 首批始终最多显示五条。 */
const initialItems = computed(() => props.items.slice(0, 5))
/** 剩余元素按十条切块，关闭批次不挂载插槽内容。 */
const batches = computed(() => Array.from({ length: Math.ceil(Math.max(0, props.items.length - 5) / 10) }, (_, index) => props.items.slice(5 + index * 10, 15 + index * 10)))
/** 是否还有可展开的批次。 */
const hasMore = computed(() => revealedBatchCount.value < batches.value.length)
/** 每次最多展示下一批，重复点击不能越界。 */
function reveal(): void {
    if (props.expanded && hasMore.value) revealedBatchCount.value++
}
watch(() => props.expanded, (expanded, previous) => {
    if (!expanded || previous) return
    revealedBatchCount.value = 0
    renderGeneration.value++
}, { flush: 'sync' })
</script>

<template>
    <div :key="renderGeneration">
        <div :class="chunkClass">
            <slot :items="initialItems" />
        </div>
        <CollapsibleRoot
            v-for="(batch, index) in batches"
            :key="index"
            :open="index < revealedBatchCount"
        >
            <CollapsibleContent class="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up motion-reduce:animate-none">
                <div :class="[chunkClass, batchClass]">
                    <slot :items="batch" />
                </div>
            </CollapsibleContent>
        </CollapsibleRoot>
        <CollapsibleRoot :open="hasMore">
            <CollapsibleContent class="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up motion-reduce:animate-none">
                <div class="flex pt-1">
                    <Button
                        variant="ghost"
                        size="xs"
                        class="justify-start text-xs font-normal"
                        :aria-label="label"
                        @click.stop="reveal"
                    >
                        {{ t('common.showMore') }}
                    </Button>
                </div>
            </CollapsibleContent>
        </CollapsibleRoot>
    </div>
</template>
