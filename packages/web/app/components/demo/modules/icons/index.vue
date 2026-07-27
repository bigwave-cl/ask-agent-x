<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import DemoBrandMark from './DemoBrandMark.vue'
import DemoIconGallery from './DemoIconGallery.vue'
import DemoIconGuidelines from './DemoIconGuidelines.vue'
import DemoIconUsage from './DemoIconUsage.vue'

defineOptions({ name: 'DemoIconsModule' })

/** Icon Demo 各 Section 的展开状态。 */
const openSections = reactive({ brand: true, gallery: true, usage: false, guidelines: false })
</script>

<template>
  <div class="grid gap-3 p-3 sm:p-5 lg:p-6">
    <article class="relative overflow-hidden rounded-2xl border bg-background p-6 sm:p-8">
      <div class="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <Badge variant="soft"><Icon name="askx-status:star" />LOCAL SVG / NUXT ICON</Badge>
          <h3 class="mt-6 max-w-4xl text-3xl font-semibold sm:text-5xl">图标应该轻量、可追踪，也能离线工作。</h3>
          <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">AskX 图标集分为四个语义集合。组件只消费稳定名称，颜色统一继承 currentColor，未命中的名称不会访问公网。</p>
        </div>
        <div class="grid min-w-56 gap-2 rounded-xl border bg-card/80 p-4 font-mono text-[10px] text-muted-foreground">
          <span class="flex items-center gap-2"><Icon name="askx-objects:layers" class="size-3.5 text-primary" />4 个本地集合</span>
          <span class="flex items-center gap-2"><Icon name="askx-objects:model" class="size-3.5 text-primary" />Catalog → SVG → Icon</span>
        </div>
      </div>
    </article>

    <DemoBrandMark v-model="openSections.brand" />
    <DemoIconGallery v-model="openSections.gallery" />
    <DemoIconUsage v-model="openSections.usage" />
    <DemoIconGuidelines v-model="openSections.guidelines" />
  </div>
</template>
