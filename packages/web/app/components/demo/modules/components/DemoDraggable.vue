<script setup lang="ts">
import type Sortable from 'sortablejs'
import { Button } from '@/components/ui/button'
import Tabs from '@/components/ui/tabs/Tabs.vue'
import TabsContent from '@/components/ui/tabs/TabsContent.vue'
import TabsList from '@/components/ui/tabs/TabsList.vue'
import TabsTrigger from '@/components/ui/tabs/TabsTrigger.vue'
import CsDraggable from '~/components/common/draggable/index.vue'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoDraggable' })

/** Draggable Demo 的折叠状态。 */
const isOpen = defineModel<boolean>({ default: false })

/** 可排序的目录及其展开子项。 */
interface DirectoryDemoItem {
    /** 目录唯一标识。 */
    id: string
    /** 目录标题。 */
    name: string
    /** 当前可见的模拟子项。 */
    children: string[]
}

/** 各排序示例使用的目录数据。 */
const initialDirectories: DirectoryDemoItem[] = [
    { id: 'docs', name: '产品文档', children: ['需求说明.md', '使用指南.md'] },
    { id: 'web', name: 'Web 应用', children: ['components/', 'pages/'] },
    { id: 'service', name: '服务接口', children: ['openapi.yaml', 'bridge.ts'] },
]

/** 创建目录数据的独立副本。 */
function cloneDirectories(): DirectoryDemoItem[] {
    return initialDirectories.map(item => ({ ...item, children: [...item.children] }))
}

/** 当前插入线示例的数据顺序。 */
const indicatorItems = ref<DirectoryDemoItem[]>(cloneDirectories())

/** 当前基础排序示例的数据顺序。 */
const basicItems = ref<DirectoryDemoItem[]>(cloneDirectories())

/** 跨列表示例左侧列表的数据。 */
const leftItems = ref<DirectoryDemoItem[]>(cloneDirectories())

/** 跨列表示例右侧列表的数据，初始为空以展示空投放区域。 */
const rightItems = ref<DirectoryDemoItem[]>([])

/** 当前选中的拖拽示例标签。 */
const activeTab = ref('indicator')

/** 是否启用 SortableJS Swap 插件。 */
const swapEnabled = ref(false)

/** 是否限制为通过拖拽手柄排序。 */
const handleEnabled = ref(false)

/** 是否禁用拖拽排序。 */
const isDisabled = ref(false)

/** 最近一次通过跨列表拖动移入的数据项提示。 */
const recentTransfer = ref('尚未发生跨列表移动')

/** 按钮排序时移动项目的方向。 */
type MoveDirection = -1 | 1

/** 展示当前列表的数据顺序。 */
function formatOrder(items: DirectoryDemoItem[]): string {
    return items.length ? items.map(item => item.name).join(' → ') : '空列表'
}

/** 通过可聚焦的上移和下移按钮更新基础列表顺序。 */
function moveItem(index: number, direction: MoveDirection) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= basicItems.value.length) return

    const nextItems = [...basicItems.value]
    const [item] = nextItems.splice(index, 1)
    if (!item) return

    nextItems.splice(targetIndex, 0, item)
    basicItems.value = nextItems
}

/** 恢复插入线示例的初始顺序。 */
function resetIndicatorItems() {
    indicatorItems.value = cloneDirectories()
}

/** 恢复基础排序示例的初始顺序。 */
function resetBasicItems() {
    basicItems.value = cloneDirectories()
}

/** 使用 Sortable 原生 onAdd 回调记录移入列表的目录。 */
function recordIncomingItem(event: Sortable.SortableEvent) {
    const itemId = event.item.getAttribute('data-draggable-key')?.split(':').at(-1)
    const item = initialDirectories.find(candidate => candidate.id === itemId)
    const listName = event.to.getAttribute('data-sortable-list-name') ?? '目标列表'
    recentTransfer.value = item ? `${item.name} 已移入${listName}` : `有目录已移入${listName}`
}

/** 双列共享的 SortableJS 分组名称。 */
const transferGroupName = 'draggable-demo-transfer'

/** 左侧以 group 简写指定分组，并演示原生 onAdd。 */
const leftListOptions: Sortable.Options = {
    onAdd: recordIncomingItem,
}

/** 右侧使用官方 Options 配置 group 和原生 onAdd。 */
const rightListOptions: Sortable.Options = {
    group: { name: transferGroupName, pull: true, put: true },
    onAdd: recordIncomingItem,
}

/** 重置双列数据和最近移入提示。 */
function resetTransferLists() {
    leftItems.value = cloneDirectories()
    rightItems.value = []
    recentTransfer.value = '尚未发生跨列表移动'
}

/** 可复制的插入线用法。 */
const indicatorCode = `<CsDraggable v-model="items" item-key="id" insertion-indicator>
  <template #default="{ item }"><div>{{ item.name }}</div></template>
  <template #preview="{ item }">
    <span class="flex items-center gap-2"><Icon name="askx-objects:folder" />{{ item.name }}</span>
  </template>
</CsDraggable>`

/** 可复制的基础排序用法。 */
const basicCode = `<CsDraggable
  v-model="items"
  item-key="id"
  :swap="swapEnabled"
  :handle="handleEnabled ? '.drag-handle' : undefined"
  :disabled="isDisabled"
  :animation="180"
>
  <template #default="{ item, index }">
    <div>
      <span v-if="handleEnabled" class="drag-handle">⠿</span>
      <Icon name="askx-objects:folder" />
      {{ index + 1 }}. {{ item.name }}
    </div>
  </template>
  <template #preview="{ item }">
    <span><Icon name="askx-objects:folder" />{{ item.name }}</span>
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
        description="用可拖动列表演示插入线、基础排序和跨列表移动。"
    >
        <div
            v-if="isOpen"
            class="grid gap-3 rounded-2xl border bg-background p-3 sm:p-5"
            data-testid="draggable-demo"
        >
            <Tabs
                v-model="activeTab"
                class="w-full"
            >
                <TabsList
                    variant="segment"
                    aria-label="拖拽排序示例"
                >
                    <TabsTrigger value="indicator">
                        插入线
                    </TabsTrigger>
                    <TabsTrigger value="basic">
                        基础排序
                    </TabsTrigger>
                    <TabsTrigger value="groups">
                        跨列表
                    </TabsTrigger>
                </TabsList>

                <TabsContent
                    value="indicator"
                    class="grid gap-3 pt-2"
                    data-testid="draggable-indicator-tab"
                >
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <p class="text-xs text-muted-foreground">
                            拖动目录，在目标位置显示插入线；拖拽浮层只显示目录标题。
                        </p>
                        <div class="flex items-center gap-2">
                            <DemoCopyButton
                                :text="indicatorCode"
                                label="复制用法"
                                copied-label="已复制"
                                variant="outlined"
                            />
                            <Button
                                type="button"
                                variant="outlined"
                                size="sm"
                                @click="resetIndicatorItems"
                            >
                                重置
                            </Button>
                        </div>
                    </div>

                    <CsDraggable
                        v-model="indicatorItems"
                        item-key="id"
                        insertion-indicator
                        :animation="180"
                        class="grid gap-2"
                        data-testid="draggable-indicator-list"
                    >
                        <template #default="{ item, index }">
                            <article class="overflow-hidden rounded-xl border bg-card">
                                <div class="flex min-h-11 items-center gap-2 px-3 py-2">
                                    <Icon
                                        name="askx-objects:folder"
                                        class="size-4 shrink-0 text-primary"
                                        aria-hidden="true"
                                    />
                                    <strong class="min-w-0 flex-1 truncate text-xs">{{ item.name }}</strong>
                                    <span class="font-mono text-[10px] text-muted-foreground">{{ index + 1 }}</span>
                                </div>
                                <div class="grid gap-1 border-t px-3 py-2">
                                    <div
                                        v-for="child in item.children"
                                        :key="child"
                                        class="border-l pl-5 text-[10px] leading-5 text-muted-foreground"
                                    >
                                        {{ child }}
                                    </div>
                                </div>
                            </article>
                        </template>
                        <template #preview="{ item }">
                            <span class="flex items-center gap-2 text-xs font-medium">
                                <Icon
                                    name="askx-objects:folder"
                                    class="size-4 shrink-0 text-primary"
                                    aria-hidden="true"
                                />
                                {{ item.name }}
                            </span>
                        </template>
                    </CsDraggable>

                    <p class="rounded-lg border border-dashed px-3 py-2 text-[10px] text-muted-foreground">
                        modelValue：<code class="font-mono text-primary">{{ formatOrder(indicatorItems) }}</code>
                    </p>
                </TabsContent>

                <TabsContent
                    value="basic"
                    class="grid gap-3 pt-2"
                    data-testid="draggable-basic-tab"
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
                                :text="basicCode"
                                label="复制用法"
                                copied-label="已复制"
                                variant="outlined"
                            />
                            <Button
                                type="button"
                                variant="outlined"
                                size="sm"
                                @click="resetBasicItems"
                            >
                                重置
                            </Button>
                        </div>
                    </div>

                    <CsDraggable
                        v-model="basicItems"
                        item-key="id"
                        :swap="swapEnabled"
                        :handle="handleEnabled ? '.draggable-demo-handle' : undefined"
                        :disabled="isDisabled"
                        :animation="180"
                        class="grid gap-2"
                        data-testid="draggable-basic-list"
                    >
                        <template #default="{ item, index }">
                            <article class="overflow-hidden rounded-xl border bg-card">
                                <div class="flex min-h-11 items-center gap-2 px-3 py-2">
                                    <span
                                        v-if="handleEnabled"
                                        class="draggable-demo-handle grid size-7 shrink-0 cursor-grab place-items-center rounded-md bg-muted text-muted-foreground"
                                        aria-label="拖动排序"
                                    >
                                        <Icon
                                            name="askx-objects:move"
                                            class="size-4"
                                            aria-hidden="true"
                                        />
                                    </span>
                                    <Icon
                                        name="askx-objects:folder"
                                        class="size-4 shrink-0 text-primary"
                                        aria-hidden="true"
                                    />
                                    <strong class="min-w-0 flex-1 truncate text-xs">{{ item.name }}</strong>
                                    <span class="font-mono text-[10px] text-muted-foreground">{{ index + 1 }}</span>
                                    <div class="flex shrink-0 items-center gap-0.5">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            :aria-label="`上移 ${item.name}`"
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
                                            size="icon-xs"
                                            :aria-label="`下移 ${item.name}`"
                                            :disabled="index === basicItems.length - 1"
                                            @pointerdown.stop
                                            @mousedown.stop
                                            @touchstart.stop
                                            @click.stop="moveItem(index, 1)"
                                        >
                                            ↓
                                        </Button>
                                    </div>
                                </div>
                                <div class="grid gap-1 border-t px-3 py-2">
                                    <div
                                        v-for="child in item.children"
                                        :key="child"
                                        class="border-l pl-5 text-[10px] leading-5 text-muted-foreground"
                                    >
                                        {{ child }}
                                    </div>
                                </div>
                            </article>
                        </template>
                        <template #preview="{ item }">
                            <span class="flex items-center gap-2 text-xs font-medium">
                                <Icon
                                    name="askx-objects:folder"
                                    class="size-4 shrink-0 text-primary"
                                    aria-hidden="true"
                                />
                                {{ item.name }}
                            </span>
                        </template>
                    </CsDraggable>

                    <p class="rounded-lg border border-dashed px-3 py-2 text-[10px] text-muted-foreground">
                        modelValue：<code class="font-mono text-primary">{{ formatOrder(basicItems) }}</code>
                    </p>
                </TabsContent>

                <TabsContent
                    value="groups"
                    class="grid gap-3 pt-2"
                    data-testid="draggable-groups-tab"
                >
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <p class="text-xs text-muted-foreground">
                            拖动目录在列表 A 和 B 间双向移动；空列表仍可接收项目。
                        </p>
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
                                重置
                            </Button>
                        </div>
                    </div>

                    <div class="grid gap-3 md:grid-cols-2">
                        <article class="grid content-start gap-2 rounded-xl border bg-background p-3">
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
                                        <article class="overflow-hidden rounded-lg border bg-card">
                                            <div class="flex min-h-10 items-center gap-2 px-2.5 py-2">
                                                <Icon
                                                    name="askx-objects:folder"
                                                    class="size-4 shrink-0 text-primary"
                                                    aria-hidden="true"
                                                />
                                                <strong class="min-w-0 flex-1 truncate text-xs">{{ item.name }}</strong>
                                                <span class="font-mono text-[10px] text-muted-foreground">{{ index + 1 }}</span>
                                            </div>
                                            <div class="grid gap-1 border-t px-2.5 py-1.5">
                                                <div
                                                    v-for="child in item.children"
                                                    :key="child"
                                                    class="border-l pl-4 text-[10px] leading-5 text-muted-foreground"
                                                >
                                                    {{ child }}
                                                </div>
                                            </div>
                                        </article>
                                    </template>
                                    <template #preview="{ item }">
                                        <span class="flex items-center gap-2 text-xs font-medium">
                                            <Icon
                                                name="askx-objects:folder"
                                                class="size-4 shrink-0 text-primary"
                                                aria-hidden="true"
                                            />
                                            {{ item.name }}
                                        </span>
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
                            <p class="rounded-lg bg-muted/45 px-3 py-2 text-[10px] text-muted-foreground">
                                modelValue：<code class="font-mono text-primary">{{ formatOrder(leftItems) }}</code>
                            </p>
                        </article>

                        <article class="grid content-start gap-2 rounded-xl border bg-background p-3">
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
                                        <article class="overflow-hidden rounded-lg border bg-card">
                                            <div class="flex min-h-10 items-center gap-2 px-2.5 py-2">
                                                <Icon
                                                    name="askx-objects:folder"
                                                    class="size-4 shrink-0 text-primary"
                                                    aria-hidden="true"
                                                />
                                                <strong class="min-w-0 flex-1 truncate text-xs">{{ item.name }}</strong>
                                                <span class="font-mono text-[10px] text-muted-foreground">{{ index + 1 }}</span>
                                            </div>
                                            <div class="grid gap-1 border-t px-2.5 py-1.5">
                                                <div
                                                    v-for="child in item.children"
                                                    :key="child"
                                                    class="border-l pl-4 text-[10px] leading-5 text-muted-foreground"
                                                >
                                                    {{ child }}
                                                </div>
                                            </div>
                                        </article>
                                    </template>
                                    <template #preview="{ item }">
                                        <span class="flex items-center gap-2 text-xs font-medium">
                                            <Icon
                                                name="askx-objects:folder"
                                                class="size-4 shrink-0 text-primary"
                                                aria-hidden="true"
                                            />
                                            {{ item.name }}
                                        </span>
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
                            <p class="rounded-lg bg-muted/45 px-3 py-2 text-[10px] text-muted-foreground">
                                modelValue：<code class="font-mono text-primary">{{ formatOrder(rightItems) }}</code>
                            </p>
                        </article>
                    </div>

                    <p
                        class="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground"
                        aria-live="polite"
                        data-testid="draggable-recent-transfer"
                    >
                        最近移入：{{ recentTransfer }}
                    </p>
                </TabsContent>
            </Tabs>
        </div>
    </DemoSection>
</template>
