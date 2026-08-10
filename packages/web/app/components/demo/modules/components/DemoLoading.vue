<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoLoading' })

const isOpen = defineModel<boolean>({ default: false })
const localController = useAjaxLoader()
const loadingStore = useLoadingStore()
const directiveLoading = ref(false)
const configuredDirectiveLoading = ref(false)
const status = ref('等待操作')
const componentCode = '<CsInlineLoader size="32px" text="正在读取数据" color="var(--ds-color-success-default)" />'
const directiveCode = `<section v-inline-loader="loading" class="relative" />\n<section v-inline-loader="{ loading, size: '24px', text: '正在加载' }" />`
const storeCode = `const loadingStore = useLoadingStore()\nconst save = loadingStore.wrapPromiseWithLoader(async () => {\n  await $fetch('/api/example', { method: 'POST' })\n})`

/** 延迟指定毫秒，用于演示异步 Loading。 */
function delay(duration: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, duration))
}

/** 运行局部控制器示例。 */
async function runLocalRequest(): Promise<void> {
  status.value = '局部请求执行中'
  await localController.wrapPromiseWithLoader(() => delay(1200))()
  status.value = '局部请求已完成'
}

/** 切换指令示例并自动复原。 */
async function runDirective(configured = false): Promise<void> {
  const target = configured ? configuredDirectiveLoading : directiveLoading
  target.value = true
  status.value = configured ? '配置对象指令执行中' : '布尔指令执行中'
  await delay(1200)
  target.value = false
  status.value = '指令加载已完成'
}

/** 手动控制全屏 Loading。 */
async function runManualFullscreen(): Promise<void> {
  loadingStore.loader(true)
  status.value = '全屏 Loading 手动开启'
  await delay(1200)
  loadingStore.loader(false)
  status.value = '全屏 Loading 已关闭'
}

/** 使用包装函数控制全屏 Loading。 */
async function runWrappedFullscreen(): Promise<void> {
  status.value = '包装任务执行中'
  await loadingStore.wrapPromiseWithLoader(() => delay(1200))()
  status.value = '包装任务已完成'
}

/** 运行两个不同耗时的并发任务。 */
async function runConcurrentRequests(): Promise<void> {
  status.value = '两个并发任务执行中'
  const wrapped = loadingStore.wrapPromiseWithLoader(delay)
  await Promise.all([wrapped(700), wrapped(1600)])
  status.value = '两个并发任务均已完成'
}
</script>

<template>
  <DemoSection v-model="isOpen" sec-key="components-loading" title="Loading 加载" description="局部组件、指令、全屏 Store 与并发引用计数的完整示例。">
    <div class="grid gap-5 rounded-2xl border bg-background p-3 sm:p-5" data-testid="loading-demo">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h4 class="text-base font-semibold">局部与全屏加载体系</h4><p class="mt-1 text-xs leading-5 text-muted-foreground">全屏 Loading 仅由显式调用触发，普通请求不会被自动拦截。</p></div>
        <Badge variant="soft">useAjaxLoader / Pinia / Directive</Badge>
      </div>

      <section class="grid gap-3 lg:grid-cols-2">
        <article class="grid min-h-48 place-items-center rounded-xl border bg-card p-5">
          <div class="flex flex-wrap items-end justify-center gap-8">
            <div class="grid justify-items-center gap-2"><CsInlineLoader size="28px" /><span class="text-xs text-muted-foreground">三色方块 Loading</span></div>
            <CsInlineLoader size="38px" text="正在读取数据" color="var(--ds-color-success-default)" />
          </div>
        </article>
        <article v-inline-loader="localController.ajaxLoader.value" class="grid min-h-48 place-items-center rounded-xl border bg-card p-5">
          <div class="grid justify-items-center gap-3"><strong class="text-sm">局部异步请求</strong><Button size="40" :disabled="localController.ajaxLoader.value" @click="runLocalRequest">运行局部请求</Button></div>
        </article>
      </section>
      <div class="flex justify-end"><DemoCopyButton :text="componentCode" label="复制局部组件" copied-label="已复制" variant="outlined" /></div>

      <section class="grid gap-3 lg:grid-cols-2">
        <article v-inline-loader="directiveLoading" class="grid min-h-44 place-items-center rounded-xl border bg-muted/25 p-5"><Button size="40" variant="outlined" @click="runDirective(false)">布尔指令</Button></article>
        <article v-inline-loader="{ loading: configuredDirectiveLoading, size: '34px', text: '正在同步配置', color: 'var(--ds-color-status-warning)' }" class="grid min-h-44 place-items-center rounded-xl border bg-muted/25 p-5"><Button size="40" variant="outlined" @click="runDirective(true)">配置对象指令</Button></article>
      </section>
      <div class="flex justify-end"><DemoCopyButton :text="directiveCode" label="复制指令用法" copied-label="已复制" variant="outlined" /></div>

      <section class="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
        <div><strong class="text-sm">全屏 Loading</strong><p class="mt-1 text-xs text-muted-foreground">手动控制、自动包装以及两个并发请求共享同一个引用计数。</p></div>
        <div class="flex flex-wrap gap-2"><Button size="40" @click="runManualFullscreen">手动控制</Button><Button size="40" variant="secondary" @click="runWrappedFullscreen">自动包装</Button><Button size="40" variant="outlined" @click="runConcurrentRequests">并发请求</Button></div>
        <p class="rounded-lg bg-muted/45 px-3 py-2 font-mono text-[11px] text-muted-foreground" data-testid="loading-demo-status">状态：{{ status }} · 全屏 {{ loadingStore.ajaxLoader ? '开启' : '关闭' }}</p>
      </section>
      <div class="flex justify-end"><DemoCopyButton :text="storeCode" label="复制全屏用法" copied-label="已复制" variant="outlined" /></div>
    </div>
  </DemoSection>
</template>
