<script setup lang="ts">
import { ArrowDown, ArrowRight, Layers3, MousePointer2, Sparkles } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoScrollArea' })

const isOpen = defineModel<boolean>({ default: false })

const verticalItems = [
  { title: '默认轨道', description: '视觉滑块使用 5% 黑白透明填充，适配浅色与深色主题。' },
  { title: '悬停反馈', description: '指针移入 9px 命中区后，滑块提升到 10% 透明填充。' },
  { title: '键盘滚动', description: 'Viewport 保留焦点语义，可使用方向键和 Page Up / Down。' },
  { title: '触控惯性', description: '移动端继续使用原生滚动与 momentum scrolling。' },
  { title: '服务端渲染', description: '项目使用 Vue 3.5，内容与结构直接参与 SSR，不依赖 ClientOnly 占位。' },
  { title: '主题同步', description: '轨道颜色读取 DS token，切换主题无需业务组件覆写。' },
]

const horizontalItems = ['Skills', 'Prompts', 'Agents', 'Themes', 'Settings', 'Backups']

const verticalCode = `<ScrollArea class="h-64 rounded-xl border bg-muted/35" type="always">
  <div class="grid gap-2 p-3">...</div>
</ScrollArea>`

const horizontalCode = `<ScrollArea orientation="horizontal" class="h-48 rounded-xl border">
  <div class="flex w-max gap-3 p-3">...</div>
</ScrollArea>`
</script>

<template>
  <DemoSection
    v-model="isOpen"
    sec-key="components-scroll-area"
    title="ScrollArea 滚动区域"
    description="沿用 shadcn-vue 的 ScrollArea 结构，统一纵向、横向、触控与键盘滚动。"
  >
    <div class="grid gap-6 rounded-2xl border bg-background p-3 sm:p-5" data-testid="scroll-area-demo">
      <article class="relative overflow-hidden rounded-2xl border bg-background p-6 sm:p-8">
        <div class="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-primary/12 blur-3xl" />
        <div class="relative">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="soft"><Sparkles />REKA / SHADCN</Badge>
            <code class="rounded-lg border bg-muted/50 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">components/ui/scroll-area</code>
          </div>
          <h3 class="mt-6 max-w-4xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">滚动应该被感知，而不是被打扰。</h3>
          <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">组件结构与 API 以 shadcn-vue 为准，9px 透明命中区包裹 4px 视觉滑块，颜色沿用 DS 的透明填充 token。</p>
        </div>
      </article>

      <section class="grid gap-3 lg:grid-cols-2" data-demo-subsection="scroll-area-directions">
        <article class="grid content-start gap-4 rounded-2xl border bg-card p-4 sm:p-5">
          <div class="flex items-start justify-between gap-3">
            <div><h4 class="flex items-center gap-2 text-sm font-semibold"><ArrowDown class="size-4 text-primary" />纵向滚动</h4><p class="mt-1.5 text-xs leading-5 text-muted-foreground">`always` 用于持续展示规范效果；内容不足时滑块自动隐藏。</p></div>
            <DemoCopyButton :text="verticalCode" label="复制纵向用法" copied-label="已复制" square />
          </div>
          <ScrollArea class="h-64 rounded-xl border bg-muted/35" type="always" aria-label="纵向滚动示例">
            <div class="grid gap-2 p-3 pr-4">
              <div v-for="item in verticalItems" :key="item.title" class="rounded-lg border bg-background p-3">
                <strong class="text-[13px]">{{ item.title }}</strong>
                <p class="mt-1 text-xs leading-5 text-muted-foreground">{{ item.description }}</p>
              </div>
            </div>
          </ScrollArea>
        </article>

        <article class="grid content-start gap-4 rounded-2xl border bg-card p-4 sm:p-5">
          <div class="flex items-start justify-between gap-3">
            <div><h4 class="flex items-center gap-2 text-sm font-semibold"><ArrowRight class="size-4 text-primary" />横向滚动</h4><p class="mt-1.5 text-xs leading-5 text-muted-foreground">内容保持自然宽度，滚轮、触控板和拖动轨道共用同一 viewport。</p></div>
            <DemoCopyButton :text="horizontalCode" label="复制横向用法" copied-label="已复制" square />
          </div>
          <ScrollArea orientation="horizontal" class="h-64 rounded-xl border bg-muted/35" type="always" aria-label="横向滚动示例">
            <div class="flex w-max gap-3 p-3 pb-4">
              <div v-for="(item, index) in horizontalItems" :key="item" class="flex h-[220px] w-44 flex-col justify-between rounded-xl border bg-background p-4">
                <span class="grid size-9 place-items-center rounded-lg bg-primary/10 font-mono text-xs text-primary">0{{ index + 1 }}</span>
                <div><strong class="text-sm">{{ item }}</strong><p class="mt-2 text-xs leading-5 text-muted-foreground">保持内容宽度，并由 ScrollArea 统一承载横向交互。</p></div>
              </div>
            </div>
          </ScrollArea>
        </article>
      </section>

      <section class="grid gap-3 sm:grid-cols-3" data-demo-subsection="scroll-area-contract">
        <article v-for="item in [
          { icon: MousePointer2, title: '透明命中区', text: '9px 可操作区域保留容错，视觉滑块仅 4px。' },
          { icon: Layers3, title: '语义 Token', text: '默认和 Hover 分别使用 fill-bw-transparent-5/10。' },
          { icon: Sparkles, title: 'SSR 稳定', text: '服务端与客户端使用相同结构，不制造内容闪烁。' },
        ]" :key="item.title" class="rounded-xl border bg-card p-5">
          <component :is="item.icon" class="size-4 text-primary" />
          <h4 class="mt-5 text-sm font-semibold">{{ item.title }}</h4>
          <p class="mt-2 text-xs leading-5 text-muted-foreground">{{ item.text }}</p>
        </article>
      </section>
    </div>
  </DemoSection>
</template>
