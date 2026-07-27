<script setup lang="ts">
import { Blocks, Braces, Layers3 } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import DemoButton from './DemoButton.vue'
import DemoChoice from './DemoChoice.vue'
import DemoResponsiveOverlay from './DemoResponsiveOverlay.vue'
import DemoScrollArea from './DemoScrollArea.vue'
import DemoSelect from './DemoSelect.vue'

defineOptions({ name: 'DemoComponentsModule' })

const openSections = reactive({ button: true, choice: false, responsiveOverlay: false, scrollArea: false, select: false })
</script>

<template>
  <div class="grid gap-3 p-3 sm:p-5 lg:p-6">
    <article class="relative overflow-hidden rounded-2xl border bg-background p-6 sm:p-8">
      <div class="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-primary/12 blur-3xl" />
      <div class="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <Badge variant="soft"><Blocks />COMPONENTS / SHADCN</Badge>
          <h3 class="mt-6 max-w-4xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">基础组件统一在这里生长。</h3>
          <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">每个组件对应一个完整 Section，内部集中展示变体、尺寸、状态和组合方式。新增组件只需要接入当前模块，不会扩张侧栏层级。</p>
        </div>
        <div class="grid min-w-56 gap-2 rounded-xl border bg-card/80 p-4 font-mono text-[10px] text-muted-foreground">
          <span class="flex items-center gap-2"><Layers3 class="size-3.5 text-primary" />模块：基础组件</span>
          <span class="flex items-center gap-2"><Braces class="size-3.5 text-primary" />Section：Button / Choice / Select / ScrollArea / ResponsiveOverlay</span>
        </div>
      </div>
    </article>

    <DemoButton v-model="openSections.button" />
    <DemoChoice v-model="openSections.choice" />
    <DemoSelect v-model="openSections.select" />
    <DemoScrollArea v-model="openSections.scrollArea" />
    <DemoResponsiveOverlay v-model="openSections.responsiveOverlay" />
  </div>
</template>
