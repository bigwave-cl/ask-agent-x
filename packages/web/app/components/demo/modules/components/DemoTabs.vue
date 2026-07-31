<script setup lang="ts">
import type { TabsShape, TabsSize, TabsVariant } from '@/components/ui/tabs/tabsTypes'
import { Badge } from '@/components/ui/badge'
import Tabs from '@/components/ui/tabs/Tabs.vue'
import TabsContent from '@/components/ui/tabs/TabsContent.vue'
import TabsList from '@/components/ui/tabs/TabsList.vue'
import TabsTrigger from '@/components/ui/tabs/TabsTrigger.vue'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoTabs' })

/** Tabs Demo 的折叠状态。 */
const isOpen = defineModel<boolean>({ default: false })

/** 支持的视觉形态。 */
const variants: TabsVariant[] = ['line', 'tag', 'segment']

/** 视觉形态对应说明。 */
const variantMeta: Record<TabsVariant, { name: string, description: string }> = {
  line: { name: 'Line', description: '页面级内容分类与主导航。' },
  tag: { name: 'Tag', description: '分离标签与轻量筛选场景。' },
  segment: { name: 'Segment', description: '同一任务内的视图模式切换。' },
}

/** 每种视觉形态的当前值。 */
const variantValues = reactive<Record<TabsVariant, string>>({
  line: 'overview',
  tag: 'overview',
  segment: 'overview',
})

/** 支持的标签高度。 */
const sizes: TabsSize[] = ['28', '36', '40', '44']

/** 支持的标签圆角。 */
const shapes: TabsShape[] = ['regular', 'pill']

/** 自定义内容示例的当前值。 */
const customValue = ref('create')

/** 横向滚动示例的当前值。 */
const scrollableValue = ref('recommended')

/** 基础用法代码。 */
const basicCode = `<Tabs default-value="overview">
  <TabsList variant="segment" size="40" shape="pill">
    <TabsTrigger value="overview">概览</TabsTrigger>
    <TabsTrigger value="assets">资源</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">概览内容</TabsContent>
</Tabs>`

/** 横向滚动标签数据。 */
const scrollableItems = [
  { value: 'recommended', label: '为你推荐' },
  { value: 'trending', label: '热门' },
  { value: 'portrait', label: '人像' },
  { value: 'product', label: '产品' },
  { value: 'marketing', label: '营销' },
  { value: 'social', label: '社交媒体' },
  { value: 'illustration', label: '插画' },
  { value: 'background', label: '背景' },
]
</script>

<template>
  <DemoSection v-model="isOpen" sec-key="components-tabs" title="Tabs 标签页" description="保留 shadcn 组合式 API，迁移 PG 的 Line、Tag、Segment、尺寸和滚动规范。">
    <div class="grid gap-6 rounded-2xl border bg-background p-3 sm:p-5" data-testid="tabs-demo">
      <article class="relative overflow-hidden rounded-2xl border bg-background p-6 sm:p-8">
        <div class="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-primary/12 blur-3xl" />
        <div class="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <Badge variant="soft"><Icon name="askx-objects:layers" />REKA / PG STYLE</Badge>
            <h3 class="mt-6 text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">标签切换保持轻盈，也保留明确层级。</h3>
            <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">Tabs、TabsList、TabsTrigger 与 TabsContent 仍是 shadcn 的组合结构；AskX 只在 primitive 上补充 DS 视觉参数。</p>
          </div>
          <DemoCopyButton :text="basicCode" label="复制基础用法" copied-label="已复制" variant="outlined" />
        </div>
      </article>

      <section class="grid gap-2" data-demo-subsection="tabs-variants">
        <div class="px-1"><h4 class="text-base font-semibold">Variant Gallery</h4><p class="mt-1 text-xs leading-5 text-muted-foreground">默认使用 Line；三种形态共享 Reka 的方向键、Home、End、禁用态和焦点管理。</p></div>
        <article class="grid gap-3 rounded-2xl border bg-background p-3 sm:p-5">
          <div v-for="variant in variants" :key="variant" class="grid min-w-0 gap-4 rounded-xl border bg-card p-4 xl:grid-cols-[180px_minmax(0,1fr)_120px] xl:items-center">
            <div>
              <div class="flex items-center gap-2"><strong class="text-sm">{{ variantMeta[variant].name }}</strong><code class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-primary">{{ variant }}</code></div>
              <p class="mt-1.5 text-xs leading-5 text-muted-foreground">{{ variantMeta[variant].description }}</p>
            </div>
            <Tabs v-model="variantValues[variant]" class="min-w-0">
              <TabsList :variant="variant" aria-label="Tabs 视觉形态示例">
                <TabsTrigger value="overview">概览</TabsTrigger>
                <TabsTrigger value="assets">资源</TabsTrigger>
                <TabsTrigger value="disabled" disabled>不可用</TabsTrigger>
              </TabsList>
            </Tabs>
            <span class="font-mono text-[10px] text-muted-foreground">{{ variantValues[variant] }}</span>
          </div>
        </article>
      </section>

      <section class="grid gap-2" data-demo-subsection="tabs-size-shape">
        <div class="px-1"><h4 class="text-base font-semibold">Size 与 Shape</h4><p class="mt-1 text-xs leading-5 text-muted-foreground">28 / 36 / 40 / 44 表示 Trigger 的真实高度；默认是 40px，圆角默认使用 pill。</p></div>
        <article class="grid gap-5 rounded-2xl border bg-background p-4 sm:p-5">
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div v-for="size in sizes" :key="size" class="grid gap-3 rounded-xl border bg-card p-4">
              <code class="text-[10px] text-muted-foreground">size="{{ size }}"</code>
              <Tabs default-value="single">
                <TabsList variant="segment" :size="size">
                  <TabsTrigger value="single">单列</TabsTrigger>
                  <TabsTrigger value="grid">网格</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div v-for="shape in shapes" :key="shape" class="grid gap-4 rounded-xl border bg-card p-4">
              <code class="text-[10px] text-muted-foreground">shape="{{ shape }}"</code>
              <Tabs default-value="latest"><TabsList variant="tag" :shape="shape"><TabsTrigger value="latest">最新</TabsTrigger><TabsTrigger value="saved">已收藏</TabsTrigger></TabsList></Tabs>
              <Tabs default-value="preview"><TabsList variant="segment" :shape="shape"><TabsTrigger value="preview">预览</TabsTrigger><TabsTrigger value="source">源码</TabsTrigger></TabsList></Tabs>
            </div>
          </div>
        </article>
      </section>

      <section class="grid gap-2" data-demo-subsection="tabs-content-scroll">
        <div class="px-1"><h4 class="text-base font-semibold">内容组合与横向滚动</h4><p class="mt-1 text-xs leading-5 text-muted-foreground">Trigger 可以组合本地图标和徽标；窄容器中由 TabsList 自身承担横向滚动。</p></div>
        <article class="grid gap-4 rounded-2xl border bg-background p-4 sm:p-5 lg:grid-cols-2">
          <Tabs v-model="customValue" class="min-w-0 rounded-xl border bg-card p-4">
            <TabsList variant="tag" scrollable aria-label="自定义标签内容">
              <TabsTrigger value="create"><Icon name="askx-status:star" />创建<Badge variant="soft" class="ml-1">NEW</Badge></TabsTrigger>
              <TabsTrigger value="library"><Icon name="askx-objects:file" />资源库</TabsTrigger>
              <TabsTrigger value="history"><Icon name="askx-objects:schedule" />历史<Badge variant="secondary" class="ml-1">8</Badge></TabsTrigger>
            </TabsList>
            <TabsContent value="create" class="mt-4 rounded-xl bg-muted/45 p-5">从组合式内容开始创建新的本地资源。</TabsContent>
            <TabsContent value="library" class="mt-4 rounded-xl bg-muted/45 p-5">集中浏览已经接入工作台的资源。</TabsContent>
            <TabsContent value="history" class="mt-4 rounded-xl bg-muted/45 p-5">查看最近的操作与同步记录。</TabsContent>
          </Tabs>

          <div class="min-w-0 rounded-xl border bg-card p-4">
            <p class="mb-4 text-xs leading-5 text-muted-foreground">缩窄容器也不会压缩标签，触控板、滚轮横移与触摸拖动均可浏览。</p>
            <Tabs v-model="scrollableValue" class="min-w-0">
              <TabsList variant="line" scrollable aria-label="可横向滚动的标签">
                <TabsTrigger v-for="item in scrollableItems" :key="item.value" :value="item.value">{{ item.label }}</TabsTrigger>
              </TabsList>
              <TabsContent :value="scrollableValue" class="mt-4 font-mono text-[10px] text-muted-foreground">active: {{ scrollableValue }}</TabsContent>
            </Tabs>
          </div>
        </article>
      </section>
    </div>
  </DemoSection>
</template>
