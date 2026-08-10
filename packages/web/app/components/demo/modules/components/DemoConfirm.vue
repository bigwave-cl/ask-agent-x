<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/composables/useConfirm'
import { defineComponent, h } from 'vue'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoConfirm' })
const isOpen = defineModel<boolean>({ default: false })
const status = ref('等待操作')
const componentContent = defineComponent({
  name: 'DemoConfirmComponentContent',
  setup: () => () => h('div', { class: 'rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary' }, '这是由 Component 渲染的内容区域。'),
})
const basicCode = `useConfirm({\n  title: '确认执行操作？',\n  desc: '请确认本次操作。',\n  cancelText: '取消',\n  okText: '确认执行',\n  onOk: async (done) => { await save(); done() },\n})`
const contentCode = `useConfirm({\n  desc: MyComponent,\n  descProps: { value },\n})`

function openBasic(): void {
  useConfirm({
    title: '确认执行操作？',
    desc: '这是一个由 useConfirm 动态挂载的 shadcn AlertDialog。',
    cancelText: '取消',
    okText: '确认执行',
    onOk: done => { status.value = '已确认'; done() },
    onCancel: () => { status.value = '已取消' },
  })
}

function openAsync(): void {
  useConfirm({
    title: '模拟异步失败',
    desc: '确认回调抛错时弹窗会保持打开，方便用户重试或取消。',
    okText: '执行并失败',
    onOk: async () => { status.value = '确认失败，弹窗保持打开'; throw new Error('demo failure') },
  })
}

function openSingleAction(): void {
  useConfirm({
    title: '只有一个操作',
    desc: 'hideCancel=true 适合必须明确确认的提示。',
    hideCancel: true,
    okText: '知道了',
    onOk: done => { status.value = '已了解'; done() },
  })
}

function openVNodeContent(): void {
  useConfirm({
    title: 'VNode 内容',
    desc: h('div', { class: 'rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground' }, '这是由 VNode 渲染的描述区域。'),
    okText: '关闭',
    hideCancel: true,
    onOk: done => done(),
  })
}

function openComponentContent(): void {
  useConfirm({
    title: 'Component 内容',
    desc: componentContent,
    descProps: { value: 'demo' },
    okText: '关闭',
    hideCancel: true,
    onOk: done => done(),
  })
}

function openStyleOptions(): void {
  useConfirm({
    title: '自定义参数',
    desc: '本例展示 showCloseIcon、按钮文案、variant 和自定义 class。',
    showCloseIcon: false,
    cancelText: '保留',
    okText: '删除',
    cancelVariant: 'outlined',
    okVariant: 'destructive',
    contentClass: 'border-destructive/30',
    onOk: done => { status.value = '已确认危险操作'; done() },
  })
}

function openCompactLayout(): void {
  useConfirm({
    title: '紧凑操作布局',
    desc: 'compact 是默认布局，按钮靠右并保持内容宽度。',
    actionLayout: 'compact',
    cancelText: '取消',
    okText: '确认',
    onOk: done => done(),
  })
}

function openEqualLayout(): void {
  useConfirm({
    title: '等宽操作布局',
    desc: 'equal 让取消和确认按钮在弹窗底部平分宽度。',
    actionLayout: 'equal',
    cancelText: '稍后处理',
    okText: '立即处理',
    onOk: done => done(),
  })
}
</script>

<template>
  <DemoSection v-model="isOpen" sec-key="components-confirm" title="Confirm 确认" description="统一展示 Confirm.vue、useConfirm 与 shadcn AlertDialog 的动态确认行为。">
    <div class="grid gap-4 rounded-2xl border bg-background p-4 sm:p-6" data-testid="confirm-demo">
      <div class="flex flex-wrap items-center justify-between gap-3"><div><h4 class="text-base font-semibold">动态挂载与异步状态</h4><p class="mt-1 text-xs leading-5 text-muted-foreground">确认成功会关闭；确认失败会保留弹窗；Esc 可取消。</p></div><Badge variant="soft">components/common/Confirm.vue</Badge></div>
      <div class="flex flex-wrap gap-2"><Button size="40" @click="openBasic">基础确认</Button><Button size="40" variant="outline" @click="openAsync">异步失败</Button><Button size="40" variant="secondary" @click="openSingleAction">隐藏取消</Button><Button size="40" variant="outlined" @click="openStyleOptions">样式参数</Button><Button size="40" variant="outlined" @click="openCompactLayout">紧凑布局</Button><Button size="40" variant="outlined" @click="openEqualLayout">等宽布局</Button><Button size="40" variant="outlined" @click="openVNodeContent">VNode 描述</Button><Button size="40" variant="outlined" @click="openComponentContent">Component 描述</Button></div>
      <p class="rounded-xl border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">最近状态：{{ status }}</p>
      <div class="grid gap-3 lg:grid-cols-2">
        <div class="grid gap-2"><div class="flex items-center justify-between"><strong class="text-xs">基础 + 异步参数</strong><DemoCopyButton :text="basicCode" label="复制用法" copied-label="已复制" /></div><pre class="overflow-x-auto rounded-xl bg-slate-950 p-4 text-[11px] leading-5 text-slate-100"><code>{{ basicCode }}</code></pre></div>
        <div class="grid gap-2"><div class="flex items-center justify-between"><strong class="text-xs">Component / VNode 内容</strong><DemoCopyButton :text="contentCode" label="复制用法" copied-label="已复制" /></div><pre class="overflow-x-auto rounded-xl bg-slate-950 p-4 text-[11px] leading-5 text-slate-100"><code>{{ contentCode }}</code></pre></div>
      </div>
    </div>
  </DemoSection>
</template>
