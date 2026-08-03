<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import DemoButton from './DemoButton.vue'
import DemoChoice from './DemoChoice.vue'
import DemoCodeEditor from './DemoCodeEditor.vue'
import DemoMdcRender from './DemoMdcRender.vue'
import DemoResponsiveOverlay from './DemoResponsiveOverlay.vue'
import DemoScrollArea from './DemoScrollArea.vue'
import DemoSelect from './DemoSelect.vue'
import DemoTabs from './DemoTabs.vue'
import DemoTooltip from './DemoTooltip.vue'

defineOptions({ name: 'DemoComponentsModule' })

/** 基础组件 Demo 各 Section 的展开状态。 */
const openSections = reactive({ button: true, choice: false, codeEditor: false, mdcRender: false, responsiveOverlay: false, scrollArea: false, select: false, tabs: false, tooltip: false })
</script>

<template>
  <div class="grid gap-3 p-3 sm:p-5 lg:p-6">
    <article class="relative overflow-hidden rounded-2xl border bg-background p-6 sm:p-8">
      <div class="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-primary/12 blur-3xl" />
      <div class="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <Badge variant="soft"><Icon name="askx-objects:layout" />COMPONENTS / SHADCN</Badge>
          <h3 class="mt-6 max-w-4xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">基础组件统一在这里生长。</h3>
          <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">每个组件对应一个完整 Section，内部集中展示变体、尺寸、状态和组合方式。新增组件只需要接入当前模块，不会扩张侧栏层级。</p>
        </div>
        <div class="grid min-w-56 gap-2 rounded-xl border bg-card/80 p-4 font-mono text-[10px] text-muted-foreground">
          <span class="flex items-center gap-2"><Icon name="askx-objects:layers" class="size-3.5 text-primary" />模块：基础组件</span>
          <span class="flex items-center gap-2"><Icon name="askx-objects:model" class="size-3.5 text-primary" />Section：Button / Choice / Select / Tabs / Tooltip / ScrollArea / CodeEditor / MDC / ResponsiveOverlay</span>
        </div>
      </div>
    </article>

    <DemoButton v-model="openSections.button" />
    <DemoChoice v-model="openSections.choice" />
    <DemoSelect v-model="openSections.select" />
    <DemoTabs v-model="openSections.tabs" />
    <DemoTooltip v-model="openSections.tooltip" />
    <DemoScrollArea v-model="openSections.scrollArea" />
    <DemoCodeEditor v-model="openSections.codeEditor" />
    <DemoMdcRender v-model="openSections.mdcRender" />
    <DemoResponsiveOverlay v-model="openSections.responsiveOverlay" />
  </div>
</template>
