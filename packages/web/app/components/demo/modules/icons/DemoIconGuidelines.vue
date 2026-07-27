<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoIconGuidelines' })

/** Guidelines Section 的展开状态。 */
const isOpen = defineModel<boolean>({ default: false })
</script>

<template>
  <DemoSection
    v-model="isOpen"
    sec-key="icons-guidelines"
    title="Icon Guidelines"
    description="统一命名、目录、离线失败行为和 Lucide 使用边界。"
  >
    <div class="grid gap-5 rounded-2xl border bg-background p-4 sm:p-6">
      <section class="grid gap-3 md:grid-cols-2">
        <article class="rounded-xl border bg-card p-5"><Badge variant="secondary"><Icon name="askx-status:check" />允许</Badge><ul class="mt-4 grid gap-2 text-xs leading-5 text-muted-foreground"><li>使用 kebab-case 语义名称。</li><li>从 actions、navigation、status、objects 中选择分类。</li><li>新增 SVG 时同步维护唯一 Catalog。</li><li>通过 currentColor 和 DS token 控制颜色。</li></ul></article>
        <article class="rounded-xl border bg-card p-5"><Badge variant="destructive"><Icon name="askx-actions:close" />禁止</Badge><ul class="mt-4 grid gap-2 text-xs leading-5 text-muted-foreground"><li>业务组件直接导入 @lucide/vue。</li><li>绕过 Catalog 使用未登记名称。</li><li>在 SVG 中保留固定宽高或固定前景色。</li><li>缺失图标时回退到 Iconify 公网。</li></ul></article>
      </section>

      <article class="grid gap-4 rounded-xl border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div><Badge variant="outline" class="font-mono"><Icon name="askx-status:error" />OFFLINE FAILURE</Badge><h4 class="mt-4 text-lg font-semibold">不存在的名称会在本地失败。</h4><p class="mt-2 text-xs leading-5 text-muted-foreground">例如 <code class="font-mono text-foreground">askx-status:not-found</code> 不在 Catalog 和本地集合中。组件不会请求 Iconify API，也不会悄悄替换成 Lucide。</p></div>
        <div class="grid place-items-center rounded-lg border border-dashed bg-muted/35 p-5 text-center"><span class="grid size-11 place-items-center rounded-lg border bg-background text-destructive"><Icon name="askx-status:error" class="size-5" /></span><code class="mt-3 font-mono text-[10px] text-muted-foreground">local miss · no fallback</code></div>
      </article>

      <section class="grid gap-3 rounded-xl border bg-card p-5">
        <div><h4 class="text-sm font-semibold">维护当前图标集</h4><p class="mt-1 text-xs text-muted-foreground">图标文件与 Catalog 必须一一对应，测试会同时检查缺失登记和无文件记录。</p></div>
        <ol class="grid gap-3 text-xs leading-5 text-muted-foreground sm:grid-cols-3">
          <li class="rounded-lg bg-muted/45 p-3"><strong class="block text-foreground">01 选择分类</strong>按操作、导航、状态或对象放入对应目录。</li>
          <li class="rounded-lg bg-muted/45 p-3"><strong class="block text-foreground">02 登记名称</strong>在 Catalog 中添加同名的 askx-* 图标名称。</li>
          <li class="rounded-lg bg-muted/45 p-3"><strong class="block text-foreground">03 验证资源</strong>确认 SVG 可缩放、继承 currentColor 且不包含外部内容。</li>
        </ol>
      </section>
    </div>
  </DemoSection>
</template>
