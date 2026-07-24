<script setup lang="ts">
import { Braces, Check, ClipboardCopy, Layers3, MousePointerClick } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoUtilsModule' })

const openSections = reactive({ copyText: true })
const directCopyState = ref<'idle' | 'success' | 'error'>('idle')
const targetCopyState = ref<'idle' | 'success' | 'error'>('idle')
let directResetTimer: ReturnType<typeof setTimeout> | undefined
let targetResetTimer: ReturnType<typeof setTimeout> | undefined

const directCopyCode = `const isCopied = await useCopyText('bg-ds-brand-default')`
const targetCopyCode = `const handleCopy = async (event: MouseEvent) => {
  const isCopied = await useCopyText({
    text: 'pnpm askx ui token',
    el: event.currentTarget instanceof Element ? event.currentTarget : undefined,
  })
}`

function scheduleReset(kind: 'direct' | 'target') {
  if (kind === 'direct') {
    if (directResetTimer) clearTimeout(directResetTimer)
    directResetTimer = setTimeout(() => { directCopyState.value = 'idle' }, 1500)
    return
  }

  if (targetResetTimer) clearTimeout(targetResetTimer)
  targetResetTimer = setTimeout(() => { targetCopyState.value = 'idle' }, 1500)
}

async function copyDirectly() {
  const copied = await useCopyText('bg-ds-brand-default')
  directCopyState.value = copied ? 'success' : 'error'
  scheduleReset('direct')
}

async function copyFromTarget(event: MouseEvent) {
  const targetElement = event.currentTarget instanceof Element ? event.currentTarget : undefined
  const copied = await useCopyText({ text: 'pnpm askx ui token', el: targetElement })
  targetCopyState.value = copied ? 'success' : 'error'
  scheduleReset('target')
}

onBeforeUnmount(() => {
  if (directResetTimer) clearTimeout(directResetTimer)
  if (targetResetTimer) clearTimeout(targetResetTimer)
})
</script>

<template>
  <div class="grid gap-3 p-3 sm:p-5 lg:p-6">
    <article class="relative overflow-hidden rounded-2xl border bg-background p-6 sm:p-8">
      <div class="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-warning/12 blur-3xl" />
      <div class="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <Badge variant="soft"><Braces />UTILS / COMPOSABLES</Badge>
          <h3 class="mt-6 max-w-4xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">小工具负责消除重复。</h3>
          <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">通用能力保持输入输出明确，组件只消费结果并决定反馈形式。</p>
        </div>
        <div class="grid min-w-56 gap-2 rounded-xl border bg-card/80 p-4 font-mono text-[10px] text-muted-foreground">
          <span class="flex items-center gap-2"><Layers3 class="size-3.5 text-primary" />模块：Utils 工具集</span>
          <span class="flex items-center gap-2"><ClipboardCopy class="size-3.5 text-primary" />返回：Promise&lt;boolean&gt;</span>
        </div>
      </div>
    </article>

    <DemoSection
      v-model="openSections.copyText"
      title="useCopyText"
      description="统一文本复制、SSR 边界与 Dialog / Popover 内的容器选择。"
      sec-key="utils-copy-text"
    >
      <article class="grid gap-5 rounded-2xl border bg-background p-5 sm:p-7">
        <header class="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge variant="outline" class="font-mono"><ClipboardCopy />COMPOSABLE</Badge>
            <h4 class="mt-4 text-2xl font-semibold tracking-[-0.04em]">复制动作只有一个入口。</h4>
          </div>
          <code class="w-fit rounded-lg bg-muted px-3 py-2 font-mono text-[10px] text-muted-foreground">app/composables/useCopyText.ts</code>
        </header>

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="grid content-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h5 class="text-sm font-semibold">直接复制字符串</h5>
                <p class="mt-1 text-xs leading-5 text-muted-foreground">适合 Token 名称、命令和短源码。</p>
              </div>
              <Badge variant="secondary">string</Badge>
            </div>
            <code class="min-h-24 whitespace-pre-wrap rounded-lg bg-muted/65 p-3 font-mono text-xs leading-5 text-muted-foreground">{{ directCopyCode }}</code>
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs text-muted-foreground">目标：<code class="text-foreground">bg-ds-brand-default</code></span>
              <Button variant="outlined" size="36" @click="copyDirectly">
                <Check v-if="directCopyState === 'success'" />
                <ClipboardCopy v-else />
                {{ directCopyState === 'success' ? '已复制' : directCopyState === 'error' ? '复制失败' : '复制 Token' }}
              </Button>
            </div>
          </section>

          <section data-slot="popover-content" class="grid content-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h5 class="text-sm font-semibold">传入触发元素</h5>
                <p class="mt-1 text-xs leading-5 text-muted-foreground">用于 Dialog、Popover 或菜单内的复制动作。</p>
              </div>
              <Badge variant="secondary">text + el</Badge>
            </div>
            <code class="min-h-24 whitespace-pre-wrap rounded-lg bg-muted/65 p-3 font-mono text-xs leading-5 text-muted-foreground">{{ targetCopyCode }}</code>
            <div class="flex items-center justify-between gap-3">
              <span class="flex items-center gap-1.5 text-xs text-muted-foreground"><MousePointerClick class="size-3.5" />自动解析最近浮层</span>
              <Button variant="soft" size="36" @click="copyFromTarget">
                <Check v-if="targetCopyState === 'success'" />
                <ClipboardCopy v-else />
                {{ targetCopyState === 'success' ? '已复制' : targetCopyState === 'error' ? '复制失败' : '复制命令' }}
              </Button>
            </div>
          </section>
        </div>

        <div class="flex flex-col gap-3 rounded-xl bg-muted/45 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-xs leading-5 text-muted-foreground">DemoCopyButton 与工作台命令复制已经统一消费该 composable。</p>
          <DemoCopyButton :text="targetCopyCode" label="复制完整用法" copied-label="已复制" variant="ghost" />
        </div>
      </article>
    </DemoSection>
  </div>
</template>
