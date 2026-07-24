<script setup lang="ts">
import type { DemoLocale } from '../../catalog'
import { ArrowRight, Blocks, Braces, Eye, FolderTree, ShieldCheck } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const props = defineProps<{ locale: DemoLocale }>()

defineOptions({ name: 'DemoOverviewModule' })

const messages = {
  'zh-CN': {
    badge: '零认证预览', title: '把 UI 目录变成可以浏览的产品说明书。', description: 'Demo 是组件的真实运行环境，也是设计验收、交互调试和 Agent 源码导航的共同入口。它不会复制组件，也不会建立第二套设计系统。',
    open: '查看 Button', source: '主题规范', directTitle: '直接二次定义', directText: 'shadcn 组件归项目所有。variant、size 和状态样式直接维护在 components/ui。', publicTitle: '公开但隔离', publicText: '/demo 无需 Token；它不调用设置 API，也看不到 ~/.askx/config.json。', catalogTitle: '路由驱动', catalogText: '每个 Demo 拥有独立页面路由、组件文件和源码入口，便于继续扩展。',
    flowTitle: '唯一组件链路', sourceLabel: 'shadcn 源组件', variantLabel: '项目 variant', demoLabel: 'Demo 实例', productLabel: '业务页面', principles: '实现约束', p1: '不新增 ui-ds 或 ds 目录', p2: '示例必须使用真实 UI 组件', p3: '用户文案保持中英文', p4: '公开页不访问私有本地数据',
  },
  en: {
    badge: 'ZERO-AUTH PREVIEW', title: 'Turn the UI directory into a browsable product manual.', description: 'The demo is a real runtime for components and a shared entry point for design review, interaction debugging, and agent source navigation. It copies nothing and creates no second design system.',
    open: 'Explore Button', source: 'Theming guide', directTitle: 'Customize in place', directText: 'The shadcn components belong to the project. Variants, sizes, and states live directly in components/ui.', publicTitle: 'Public, yet isolated', publicText: '/demo needs no token; it never calls settings APIs or reads ~/.askx/config.json.', catalogTitle: 'Route driven', catalogText: 'Every demo owns a page route, component file, and source entry for straightforward expansion.',
    flowTitle: 'One component pipeline', sourceLabel: 'shadcn source', variantLabel: 'project variant', demoLabel: 'demo specimen', productLabel: 'product view', principles: 'Implementation rules', p1: 'No ui-ds or ds directory', p2: 'Examples use real UI primitives', p3: 'User copy remains bilingual', p4: 'Public pages never access private local data',
  },
} as const

const copy = computed(() => messages[props.locale])
</script>

<template>
  <div class="grid gap-5 p-4 sm:p-6 lg:p-8">
    <article class="relative isolate overflow-hidden rounded-2xl border bg-background p-6 sm:p-8 lg:p-10">
      <div class="pointer-events-none absolute -right-16 -top-24 -z-10 size-80 rounded-full bg-primary/15 blur-[70px]" />
      <div class="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,.65fr)] lg:items-end">
        <div>
          <Badge variant="soft"><Eye />{{ copy.badge }}</Badge>
          <h3 class="mt-5 max-w-4xl text-3xl font-semibold leading-[1.05] tracking-[-0.055em] sm:text-5xl">{{ copy.title }}</h3>
          <p class="mt-5 max-w-3xl text-sm leading-6 text-muted-foreground">{{ copy.description }}</p>
          <div class="mt-7 flex flex-wrap gap-2">
            <Button as-child size="xl"><NuxtLink to="/demo?module=button">{{ copy.open }}<ArrowRight /></NuxtLink></Button>
            <Button as-child variant="outline" size="xl"><NuxtLink to="/demo?module=theming">{{ copy.source }}<Braces /></NuxtLink></Button>
          </div>
        </div>
        <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-4 rounded-xl border bg-card/85 p-5 font-mono text-[11px]">
          <span class="text-primary">01</span><span>app/components/ui</span>
          <span class="text-primary">02</span><span>app/components/demo</span>
          <span class="text-primary">03</span><span>/demo/:page</span>
          <span class="text-primary">04</span><span>public · read-only</span>
        </div>
      </div>
    </article>

    <section class="grid gap-4 md:grid-cols-3">
      <Card class="transition hover:-translate-y-1 hover:border-primary/30">
        <CardHeader><span class="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Blocks /></span><CardTitle class="mt-2">{{ copy.directTitle }}</CardTitle><CardDescription>{{ copy.directText }}</CardDescription></CardHeader>
      </Card>
      <Card class="transition hover:-translate-y-1 hover:border-primary/30">
        <CardHeader><span class="grid size-10 place-items-center rounded-xl bg-success-soft text-success"><ShieldCheck /></span><CardTitle class="mt-2">{{ copy.publicTitle }}</CardTitle><CardDescription>{{ copy.publicText }}</CardDescription></CardHeader>
      </Card>
      <Card class="transition hover:-translate-y-1 hover:border-primary/30">
        <CardHeader><span class="grid size-10 place-items-center rounded-xl bg-warning-soft text-warning"><FolderTree /></span><CardTitle class="mt-2">{{ copy.catalogTitle }}</CardTitle><CardDescription>{{ copy.catalogText }}</CardDescription></CardHeader>
      </Card>
    </section>

    <section class="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(17rem,.75fr)]">
      <Card>
        <CardHeader><CardTitle>{{ copy.flowTitle }}</CardTitle></CardHeader>
        <CardContent>
          <ol class="grid gap-2 sm:grid-cols-4">
            <li v-for="(label, index) in [copy.sourceLabel, copy.variantLabel, copy.demoLabel, copy.productLabel]" :key="label" class="relative rounded-xl border bg-background p-4">
              <span class="font-mono text-[10px] text-primary">0{{ index + 1 }}</span><strong class="mt-7 block text-xs">{{ label }}</strong><ArrowRight v-if="index < 3" class="absolute -right-4 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-primary sm:block" />
            </li>
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{{ copy.principles }}</CardTitle></CardHeader>
        <CardContent><ul class="grid gap-3 text-xs text-muted-foreground"><li v-for="item in [copy.p1, copy.p2, copy.p3, copy.p4]" :key="item" class="flex gap-2"><span class="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />{{ item }}</li></ul></CardContent>
      </Card>
    </section>
  </div>
</template>
