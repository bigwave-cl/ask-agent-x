<script setup lang="ts">
import type { DemoLocale } from '../../catalog'
import { Check, Moon, Palette, Sun } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const props = defineProps<{ locale: DemoLocale }>()

defineOptions({ name: 'DemoThemingModule' })
const appearance = ref<'light' | 'dark'>('light')
const themeColor = ref<'cyan' | 'rose'>('cyan')
let initialDark = false
let initialRose = false

const messages = {
  'zh-CN': {
    badge: 'SEMANTIC TOKEN MATRIX', title: '一套语义结构，两种主题色，两种明暗外观。', description: 'shadcn 组件只消费 background、foreground、primary、muted 等语义 token。切换主题时不修改业务模板。', appearance: '明暗外观', color: '主题色', light: '浅色', dark: '深色', cyan: '离子青', rose: '信号玫红', logoVariants: 'Logo 明暗版本 · 液态银蓝', logoVariantsHelp: 'Logo 使用独立品牌色；默认 auto 跟随页面明暗，局部容器也可以显式指定 light 或 dark。', lightLogo: '浅色界面 Logo', lightLogoHelp: '石墨银渐变底座搭配冰蓝 X，适合浅色表面。', darkLogo: '深色界面 Logo', darkLogoHelp: '亮银渐变底座搭配深蓝 X，适合暗色表面。', semantic: '语义颜色', semanticHelp: '以下色块直接读取 main.css 中的 CSS 变量。', surface: '表面', content: '正文', brand: '品牌', subtle: '次级', border: '边框', success: '成功', warning: '警告', danger: '危险', preview: '实时组件预览', previewTitle: '共享设置已同步', previewText: '主题切换只改变 token，组件结构与交互保持稳定。', action: '继续操作', status: '本地连接',
  },
  en: {
    badge: 'SEMANTIC TOKEN MATRIX', title: 'One semantic structure, two brand colors, two appearances.', description: 'shadcn components consume semantic tokens such as background, foreground, primary, and muted. Product templates remain unchanged when a theme switches.', appearance: 'Appearance', color: 'Theme color', light: 'Light', dark: 'Dark', cyan: 'Ion cyan', rose: 'Signal rose', logoVariants: 'Light and dark logos · Liquid silver blue', logoVariantsHelp: 'The logo uses its own brand palette. Auto follows page appearance; local surfaces can explicitly request light or dark.', lightLogo: 'Light-surface logo', lightLogoHelp: 'A graphite-silver gradient base with ice-blue X strokes for light surfaces.', darkLogo: 'Dark-surface logo', darkLogoHelp: 'A bright silver gradient base with deep-blue X strokes for dark surfaces.', semantic: 'Semantic colors', semanticHelp: 'Every swatch below reads a CSS variable from main.css directly.', surface: 'Surface', content: 'Content', brand: 'Brand', subtle: 'Muted', border: 'Border', success: 'Success', warning: 'Warning', danger: 'Danger', preview: 'Live component preview', previewTitle: 'Shared settings synchronized', previewText: 'Theme switching changes tokens only; component structure and interaction remain stable.', action: 'Continue', status: 'Local connection',
  },
} as const

const copy = computed(() => messages[props.locale])
const tokens = computed(() => [
  { label: copy.value.surface, variable: '--background', class: 'bg-background' },
  { label: copy.value.content, variable: '--foreground', class: 'bg-foreground' },
  { label: copy.value.brand, variable: '--primary', class: 'bg-primary' },
  { label: copy.value.subtle, variable: '--muted', class: 'bg-muted' },
  { label: copy.value.border, variable: '--border', class: 'bg-border' },
  { label: copy.value.success, variable: '--success', class: 'bg-success' },
  { label: copy.value.warning, variable: '--warning', class: 'bg-warning' },
  { label: copy.value.danger, variable: '--destructive', class: 'bg-destructive' },
])

function applyPreview() {
  if (!import.meta.client) return
  document.documentElement.classList.toggle('dark', appearance.value === 'dark')
  document.documentElement.classList.toggle('theme-rose', themeColor.value === 'rose')
  document.documentElement.classList.toggle('theme-cyan', themeColor.value === 'cyan')
}

function setAppearance(value: 'light' | 'dark') {
  appearance.value = value
  applyPreview()
}

function setThemeColor(value: 'cyan' | 'rose') {
  themeColor.value = value
  applyPreview()
}

onMounted(() => {
  initialDark = document.documentElement.classList.contains('dark')
  initialRose = document.documentElement.classList.contains('theme-rose')
  appearance.value = initialDark ? 'dark' : 'light'
  themeColor.value = initialRose ? 'rose' : 'cyan'
  applyPreview()
})

onBeforeUnmount(() => {
  document.documentElement.classList.toggle('dark', initialDark)
  document.documentElement.classList.toggle('theme-rose', initialRose)
  document.documentElement.classList.toggle('theme-cyan', !initialRose)
})
</script>

<template>
  <div class="grid gap-5 p-4 sm:p-6 lg:p-8">
    <article class="relative overflow-hidden rounded-2xl border bg-background p-6 sm:p-8">
      <div class="absolute right-0 top-0 h-full w-2 bg-primary" />
      <Badge variant="soft"><Palette />{{ copy.badge }}</Badge>
      <h3 class="mt-5 max-w-4xl text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">{{ copy.title }}</h3>
      <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">{{ copy.description }}</p>
    </article>

    <section class="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>{{ copy.color }}</CardTitle><CardDescription>html.theme-cyan / html.theme-rose</CardDescription></CardHeader>
        <CardContent class="grid grid-cols-2 gap-3">
          <button v-for="item in [{ id: 'cyan' as const, label: copy.cyan }, { id: 'rose' as const, label: copy.rose }]" :key="item.id" type="button" class="relative overflow-hidden rounded-xl border bg-background p-4 text-left transition hover:-translate-y-0.5" :class="themeColor === item.id ? 'border-primary ring-2 ring-primary/20' : ''" @click="setThemeColor(item.id)">
            <span class="mb-8 block h-16 rounded-lg" :class="item.id === 'cyan' ? 'bg-[#2fbdc7]' : 'bg-[#e7659f]'" /><strong class="text-xs">{{ item.label }}</strong><Check v-if="themeColor === item.id" class="absolute right-3 top-3 size-4 text-white" />
          </button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{{ copy.appearance }}</CardTitle><CardDescription>html.light / html.dark</CardDescription></CardHeader>
        <CardContent class="grid grid-cols-2 gap-3">
          <Button variant="outline" size="xl" class="h-28 flex-col" :class="appearance === 'light' ? 'border-primary bg-primary/8' : ''" @click="setAppearance('light')"><Sun class="size-5!" />{{ copy.light }}</Button>
          <Button variant="outline" size="xl" class="h-28 flex-col" :class="appearance === 'dark' ? 'border-primary bg-primary/8' : ''" @click="setAppearance('dark')"><Moon class="size-5!" />{{ copy.dark }}</Button>
        </CardContent>
      </Card>
    </section>

    <section>
      <div class="mb-3"><h4 class="text-base font-semibold">{{ copy.logoVariants }}</h4><p class="mt-1 text-xs text-muted-foreground">{{ copy.logoVariantsHelp }}</p></div>
      <div class="grid overflow-hidden rounded-2xl border md:grid-cols-2">
        <article class="grid min-h-56 content-center justify-items-center gap-5 bg-[#f5f6f8] p-7 text-center text-[#1b1c1c]">
          <BrandMark appearance="light" class="size-24" />
          <div><strong class="text-sm">{{ copy.lightLogo }}</strong><p class="mt-1 max-w-sm text-xs leading-5 text-[#606767]">{{ copy.lightLogoHelp }}</p><code class="mt-2 block text-[10px] text-[#4e777a]">appearance="light"</code></div>
        </article>
        <article class="grid min-h-56 content-center justify-items-center gap-5 bg-[#08090b] p-7 text-center text-white">
          <BrandMark appearance="dark" class="size-24" />
          <div><strong class="text-sm">{{ copy.darkLogo }}</strong><p class="mt-1 max-w-sm text-xs leading-5 text-[#9fa3a3]">{{ copy.darkLogoHelp }}</p><code class="mt-2 block text-[10px] text-[#8bd9de]">appearance="dark"</code></div>
        </article>
      </div>
    </section>

    <section>
      <div class="mb-3"><h4 class="text-base font-semibold">{{ copy.semantic }}</h4><p class="mt-1 text-xs text-muted-foreground">{{ copy.semanticHelp }}</p></div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <article v-for="token in tokens" :key="token.variable" class="rounded-xl border bg-background p-2.5"><span class="block h-20 rounded-lg border" :class="token.class" /><strong class="mt-3 block text-xs">{{ token.label }}</strong><code class="mt-1 block break-all text-[9px] text-muted-foreground">{{ token.variable }}</code></article>
      </div>
    </section>

    <Card class="relative overflow-hidden">
      <div class="absolute inset-y-0 left-0 w-1 bg-primary" />
      <CardHeader class="flex-row items-start justify-between gap-4"><div><Badge variant="secondary">{{ copy.preview }}</Badge><CardTitle class="mt-4">{{ copy.previewTitle }}</CardTitle><CardDescription class="mt-2">{{ copy.previewText }}</CardDescription></div><span class="mt-1 size-3 shrink-0 rounded-full bg-success shadow-[0_0_0_5px_var(--success-soft)]" /></CardHeader>
      <CardContent class="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted/55 p-4"><span class="font-mono text-[10px] text-muted-foreground">{{ copy.status }} · 127.0.0.1</span><Button>{{ copy.action }}</Button></CardContent>
    </Card>
  </div>
</template>
