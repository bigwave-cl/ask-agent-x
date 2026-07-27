<script setup lang="ts">
import type { AskxIconName } from '@/lib/iconCatalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoIconUsage' })

const isOpen = defineModel<boolean>({ default: false })
const statusItems: Array<{ icon: AskxIconName, label: string, class: string }> = [
  { icon: 'askx-status:check', label: '同步完成', class: 'text-success' },
  { icon: 'askx-status:warning', label: '需要确认', class: 'text-warning' },
  { icon: 'askx-status:error', label: '操作失败', class: 'text-destructive' },
]
const staticUsage = '<Icon name="askx-actions:copy" class="size-4 text-muted-foreground" aria-hidden="true" />'
</script>

<template>
  <DemoSection
    v-model="isOpen"
    sec-key="icons-usage"
    title="Icon Usage"
    description="验证尺寸、currentColor、按钮、数据驱动名称和无障碍语义。"
  >
    <div class="grid gap-5 rounded-2xl border bg-background p-4 sm:p-6">
      <article class="grid gap-5 rounded-xl border bg-card p-4 sm:p-5">
        <header class="flex flex-wrap items-start justify-between gap-3">
          <div><Badge variant="soft"><Icon name="askx-objects:model" />STATIC NAME</Badge><h4 class="mt-4 text-xl font-semibold">尺寸由 CSS 控制，颜色来自 currentColor。</h4></div>
          <DemoCopyButton :text="staticUsage" label="复制静态用法" copied-label="已复制" />
        </header>
        <div class="flex flex-wrap items-end gap-6 rounded-lg bg-muted/45 p-5">
          <span v-for="size in [12, 16, 20, 24, 32]" :key="size" class="grid justify-items-center gap-2 text-muted-foreground">
            <Icon name="askx-objects:agent" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true" />
            <code class="font-mono text-[9px]">{{ size }}px</code>
          </span>
          <span class="ml-auto flex items-center gap-3 text-primary"><Icon name="askx-objects:palette" class="size-6" /><code class="font-mono text-[10px]">text-primary</code></span>
        </div>
      </article>

      <section class="grid gap-3 lg:grid-cols-3">
        <article class="grid content-start gap-4 rounded-xl border bg-card p-5">
          <h5 class="text-sm font-semibold">按钮内图标</h5>
          <div class="flex flex-wrap gap-2"><Button size="36"><Icon name="askx-actions:confirm" />保存</Button><Button variant="outlined" size="36"><Icon name="askx-actions:settings" />设置</Button><Button variant="ghost" size="icon" square aria-label="更多操作"><Icon name="askx-actions:more" /></Button></div>
          <p class="text-xs leading-5 text-muted-foreground">图标只辅助命令含义；纯图标按钮必须提供可读的 aria-label。</p>
        </article>
        <article class="grid content-start gap-4 rounded-xl border bg-card p-5">
          <h5 class="text-sm font-semibold">数据驱动名称</h5>
          <ul class="grid gap-2"><li v-for="item in statusItems" :key="item.icon" class="flex items-center gap-2 rounded-lg bg-muted/45 px-3 py-2 text-xs"><Icon :name="item.icon" class="size-4" :class="item.class" aria-hidden="true" />{{ item.label }}</li></ul>
          <p class="text-xs leading-5 text-muted-foreground">数据结构使用 AskxIconName，而不是 Vue Component。</p>
        </article>
        <article class="grid content-start gap-4 rounded-xl border bg-card p-5">
          <h5 class="text-sm font-semibold">加载与禁用</h5>
          <div class="flex flex-wrap gap-2"><Button variant="outlined" size="36" disabled><Icon name="askx-status:lock" />不可操作</Button><Button variant="soft" size="36"><Icon name="askx-status:loading" class="animate-spin" />处理中</Button></div>
          <p class="text-xs leading-5 text-muted-foreground">状态颜色只使用 success、warning、destructive 等 DS 语义 token。</p>
        </article>
      </section>

      <aside class="grid gap-3 rounded-xl border border-dashed bg-muted/30 p-4 sm:grid-cols-2">
        <div><strong class="text-xs">装饰图标</strong><code class="mt-2 block break-all font-mono text-[10px] text-muted-foreground">aria-hidden="true"</code></div>
        <div><strong class="text-xs">独立语义图标</strong><code class="mt-2 block break-all font-mono text-[10px] text-muted-foreground">aria-label="同步警告" role="img"</code></div>
      </aside>
    </div>
  </DemoSection>
</template>
