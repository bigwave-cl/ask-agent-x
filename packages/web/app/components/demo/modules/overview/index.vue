<script setup lang="ts">
import { ArrowRight, Blocks, Braces, Eye, FolderTree, ShieldCheck } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

defineOptions({ name: 'DemoOverviewModule' })

const localePath = useLocalePath()
</script>

<template>
  <div class="grid gap-5 p-4 sm:p-6 lg:p-8">
    <article class="relative isolate overflow-hidden rounded-2xl border bg-background p-6 sm:p-8 lg:p-10">
      <div class="pointer-events-none absolute -right-16 -top-24 -z-10 size-80 rounded-full bg-primary/15 blur-[70px]" />
      <div class="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,.65fr)] lg:items-end">
        <div>
          <Badge variant="soft"><Eye />零认证预览</Badge>
          <h3 class="mt-5 max-w-4xl text-3xl font-semibold leading-[1.05] tracking-[-0.055em] sm:text-5xl">把 UI 目录变成可以浏览的产品说明书。</h3>
          <p class="mt-5 max-w-3xl text-sm leading-6 text-muted-foreground">Demo 是组件的真实运行环境，也是设计验收、交互调试和 Agent 源码导航的共同入口。它不会复制组件，也不会建立第二套设计系统。</p>
          <div class="mt-7 flex flex-wrap gap-2">
            <Button as-child size="xl"><NuxtLink :to="{ path: localePath('/demo'), query: { module: 'button' } }">查看 Button<ArrowRight /></NuxtLink></Button>
            <Button as-child variant="outline" size="xl"><NuxtLink :to="{ path: localePath('/demo'), query: { module: 'theming' } }">主题规范<Braces /></NuxtLink></Button>
          </div>
        </div>
        <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-4 rounded-xl border bg-card/85 p-5 font-mono text-[11px]">
          <span class="text-primary">01</span><span>app/components/ui</span>
          <span class="text-primary">02</span><span>app/components/demo</span>
          <span class="text-primary">03</span><span>/demo?module=…</span>
          <span class="text-primary">04</span><span>公开 · 只读</span>
        </div>
      </div>
    </article>

    <section class="grid gap-4 md:grid-cols-3">
      <Card class="transition hover:-translate-y-1 hover:border-primary/30">
        <CardHeader><span class="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Blocks /></span><CardTitle class="mt-2">直接二次定义</CardTitle><CardDescription>shadcn 组件归项目所有。variant、size 和状态样式直接维护在 components/ui。</CardDescription></CardHeader>
      </Card>
      <Card class="transition hover:-translate-y-1 hover:border-primary/30">
        <CardHeader><span class="grid size-10 place-items-center rounded-xl bg-success-soft text-success"><ShieldCheck /></span><CardTitle class="mt-2">公开但隔离</CardTitle><CardDescription>/demo 无需 Token；它不调用设置 API，也看不到 ~/.askx/config.json。</CardDescription></CardHeader>
      </Card>
      <Card class="transition hover:-translate-y-1 hover:border-primary/30">
        <CardHeader><span class="grid size-10 place-items-center rounded-xl bg-warning-soft text-warning"><FolderTree /></span><CardTitle class="mt-2">查询参数驱动</CardTitle><CardDescription>每个 Demo 模块统一注册到 catalog，并通过唯一的 Demo 页面异步载入。</CardDescription></CardHeader>
      </Card>
    </section>

    <section class="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(17rem,.75fr)]">
      <Card>
        <CardHeader><CardTitle>唯一组件链路</CardTitle></CardHeader>
        <CardContent>
          <ol class="grid gap-2 sm:grid-cols-4">
            <li v-for="(label, index) in ['shadcn 源组件', '项目 variant', 'Demo 实例', '业务页面']" :key="label" class="relative rounded-xl border bg-background p-4">
              <span class="font-mono text-[10px] text-primary">0{{ index + 1 }}</span><strong class="mt-7 block text-xs">{{ label }}</strong><ArrowRight v-if="index < 3" class="absolute -right-4 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-primary sm:block" />
            </li>
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>实现约束</CardTitle></CardHeader>
        <CardContent><ul class="grid gap-3 text-xs text-muted-foreground"><li v-for="item in ['不新增 ui-ds 或 ds 目录', '示例必须使用真实 UI 组件', 'Demo 固定使用中文静态文案', '公开页不访问私有本地数据']" :key="item" class="flex gap-2"><span class="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />{{ item }}</li></ul></CardContent>
      </Card>
    </section>
  </div>
</template>
