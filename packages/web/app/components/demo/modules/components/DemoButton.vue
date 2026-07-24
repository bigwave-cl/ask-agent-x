<script setup lang="ts">
import type { ButtonVariants } from '@/components/ui/button'
import { ArrowRight, Check, Grid2X2, LoaderCircle, Sparkles, WandSparkles } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoButton' })

type DemoButtonVariant = NonNullable<ButtonVariants['variant']>

const openSections = reactive({ variants: true, sizes: false, icon: false, usage: false })
const loading = ref(false)

const variantRows: Array<{ variant: DemoButtonVariant, name: string, usage: string }> = [
  { variant: 'primary', name: 'Primary', usage: '页面主操作、提交与生成。' },
  { variant: 'secondary', name: 'Secondary', usage: '高强调的中性次级操作。' },
  { variant: 'tertiary', name: 'Tertiary', usage: '品牌相关的中强调入口。' },
  { variant: 'secondary-subtle', name: 'Secondary Subtle', usage: '工具栏与列表中的轻量操作。' },
  { variant: 'outlined', name: 'Outlined', usage: '需要明确边界的中性操作。' },
  { variant: 'ghost', name: 'Ghost', usage: '密集区域中的低强调命令。' },
  { variant: 'destructive', name: 'Destructive', usage: '删除、移除等不可逆操作。' },
]

const sizeExamples = [
  { size: '52' as const, code: '<Button size="52">52</Button>' },
  { size: '48' as const, code: '<Button size="48">48</Button>' },
  { size: '40' as const, code: '<Button size="40">40</Button>' },
  { size: '36' as const, code: '<Button size="36">36</Button>' },
]

function variantCode(variant: DemoButtonVariant, disabled = false) {
  return `<Button variant="${variant}"${disabled ? ' disabled' : ''}>${disabled ? 'Disabled' : 'Normal'}</Button>`
}

function runLoadingDemo() {
  if (loading.value) return
  loading.value = true
  setTimeout(() => { loading.value = false }, 1200)
}
</script>

<template>
  <div class="grid gap-3 p-3 sm:p-5 lg:p-6" data-testid="button-demo">
    <article class="relative overflow-hidden rounded-2xl border bg-background p-6 sm:p-8">
      <div class="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-primary/12 blur-3xl" />
      <div class="relative">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="soft"><Sparkles />SHADCN / CUSTOMIZED</Badge>
          <code class="rounded-lg border bg-muted/50 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">真实组件 · components/ui/button</code>
        </div>
        <h3 class="mt-6 max-w-4xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">Button 是第一块迁移标本。</h3>
        <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">参考目标项目的展示结构与风格，将能力直接落在 shadcn 的 Button 中，不增加 DS 包装目录。右侧锚点、折叠章节、深链接和代码复制也已经作为 Demo 的公共能力迁入。</p>
      </div>
    </article>

    <DemoSection v-model="openSections.variants" sec-key="button-variants" title="Variant 与交互状态" description="语义只由 variant 表达；将鼠标移入按钮即可检查真实 Hover，按下可检查 Active。">
      <article class="grid gap-3 rounded-2xl border bg-background p-3 sm:p-5" data-testid="button-variants-section">
        <div class="grid gap-2">
          <div
            v-for="row in variantRows"
            :key="row.variant"
            class="grid gap-4 rounded-xl border border-border/70 bg-card p-4 xl:grid-cols-[minmax(160px,.8fr)_minmax(0,1.5fr)_auto] xl:items-center"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2"><strong class="text-sm">{{ row.name }}</strong><code class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{{ row.variant }}</code></div>
              <p class="mt-1.5 text-xs leading-5 text-muted-foreground">{{ row.usage }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button :variant="row.variant" size="40">Normal</Button>
              <Button :variant="row.variant" size="40" disabled>Disabled</Button>
            </div>
            <div class="flex gap-1">
              <DemoCopyButton :text="variantCode(row.variant)" label="复制代码" copied-label="已复制" />
              <DemoCopyButton :text="variantCode(row.variant, true)" label="复制代码 · Disabled" copied-label="已复制" square />
            </div>
          </div>
        </div>
      </article>
    </DemoSection>

    <DemoSection v-model="openSections.sizes" sec-key="button-sizes-shapes" title="Size、Shape 与 Square" description="项目规格提供 52 / 48 / 40 / 36 四档尺寸，形状和 1:1 图标按钮不再写业务 class。">
      <article class="grid gap-4 rounded-2xl border bg-background p-4 sm:p-5" data-testid="button-sizes-section">
        <div class="flex flex-wrap items-center justify-between gap-3"><p class="text-xs text-muted-foreground">点击右侧复制按钮获取对应 Vue 用法。</p><Badge variant="outline" class="font-mono text-[10px]">默认：48 / regular</Badge></div>
        <div class="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
          <div v-for="example in sizeExamples" :key="example.size" class="flex min-h-24 items-center justify-between gap-2 rounded-xl bg-muted/35 p-3">
            <Button variant="primary" :size="example.size">{{ example.size }}</Button>
            <DemoCopyButton :text="example.code" label="复制代码" copied-label="已复制" square />
          </div>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <div class="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"><code class="mr-auto text-[11px] text-muted-foreground">shape</code><Button size="48">Regular</Button><Button size="48" shape="pill">Pill</Button></div>
          <div class="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"><code class="mr-auto text-[11px] text-muted-foreground">square</code><Button size="48" square aria-label="打开工具"><Grid2X2 /></Button><Button size="48" square shape="pill" aria-label="打开工具"><Grid2X2 /></Button></div>
        </div>
      </article>
    </DemoSection>

    <DemoSection v-model="openSections.icon" sec-key="button-icon-loading" title="Icon 与 Loading" description="图标继续使用默认插槽组合；加载态由业务控制，但尺寸、间距与禁用反馈由 Button 统一管理。">
      <article class="grid gap-4 rounded-2xl border bg-background p-4 sm:p-5" data-testid="button-loading-section">
        <div class="grid gap-3 md:grid-cols-2">
          <div class="flex min-h-36 flex-wrap items-center justify-center gap-3 rounded-xl border bg-card p-5">
            <Button variant="primary" size="48"><WandSparkles />生成内容<ArrowRight /></Button>
            <Button variant="tertiary" size="48" shape="pill"><Sparkles />生成内容</Button>
          </div>
          <div class="flex min-h-36 flex-col items-center justify-center gap-3 rounded-xl border bg-card p-5">
            <Button variant="primary" size="48" :disabled="loading" data-testid="button-loading-trigger" @click="runLoadingDemo">
              <LoaderCircle v-if="loading" class="animate-spin" /><Check v-else />{{ loading ? '正在生成' : '体验加载态' }}
            </Button>
            <span class="font-mono text-[10px] text-muted-foreground">{{ loading ? '正在生成' : '开始生成' }}</span>
          </div>
        </div>
        <div class="flex justify-end"><DemoCopyButton text='<Button :disabled="loading"><LoaderCircle v-if="loading" class="animate-spin" />Generate</Button>' label="复制代码" copied-label="已复制" variant="outlined" /></div>
      </article>
    </DemoSection>

    <DemoSection v-model="openSections.usage" sec-key="button-usage" title="使用方式与迁移边界" description="新风格直接从 components/ui/button 导入；已有 default、outline、soft 和旧尺寸继续兼容。">
      <article class="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-3 sm:p-5" data-testid="button-usage-section">
        <div v-for="item in [
          { index: '01', title: '直接扩展 shadcn', text: 'Button.vue 只负责属性透传，样式表仍集中在 buttonVariants；没有额外组件层。' },
          { index: '02', title: '渐进兼容', text: '原有 variant 和尺寸不会失效，可以按页面逐步迁移到新的语义规格。' },
          { index: '03', title: 'Demo 可深链接', text: '每个章节通过 secKey 定位，可分享、刷新并自动展开目标章节。' },
        ]" :key="item.index" class="rounded-xl border bg-card p-5">
          <span class="font-mono text-[10px] text-primary">{{ item.index }}</span><h4 class="mt-6 text-sm font-semibold">{{ item.title }}</h4><p class="mt-2 text-xs leading-5 text-muted-foreground">{{ item.text }}</p>
        </div>
      </article>
    </DemoSection>
  </div>
</template>
