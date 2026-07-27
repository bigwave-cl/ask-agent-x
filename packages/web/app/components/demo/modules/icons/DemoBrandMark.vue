<script setup lang="ts">
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoBrandMark' })

/** BrandMark Section 的展开状态。 */
const isOpen = defineModel<boolean>({ default: false })
/** Logo 尺寸预览列表。 */
const logoSizes = [24, 32, 48, 72] as const
/** 浅色 Logo 的标准调用代码。 */
const lightUsage = '<BrandMark appearance="light" class="size-12" />'
/** 深色 Logo 的标准调用代码。 */
const darkUsage = '<BrandMark appearance="dark" class="size-12" />'
</script>

<template>
  <DemoSection
    v-model="isOpen"
    sec-key="icons-brand-mark"
    title="Brand Logo"
    description="展示 AskAgent X 品牌标记的明暗版本、响应尺寸和组件调用方式。"
  >
    <div class="grid gap-5 border-t bg-background p-4 sm:p-6">
      <header class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p class="font-mono text-[10px] text-primary">BRAND ASSET / BRANDMARK</p>
          <h4 class="mt-3 text-2xl font-semibold">Logo 保持独立的品牌表达。</h4>
          <p class="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">Logo 使用 BrandMark 组件，不进入通用 Icon Catalog，也不通过 <code class="font-mono text-foreground">&lt;Icon&gt;</code> 调用。</p>
        </div>
        <code class="w-fit rounded-md border bg-muted/45 px-3 py-2 font-mono text-[10px] text-muted-foreground">BrandMark.vue</code>
      </header>

      <div class="grid gap-3 lg:grid-cols-2">
        <section class="grid min-h-52 grid-cols-[auto_minmax(0,1fr)] items-center gap-5 rounded-lg border bg-[#f7f9f9] p-5 text-[#101719]">
          <BrandMark appearance="light" class="size-24 shrink-0" />
          <div class="min-w-0">
            <strong class="text-sm">浅色界面</strong>
            <p class="mt-2 text-xs leading-5 text-[#606767]">深色底座与冰蓝路径，在明亮表面保持稳定对比。</p>
            <DemoCopyButton class="mt-4" :text="lightUsage" label="复制浅色用法" copied-label="已复制" />
          </div>
        </section>

        <section class="grid min-h-52 grid-cols-[auto_minmax(0,1fr)] items-center gap-5 rounded-lg border border-white/12 bg-[#101719] p-5 text-[#f7f9f9]">
          <BrandMark appearance="dark" class="size-24 shrink-0" />
          <div class="min-w-0">
            <strong class="text-sm">深色界面</strong>
            <p class="mt-2 text-xs leading-5 text-[#a7b0b1]">亮银底座与深蓝路径，在暗色表面保留清晰轮廓。</p>
            <DemoCopyButton class="mt-4 text-[#f7f9f9] hover:bg-white/10 hover:text-white" :text="darkUsage" label="复制深色用法" copied-label="已复制" />
          </div>
        </section>
      </div>

      <section class="grid gap-4 rounded-lg border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <strong class="text-sm">响应尺寸与自动外观</strong>
          <p class="mt-2 text-xs leading-5 text-muted-foreground"><code class="font-mono text-foreground">appearance="auto"</code> 跟随页面主题，尺寸由使用侧的 CSS 控制。</p>
        </div>
        <div class="flex flex-wrap items-end gap-5">
          <span v-for="size in logoSizes" :key="size" class="grid justify-items-center gap-2">
            <BrandMark :style="{ width: `${size}px`, height: `${size}px` }" />
            <code class="font-mono text-[9px] text-muted-foreground">{{ size }}px</code>
          </span>
        </div>
      </section>
    </div>
  </DemoSection>
</template>
