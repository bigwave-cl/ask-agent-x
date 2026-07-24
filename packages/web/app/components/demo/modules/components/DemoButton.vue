<script setup lang="ts">
import type { ButtonVariants } from '@/components/ui/button'
import type { DemoLocale } from '../../catalog'
import { ArrowRight, Check, Grid2X2, LoaderCircle, Sparkles, WandSparkles } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoButton' })

const props = defineProps<{ locale: DemoLocale }>()
type DemoButtonVariant = NonNullable<ButtonVariants['variant']>

const openSections = reactive({ variants: true, sizes: false, icon: false, usage: false })
const loading = ref(false)

const messages = {
  'zh-CN': {
    badge: 'SHADCN / CUSTOMIZED',
    title: 'Button 是第一块迁移标本。',
    description: '参考目标项目的展示结构与风格，将能力直接落在 shadcn 的 Button 中，不增加 DS 包装目录。右侧锚点、折叠章节、深链接和代码复制也已经作为 Demo 的公共能力迁入。',
    file: '真实组件',
    variantsTitle: 'Variant 与交互状态',
    variantsDescription: '语义只由 variant 表达；将鼠标移入按钮即可检查真实 Hover，按下可检查 Active。',
    sizesTitle: 'Size、Shape 与 Square',
    sizesDescription: '项目规格提供 52 / 48 / 40 / 36 四档尺寸，形状和 1:1 图标按钮不再写业务 class。',
    iconTitle: 'Icon 与 Loading',
    iconDescription: '图标继续使用默认插槽组合；加载态由业务控制，但尺寸、间距与禁用反馈由 Button 统一管理。',
    usageTitle: '使用方式与迁移边界',
    usageDescription: '新风格直接从 components/ui/button 导入；已有 default、outline、soft 和旧尺寸继续兼容。',
    normal: 'Normal', disabled: 'Disabled', copy: '复制代码', copied: '已复制', defaultTag: '默认：48 / regular',
    sizeHint: '点击右侧复制按钮获取对应 Vue 用法。', regular: 'Regular', pill: 'Pill', generate: '生成内容', openTools: '打开工具',
    idle: '开始生成', working: '正在生成', completed: '生成完成', run: '体验加载态',
    directTitle: '直接扩展 shadcn', directText: 'Button.vue 只负责属性透传，样式表仍集中在 buttonVariants；没有额外组件层。',
    compatibleTitle: '渐进兼容', compatibleText: '原有 variant 和尺寸不会失效，可以按页面逐步迁移到新的语义规格。',
    deepLinkTitle: 'Demo 可深链接', deepLinkText: '每个章节通过 secKey 定位，可分享、刷新并自动展开目标章节。',
    primaryUse: '页面主操作、提交与生成。', secondaryUse: '高强调的中性次级操作。', tertiaryUse: '品牌相关的中强调入口。', subtleUse: '工具栏与列表中的轻量操作。', outlinedUse: '需要明确边界的中性操作。', ghostUse: '密集区域中的低强调命令。', destructiveUse: '删除、移除等不可逆操作。',
  },
  en: {
    badge: 'SHADCN / CUSTOMIZED',
    title: 'Button is the first migrated specimen.',
    description: 'The target project’s presentation structure and visual language are adapted directly into the shadcn Button, without adding a DS wrapper directory. Anchor navigation, collapsible sections, deep links, and code copying are now shared Demo capabilities.',
    file: 'Live component',
    variantsTitle: 'Variants and interaction states',
    variantsDescription: 'Variant expresses semantics only. Hover the buttons to inspect the real hover state and press to inspect active feedback.',
    sizesTitle: 'Size, shape, and square',
    sizesDescription: 'Project sizing adds 52 / 48 / 40 / 36. Shape and 1:1 icon buttons no longer require business-level classes.',
    iconTitle: 'Icon and loading',
    iconDescription: 'Icons remain slot compositions. Product logic controls loading while Button owns size, spacing, and disabled feedback.',
    usageTitle: 'Usage and migration boundary',
    usageDescription: 'Import the new styles directly from components/ui/button. Existing default, outline, soft, and legacy sizes remain compatible.',
    normal: 'Normal', disabled: 'Disabled', copy: 'Copy code', copied: 'Copied', defaultTag: 'Default: 48 / regular',
    sizeHint: 'Use the copy action to get the matching Vue snippet.', regular: 'Regular', pill: 'Pill', generate: 'Generate', openTools: 'Open tools',
    idle: 'Start generation', working: 'Generating', completed: 'Generation complete', run: 'Try loading state',
    directTitle: 'Direct shadcn extension', directText: 'Button.vue only forwards properties; styles stay centralized in buttonVariants with no extra component layer.',
    compatibleTitle: 'Progressive compatibility', compatibleText: 'Existing variants and sizes continue to work, so pages can migrate to the semantic spec incrementally.',
    deepLinkTitle: 'Deep-linkable Demo', deepLinkText: 'Each section is addressable by secKey and automatically expands after sharing or refreshing.',
    primaryUse: 'Primary page actions, submits, and generation.', secondaryUse: 'Strong, neutral secondary actions.', tertiaryUse: 'Medium-emphasis branded actions.', subtleUse: 'Lightweight toolbar and list actions.', outlinedUse: 'Neutral actions that need a clear boundary.', ghostUse: 'Low-emphasis commands in dense areas.', destructiveUse: 'Irreversible delete and remove actions.',
  },
} as const

const copy = computed(() => messages[props.locale])

const variantRows = computed<Array<{ variant: DemoButtonVariant, name: string, usage: string }>>(() => [
  { variant: 'primary', name: 'Primary', usage: copy.value.primaryUse },
  { variant: 'secondary', name: 'Secondary', usage: copy.value.secondaryUse },
  { variant: 'tertiary', name: 'Tertiary', usage: copy.value.tertiaryUse },
  { variant: 'secondary-subtle', name: 'Secondary Subtle', usage: copy.value.subtleUse },
  { variant: 'outlined', name: 'Outlined', usage: copy.value.outlinedUse },
  { variant: 'ghost', name: 'Ghost', usage: copy.value.ghostUse },
  { variant: 'destructive', name: 'Destructive', usage: copy.value.destructiveUse },
])

const sizeExamples = [
  { size: '52' as const, code: '<Button size="52">52</Button>' },
  { size: '48' as const, code: '<Button size="48">48</Button>' },
  { size: '40' as const, code: '<Button size="40">40</Button>' },
  { size: '36' as const, code: '<Button size="36">36</Button>' },
]

function variantCode(variant: DemoButtonVariant, disabled = false) {
  return `<Button variant="${variant}"${disabled ? ' disabled' : ''}>${disabled ? copy.value.disabled : copy.value.normal}</Button>`
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
          <Badge variant="soft"><Sparkles />{{ copy.badge }}</Badge>
          <code class="rounded-lg border bg-muted/50 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">{{ copy.file }} · components/ui/button</code>
        </div>
        <h3 class="mt-6 max-w-4xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">{{ copy.title }}</h3>
        <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">{{ copy.description }}</p>
      </div>
    </article>

    <DemoSection v-model="openSections.variants" sec-key="button-variants" :title="copy.variantsTitle" :description="copy.variantsDescription">
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
              <Button :variant="row.variant" size="40">{{ copy.normal }}</Button>
              <Button :variant="row.variant" size="40" disabled>{{ copy.disabled }}</Button>
            </div>
            <div class="flex gap-1">
              <DemoCopyButton :text="variantCode(row.variant)" :label="copy.copy" :copied-label="copy.copied" />
              <DemoCopyButton :text="variantCode(row.variant, true)" :label="`${copy.copy} · ${copy.disabled}`" :copied-label="copy.copied" square />
            </div>
          </div>
        </div>
      </article>
    </DemoSection>

    <DemoSection v-model="openSections.sizes" sec-key="button-sizes-shapes" :title="copy.sizesTitle" :description="copy.sizesDescription">
      <article class="grid gap-4 rounded-2xl border bg-background p-4 sm:p-5" data-testid="button-sizes-section">
        <div class="flex flex-wrap items-center justify-between gap-3"><p class="text-xs text-muted-foreground">{{ copy.sizeHint }}</p><Badge variant="outline" class="font-mono text-[10px]">{{ copy.defaultTag }}</Badge></div>
        <div class="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
          <div v-for="example in sizeExamples" :key="example.size" class="flex min-h-24 items-center justify-between gap-2 rounded-xl bg-muted/35 p-3">
            <Button variant="primary" :size="example.size">{{ example.size }}</Button>
            <DemoCopyButton :text="example.code" :label="copy.copy" :copied-label="copy.copied" square />
          </div>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <div class="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"><code class="mr-auto text-[11px] text-muted-foreground">shape</code><Button size="48">{{ copy.regular }}</Button><Button size="48" shape="pill">{{ copy.pill }}</Button></div>
          <div class="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"><code class="mr-auto text-[11px] text-muted-foreground">square</code><Button size="48" square :aria-label="copy.openTools"><Grid2X2 /></Button><Button size="48" square shape="pill" :aria-label="copy.openTools"><Grid2X2 /></Button></div>
        </div>
      </article>
    </DemoSection>

    <DemoSection v-model="openSections.icon" sec-key="button-icon-loading" :title="copy.iconTitle" :description="copy.iconDescription">
      <article class="grid gap-4 rounded-2xl border bg-background p-4 sm:p-5" data-testid="button-loading-section">
        <div class="grid gap-3 md:grid-cols-2">
          <div class="flex min-h-36 flex-wrap items-center justify-center gap-3 rounded-xl border bg-card p-5">
            <Button variant="primary" size="48"><WandSparkles />{{ copy.generate }}<ArrowRight /></Button>
            <Button variant="tertiary" size="48" shape="pill"><Sparkles />{{ copy.generate }}</Button>
          </div>
          <div class="flex min-h-36 flex-col items-center justify-center gap-3 rounded-xl border bg-card p-5">
            <Button variant="primary" size="48" :disabled="loading" data-testid="button-loading-trigger" @click="runLoadingDemo">
              <LoaderCircle v-if="loading" class="animate-spin" /><Check v-else />{{ loading ? copy.working : copy.run }}
            </Button>
            <span class="font-mono text-[10px] text-muted-foreground">{{ loading ? copy.working : copy.idle }}</span>
          </div>
        </div>
        <div class="flex justify-end"><DemoCopyButton text='<Button :disabled="loading"><LoaderCircle v-if="loading" class="animate-spin" />Generate</Button>' :label="copy.copy" :copied-label="copy.copied" variant="outlined" /></div>
      </article>
    </DemoSection>

    <DemoSection v-model="openSections.usage" sec-key="button-usage" :title="copy.usageTitle" :description="copy.usageDescription">
      <article class="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-3 sm:p-5" data-testid="button-usage-section">
        <div v-for="item in [
          { index: '01', title: copy.directTitle, text: copy.directText },
          { index: '02', title: copy.compatibleTitle, text: copy.compatibleText },
          { index: '03', title: copy.deepLinkTitle, text: copy.deepLinkText },
        ]" :key="item.index" class="rounded-xl border bg-card p-5">
          <span class="font-mono text-[10px] text-primary">{{ item.index }}</span><h4 class="mt-6 text-sm font-semibold">{{ item.title }}</h4><p class="mt-2 text-xs leading-5 text-muted-foreground">{{ item.text }}</p>
        </div>
      </article>
    </DemoSection>
  </div>
</template>
