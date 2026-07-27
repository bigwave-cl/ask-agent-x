<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

defineOptions({ name: 'DemoThemingModule' })
const appearance = ref<'light' | 'dark'>('light')
const themeColor = ref<'cyan' | 'rose'>('cyan')
let initialDark = false
let initialRose = false

const tokens = [
  { label: '表面', variable: '--background', class: 'bg-background' },
  { label: '正文', variable: '--foreground', class: 'bg-foreground' },
  { label: '品牌', variable: '--primary', class: 'bg-primary' },
  { label: '次级', variable: '--muted', class: 'bg-muted' },
  { label: '边框', variable: '--border', class: 'bg-border' },
  { label: '成功', variable: '--success', class: 'bg-success' },
  { label: '警告', variable: '--warning', class: 'bg-warning' },
  { label: '危险', variable: '--destructive', class: 'bg-destructive' },
]

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
      <Badge variant="soft"><Icon name="askx-objects:palette" />SEMANTIC TOKEN MATRIX</Badge>
      <h3 class="mt-5 max-w-4xl text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">一套语义结构，两种主题色，两种明暗外观。</h3>
      <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">shadcn 组件只消费 background、foreground、primary、muted 等语义 token。切换主题时不修改业务模板。</p>
    </article>

    <section class="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>主题色</CardTitle><CardDescription>html.theme-cyan / html.theme-rose</CardDescription></CardHeader>
        <CardContent class="grid grid-cols-2 gap-3">
          <button v-for="item in [{ id: 'cyan' as const, label: '离子青' }, { id: 'rose' as const, label: '信号玫红' }]" :key="item.id" type="button" class="relative overflow-hidden rounded-xl border bg-background p-4 text-left transition hover:-translate-y-0.5" :class="themeColor === item.id ? 'border-primary ring-2 ring-primary/20' : ''" @click="setThemeColor(item.id)">
            <span class="mb-8 block h-16 rounded-lg" :class="item.id === 'cyan' ? 'bg-[#2fbdc7]' : 'bg-[#e7659f]'" /><strong class="text-xs">{{ item.label }}</strong><Icon name="askx-status:check" v-if="themeColor === item.id" class="absolute right-3 top-3 size-4 text-white" />
          </button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>明暗外观</CardTitle><CardDescription>html.light / html.dark</CardDescription></CardHeader>
        <CardContent class="grid grid-cols-2 gap-3">
          <Button variant="outline" size="xl" class="h-28 flex-col" :class="appearance === 'light' ? 'border-primary bg-primary/8' : ''" @click="setAppearance('light')"><Icon name="askx-objects:palette" class="size-5!" />浅色</Button>
          <Button variant="outline" size="xl" class="h-28 flex-col" :class="appearance === 'dark' ? 'border-primary bg-primary/8' : ''" @click="setAppearance('dark')"><Icon name="askx-objects:palette" class="size-5!" />深色</Button>
        </CardContent>
      </Card>
    </section>

    <section>
      <div class="mb-3"><h4 class="text-base font-semibold">Logo 明暗版本 · 液态银蓝</h4><p class="mt-1 text-xs text-muted-foreground">Logo 使用独立品牌色；默认 auto 跟随页面明暗，局部容器也可以显式指定 light 或 dark。</p></div>
      <div class="grid overflow-hidden rounded-2xl border md:grid-cols-2">
        <article class="grid min-h-56 content-center justify-items-center gap-5 bg-[#f5f6f8] p-7 text-center text-[#1b1c1c]">
          <BrandMark appearance="light" class="size-24" />
          <div><strong class="text-sm">浅色界面 Logo</strong><p class="mt-1 max-w-sm text-xs leading-5 text-[#606767]">石墨银渐变底座搭配冰蓝 X，适合浅色表面。</p><code class="mt-2 block text-[10px] text-[#4e777a]">appearance="light"</code></div>
        </article>
        <article class="grid min-h-56 content-center justify-items-center gap-5 bg-[#08090b] p-7 text-center text-white">
          <BrandMark appearance="dark" class="size-24" />
          <div><strong class="text-sm">深色界面 Logo</strong><p class="mt-1 max-w-sm text-xs leading-5 text-[#9fa3a3]">亮银渐变底座搭配深蓝 X，适合暗色表面。</p><code class="mt-2 block text-[10px] text-[#8bd9de]">appearance="dark"</code></div>
        </article>
      </div>
    </section>

    <section>
      <div class="mb-3"><h4 class="text-base font-semibold">语义颜色</h4><p class="mt-1 text-xs text-muted-foreground">以下色块直接读取 main.css 中的 CSS 变量。</p></div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <article v-for="token in tokens" :key="token.variable" class="rounded-xl border bg-background p-2.5"><span class="block h-20 rounded-lg border" :class="token.class" /><strong class="mt-3 block text-xs">{{ token.label }}</strong><code class="mt-1 block break-all text-[9px] text-muted-foreground">{{ token.variable }}</code></article>
      </div>
    </section>

    <Card class="relative overflow-hidden">
      <div class="absolute inset-y-0 left-0 w-1 bg-primary" />
      <CardHeader class="flex-row items-start justify-between gap-4"><div><Badge variant="secondary">实时组件预览</Badge><CardTitle class="mt-4">共享设置已同步</CardTitle><CardDescription class="mt-2">主题切换只改变 token，组件结构与交互保持稳定。</CardDescription></div><span class="mt-1 size-3 shrink-0 rounded-full bg-success shadow-[0_0_0_5px_var(--success-soft)]" /></CardHeader>
      <CardContent class="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted/55 p-4"><span class="font-mono text-[10px] text-muted-foreground">本地连接 · 127.0.0.1</span><Button>继续操作</Button></CardContent>
    </Card>
  </div>
</template>
