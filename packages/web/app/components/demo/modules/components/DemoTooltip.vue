<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoTooltip' })

/** Tooltip Demo 是否展开。 */
const isOpen = defineModel<boolean>({ default: false })

/** 四个基础浮层方向。 */
const placements = [
  { side: 'top', label: '顶部' },
  { side: 'right', label: '右侧' },
  { side: 'bottom', label: '底部' },
  { side: 'left', label: '左侧' },
] as const

/** Tooltip 基础调用示例。 */
const usageCode = `<TooltipProvider :delay-duration="150">
  <Tooltip>
    <TooltipTrigger as-child>
      <Button variant="outline">悬停或聚焦</Button>
    </TooltipTrigger>
    <TooltipContent side="top" :side-offset="8">
      查看组件说明
    </TooltipContent>
  </Tooltip>
</TooltipProvider>`
</script>

<template>
  <DemoSection
    v-model="isOpen"
    sec-key="components-tooltip"
    title="Tooltip 文字提示"
    description="保留 shadcn-vue 的交互、定位和动画，仅按 PG 规范统一气泡视觉。"
  >
    <TooltipProvider :delay-duration="150" :skip-delay-duration="100">
      <div class="grid gap-6 rounded-2xl border bg-background p-3 sm:p-5" data-testid="tooltip-demo">
        <article class="relative overflow-hidden rounded-2xl border bg-background p-6 sm:p-8">
          <div class="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-primary/12 blur-3xl" />
          <div class="relative">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="soft"><Icon name="askx-status:info" />SHADCN / PG STYLE</Badge>
              <code class="rounded-lg border bg-muted/50 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">components/ui/tooltip</code>
            </div>
            <h3 class="mt-6 max-w-4xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">提示应该靠近动作，也保持克制。</h3>
            <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">气泡采用 8px 圆角、8×6px 内边距和 14/20 的文字规格；Portal、碰撞检测、键盘聚焦与开合动画继续由 Reka UI 管理。</p>
          </div>
        </article>

        <section class="grid gap-2" data-demo-subsection="tooltip-placement">
          <div class="px-1">
            <h4 class="text-base font-semibold">方向与触发</h4>
            <p class="mt-1 text-xs leading-5 text-muted-foreground">悬停按钮或使用 Tab 聚焦，确认四个方向的箭头、间距和入场动画。</p>
          </div>
          <article class="grid min-h-56 place-items-center rounded-2xl border bg-card p-6">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tooltip v-for="placement in placements" :key="placement.side">
                <TooltipTrigger as-child>
                  <Button variant="outline" class="min-w-24">{{ placement.label }}</Button>
                </TooltipTrigger>
                <TooltipContent :side="placement.side" :side-offset="8">
                  {{ placement.label }} Tooltip
                </TooltipContent>
              </Tooltip>
            </div>
          </article>
        </section>

        <section class="grid gap-2" data-demo-subsection="tooltip-content">
          <div class="px-1">
            <h4 class="text-base font-semibold">内容边界</h4>
            <p class="mt-1 text-xs leading-5 text-muted-foreground">短提示保持紧凑，长文本在 320px 内自然换行，不改变官方 Tooltip API。</p>
          </div>
          <article class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5">
            <div class="flex flex-wrap gap-3">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button variant="secondary-subtle">短提示</Button>
                </TooltipTrigger>
                <TooltipContent side="top" :side-offset="8">复制配置</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button variant="secondary-subtle">长文本提示</Button>
                </TooltipTrigger>
                <TooltipContent side="top" :side-offset="8">切换主题后，当前工作台和 CLI 会继续共享同一份本地设置。</TooltipContent>
              </Tooltip>
              <Tooltip :delay-duration="600">
                <TooltipTrigger as-child>
                  <Button variant="secondary-subtle">延迟 600ms</Button>
                </TooltipTrigger>
                <TooltipContent side="top" :side-offset="8">延迟显示</TooltipContent>
              </Tooltip>
            </div>
            <DemoCopyButton :text="usageCode" label="复制 Tooltip 用法" copied-label="已复制" />
          </article>
        </section>
      </div>
    </TooltipProvider>
  </DemoSection>
</template>
