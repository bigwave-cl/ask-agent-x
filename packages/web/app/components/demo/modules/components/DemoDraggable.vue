<script setup lang="ts">
import type Sortable from 'sortablejs'
import { Button } from '@/components/ui/button'
import CsDraggable from '~/components/common/draggable/index.vue'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoDraggable' })

/** Draggable Demo 的折叠状态。 */
const isOpen = defineModel<boolean>({ default: false })

/** 可排序的演示数据项。 */
interface DraggableDemoItem {
    /** 数据项唯一标识。 */
    id: string
    /** 数据项显示名称。 */
    label: string
    /** 数据项补充说明。 */
    description: string
}

/** 列表重置时使用的三个项目。 */
const initialItems: DraggableDemoItem[] = [
    { id: 'a', label: 'A', description: '知识库整理' },
    { id: 'b', label: 'B', description: '界面设计' },
    { id: 'c', label: 'C', description: '代码评审' },
]

/** 当前拖拽列表的数据顺序。 */
const items = ref<DraggableDemoItem[]>(initialItems.map(item => ({ ...item })))

/** 双列示例的左侧列表数据。 */
const leftItems = ref<DraggableDemoItem[]>(initialItems.map(item => ({ ...item })))

/** 双列示例的右侧列表数据，初始为空以展示空列表拖放区域。 */
const rightItems = ref<DraggableDemoItem[]>([])

/** 最近一次通过跨列表拖动移入的数据项提示。 */
const recentTransfer = ref('尚未发生跨列表移动')

/** 是否启用 SortableJS Swap 插件。 */
const swapEnabled = ref(false)

/** 是否限制为通过拖拽手柄排序。 */
const handleEnabled = ref(false)

/** 是否禁用拖拽排序。 */
const isDisabled = ref(false)

/** 按钮排序时移动项目的方向。 */
type MoveDirection = -1 | 1

/** 展示列表当前的数据顺序。 */
function formatOrder(): string {
    return items.value.map(item => item.label).join(' → ')
}

/** 格式化双列示例当前的数据顺序。 */
function formatListOrder(list: DraggableDemoItem[]): string {
    return list.length ? list.map(item => item.label).join(' → ') : '空'
}

/** 通过可聚焦的上移和下移按钮更新列表顺序。 */
function moveItem(index: number, direction: MoveDirection) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= items.value.length) return

    const nextItems = [...items.value]
    const [item] = nextItems.splice(index, 1)
    if (!item) return

    nextItems.splice(targetIndex, 0, item)
    items.value = nextItems
}

/** 恢复列表的初始顺序。 */
function resetItems() {
    items.value = initialItems.map(item => ({ ...item }))
}

/** 使用 Sortable 原生 onAdd 回调记录移入列表的项目。 */
function recordIncomingItem(event: Sortable.SortableEvent) {
    const itemId = event.item.getAttribute('data-draggable-key')?.split(':').at(-1)
    const item = initialItems.find(candidate => candidate.id === itemId)
    const listName = event.to.getAttribute('data-sortable-list-name') ?? '目标列表'
    recentTransfer.value = item ? `${item.label} 已移入${listName}` : `有项目已移入${listName}`
}

/** 双列共享的 SortableJS 分组名称。 */
const transferGroupName = 'draggable-demo-transfer'

/** 左侧用 group 简写，同时演示原生 onAdd 回调。 */
const leftListOptions: Sortable.Options = {
    onAdd: recordIncomingItem,
}

/** 右侧通过 Sortable.Options 配置 group 和原生回调。 */
const rightListOptions: Sortable.Options = {
    group: { name: transferGroupName, pull: true, put: true },
    onAdd: recordIncomingItem,
}

/** 重置双列数据和最近移入提示。 */
function resetTransferLists() {
    leftItems.value = initialItems.map(item => ({ ...item }))
    rightItems.value = []
    recentTransfer.value = '尚未发生跨列表移动'
}

/** 可复制的 SortableJS 用法。 */
const draggableCode = `<CsDraggable
  v-model="items"
  item-key="id"
  :swap="swapEnabled"
  :handle="handleEnabled ? '.draggable-demo-handle' : undefined"
  :disabled="isDisabled"
  :animation="180"
>
  <template #default="{ item, index }">
    <div>
      <span class="draggable-demo-handle">⠿</span>
      {{ index + 1 }}. {{ item.label }}
    </div>
  </template>
</CsDraggable>`

/** 可复制的双列分组和原生回调用法。 */
const groupCode = `import type Sortable from 'sortablejs'

const options: Sortable.Options = {
  group: { name: 'shared-items', pull: true, put: true },
  onAdd: ({ item }) => { recentItem.value = item.dataset.draggableKey ?? '' },
}

<CsDraggable v-model="left" group="shared-items" item-key="id" />
<CsDraggable v-model="right" :options="options" item-key="id" />`
</script>

<template>
    <DemoSection
        v-model="isOpen"
        sec-key="components-draggable"
        title="SortableJS 拖拽排序"
        description="通过统一的 CsDraggable 管理排序后的 modelValue，支持 Swap、拖拽手柄和禁用状态。"
    >
        <div
            v-if="isOpen"
            class="grid gap-3 rounded-2xl border bg-background p-3 sm:p-5"
            data-testid="draggable-demo"
        >
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        :variant="swapEnabled ? 'soft' : 'outlined'"
                        size="sm"
                        :aria-pressed="swapEnabled"
                        @click="swapEnabled = !swapEnabled"
                    >
                        交换位置（Swap）
                    </Button>
                    <Button
                        type="button"
                        :variant="handleEnabled ? 'soft' : 'outlined'"
                        size="sm"
                        :aria-pressed="handleEnabled"
                        @click="handleEnabled = !handleEnabled"
                    >
                        {{ handleEnabled ? '仅手柄拖动' : '启用拖拽手柄' }}
                    </Button>
                    <Button
                        type="button"
                        :variant="isDisabled ? 'soft' : 'outlined'"
                        size="sm"
                        :aria-pressed="isDisabled"
                        @click="isDisabled = !isDisabled"
                    >
                        {{ isDisabled ? '拖拽已禁用' : '禁用拖拽' }}
                    </Button>
                </div>
                <div class="flex items-center gap-2">
                    <DemoCopyButton
                        :text="draggableCode"
                        label="复制用法"
                        copied-label="已复制"
                        variant="outlined"
                    />
                    <Button
                        type="button"
                        variant="outlined"
                        size="sm"
                        @click="resetItems"
                    >
                        重置
                    </Button>
                </div>
            </div>

            <CsDraggable
                v-model="items"
                item-key="id"
                :swap="swapEnabled"
                :handle="handleEnabled ? '.draggable-demo-handle' : undefined"
                :disabled="isDisabled"
                :animation="180"
            >
                <template #default="{ item, index }">
                    <div
                        class="flex min-h-14 items-center gap-2 rounded-xl border bg-card px-3 py-2 transition-colors"
                        :class="isDisabled ? 'cursor-not-allowed opacity-60' : handleEnabled ? '' : 'cursor-grab hover:border-primary/40 hover:bg-primary/5 active:cursor-grabbing'"
                    >
                        <span
                            v-if="handleEnabled"
                            class="draggable-demo-handle grid size-7 shrink-0 cursor-grab place-items-center rounded-lg bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary active:cursor-grabbing"
                            aria-label="拖动排序"
                        >
                            <Icon
                                name="askx-objects:move"
                                class="size-4"
                                aria-hidden="true"
                            />
                        </span>
                        <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 font-mono text-xs font-semibold text-primary">{{ item.label }}</span>
                        <span class="min-w-0 flex-1 text-sm">{{ item.description }}</span>
                        <div class="flex shrink-0 items-center gap-0.5">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                :aria-label="`上移项目 ${item.label}`"
                                :disabled="index === 0"
                                @pointerdown.stop
                                @mousedown.stop
                                @touchstart.stop
                                @click.stop="moveItem(index, -1)"
                            >
                                ↑
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                :aria-label="`下移项目 ${item.label}`"
                                :disabled="index === items.length - 1"
                                @pointerdown.stop
                                @mousedown.stop
                                @touchstart.stop
                                @click.stop="moveItem(index, 1)"
                            >
                                ↓
                            </Button>
                        </div>
                    </div>
                </template>
            </CsDraggable>

            <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-2.5">
                <span class="text-xs text-muted-foreground">当前 modelValue 顺序</span>
                <code
                    class="font-mono text-xs text-primary"
                    aria-live="polite"
                >{{ formatOrder() }}</code>
            </div>

            <section
                class="grid gap-3 border-t pt-4"
                data-testid="draggable-groups-demo"
            >
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h4 class="text-sm font-semibold">
                            双列表移动
                        </h4>
                        <p class="mt-1 text-xs leading-5 text-muted-foreground">
                            左侧使用 group 简写，右侧使用 options.group。两边都可接收和移出项目；空列表保留可放置区域。
                        </p>
                    </div>
                    <div class="flex items-center gap-2">
                        <DemoCopyButton
                            :text="groupCode"
                            label="复制分组用法"
                            copied-label="已复制"
                            variant="outlined"
                        />
                        <Button
                            type="button"
                            variant="outlined"
                            size="sm"
                            @click="resetTransferLists"
                        >
                            重置双列
                        </Button>
                    </div>
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                    <article
                        class="grid content-start gap-2 rounded-xl border bg-background p-3"
                        data-testid="draggable-group-left-panel"
                    >
                        <div class="flex items-center justify-between gap-2">
                            <strong class="text-xs">列表 A · group 简写</strong>
                            <code class="font-mono text-[10px] text-muted-foreground">{{ leftItems.length }} 项</code>
                        </div>
                        <div class="relative">
                            <CsDraggable
                                v-model="leftItems"
                                item-key="id"
                                :group="transferGroupName"
                                :options="leftListOptions"
                                :animation="180"
                                class="flex min-h-24 flex-col gap-2 rounded-lg border border-dashed p-2"
                                data-testid="draggable-group-left"
                                data-sortable-list-name="列表 A"
                            >
                                <template #default="{ item, index }">
                                    <div class="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3 py-2">
                                        <span class="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 font-mono text-[10px] font-semibold text-primary">{{ item.label }}</span>
                                        <span class="min-w-0 flex-1 text-xs">{{ item.description }}</span>
                                        <span class="font-mono text-[10px] text-muted-foreground">{{ index + 1 }}</span>
                                    </div>
                                </template>
                            </CsDraggable>
                            <p
                                v-if="leftItems.length === 0"
                                class="pointer-events-none absolute inset-0 grid place-items-center text-xs text-muted-foreground"
                                data-testid="draggable-group-left-empty"
                            >
                                拖到此处
                            </p>
                        </div>
                        <div class="rounded-lg bg-muted/45 px-3 py-2 text-[10px]">
                            <span class="text-muted-foreground">modelValue：</span><code class="font-mono text-primary">{{ formatListOrder(leftItems) }}</code>
                        </div>
                    </article>

                    <article
                        class="grid content-start gap-2 rounded-xl border bg-background p-3"
                        data-testid="draggable-group-right-panel"
                    >
                        <div class="flex items-center justify-between gap-2">
                            <strong class="text-xs">列表 B · options.group</strong>
                            <code class="font-mono text-[10px] text-muted-foreground">{{ rightItems.length }} 项</code>
                        </div>
                        <div class="relative">
                            <CsDraggable
                                v-model="rightItems"
                                item-key="id"
                                :options="rightListOptions"
                                :animation="180"
                                class="flex min-h-24 flex-col gap-2 rounded-lg border border-dashed p-2"
                                data-testid="draggable-group-right"
                                data-sortable-list-name="列表 B"
                            >
                                <template #default="{ item, index }">
                                    <div class="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3 py-2">
                                        <span class="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 font-mono text-[10px] font-semibold text-primary">{{ item.label }}</span>
                                        <span class="min-w-0 flex-1 text-xs">{{ item.description }}</span>
                                        <span class="font-mono text-[10px] text-muted-foreground">{{ index + 1 }}</span>
                                    </div>
                                </template>
                            </CsDraggable>
                            <p
                                v-if="rightItems.length === 0"
                                class="pointer-events-none absolute inset-0 grid place-items-center text-xs text-muted-foreground"
                                data-testid="draggable-group-right-empty"
                            >
                                拖到此处
                            </p>
                        </div>
                        <div class="rounded-lg bg-muted/45 px-3 py-2 text-[10px]">
                            <span class="text-muted-foreground">modelValue：</span><code class="font-mono text-primary">{{ formatListOrder(rightItems) }}</code>
                        </div>
                    </article>
                </div>

                <p
                    class="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground"
                    aria-live="polite"
                    data-testid="draggable-recent-transfer"
                >
                    最近移入：{{ recentTransfer }}
                </p>
            </section>
        </div>
    </DemoSection>
</template>
