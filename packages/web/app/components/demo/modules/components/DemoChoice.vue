<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoChoice' })

const isOpen = defineModel<boolean>({ default: false })
const selectedMode = ref('balanced')
const selectedTargets = ref(['codex', 'cursor'])
const notifications = ref(true)
const indeterminate = ref<boolean | 'indeterminate'>('indeterminate')

const targetOptions = [
  { value: 'codex', label: 'ChatGPT / Codex', description: '同步到 ChatGPT / Codex Skills 目录' },
  { value: 'claude', label: 'Claude Code', description: '同步到 Claude Code 配置' },
  { value: 'cursor', label: 'Cursor', description: '同步到 Cursor Rules 目录' },
]

function isTargetSelected(value: string) {
  return selectedTargets.value.includes(value)
}

function updateTarget(value: string, checked: boolean | 'indeterminate') {
  const next = new Set(selectedTargets.value)
  if (checked === true) next.add(value)
  else next.delete(value)
  selectedTargets.value = [...next]
}
</script>

<template>
  <DemoSection v-model="isOpen" sec-key="components-choice" title="Radio / Checkbox 单选多选" description="完整查看单选、多选、半选、禁用与校验状态。">
    <div class="grid gap-6 rounded-2xl border bg-background p-3 sm:p-5" data-testid="choice-demo">
    <article class="relative overflow-hidden rounded-2xl border bg-background p-6 sm:p-8">
      <div class="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-primary/12 blur-3xl" />
      <div class="relative">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="soft"><Icon name="askx-status:star" />SHADCN / CUSTOMIZED</Badge>
          <code class="rounded-lg border bg-muted/50 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">checkbox · radio-group</code>
        </div>
        <h3 class="mt-6 max-w-4xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">选择应该清楚，也应该轻盈。</h3>
        <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">单选与多选沿用 Reka 的键盘操作和表单语义，视觉层直接在 shadcn 基础组件中统一。18px 控件配合更大的点击热区，适合设置页和密集列表。</p>
      </div>
    </article>

    <section class="grid gap-2" data-demo-subsection="choice-radio">
      <div class="px-1"><h4 class="text-base font-semibold">Radio 单选</h4><p class="mt-1 text-xs leading-5 text-muted-foreground">用于互斥选项；方向键可在选项之间移动，点击文字也能完成选择。</p></div>
      <article class="grid gap-4 rounded-2xl border bg-background p-4 sm:p-5" data-testid="radio-section">
        <div class="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <RadioGroup v-model="selectedMode" aria-label="同步策略" class="gap-2">
            <label v-for="option in [
              { value: 'fast', label: '快速同步', description: '跳过非必要检查，适合本地草稿。' },
              { value: 'balanced', label: '平衡模式', description: '执行标准检查并保留回滚记录。' },
              { value: 'strict', label: '严格模式', description: '应用前完成全部安全验证。' },
            ]" :key="option.value" class="group flex cursor-pointer items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/45 has-[[data-state=checked]]:border-primary/25 has-[[data-state=checked]]:bg-primary/7">
              <RadioGroupItem :id="`mode-${option.value}`" :value="option.value" class="mt-0.5" />
              <span class="min-w-0"><strong class="block text-[13px] leading-5">{{ option.label }}</strong><span class="block text-xs leading-5 text-muted-foreground">{{ option.description }}</span></span>
            </label>
          </RadioGroup>
          <div class="flex items-center gap-2 rounded-lg bg-muted/55 px-3 py-2 font-mono text-[10px] text-muted-foreground"><Icon name="askx-objects:selection" class="size-3.5 text-primary" />modelValue: {{ selectedMode }}</div>
        </div>
        <div class="flex justify-end"><DemoCopyButton text='<RadioGroup v-model="mode"><RadioGroupItem value="balanced" /></RadioGroup>' label="复制单选用法" copied-label="已复制" /></div>
      </article>
    </section>

    <section class="grid gap-2" data-demo-subsection="choice-checkbox">
      <div class="px-1"><h4 class="text-base font-semibold">Checkbox 多选</h4><p class="mt-1 text-xs leading-5 text-muted-foreground">每项独立切换，可组合为数组；选中范围始终由业务状态控制。</p></div>
      <article class="grid gap-4 rounded-2xl border bg-background p-4 sm:p-5" data-testid="checkbox-section">
        <div class="grid gap-3 md:grid-cols-3">
          <label v-for="option in targetOptions" :key="option.value" class="group flex min-h-28 cursor-pointer flex-col rounded-xl border bg-card p-4 transition-[border-color,background-color,box-shadow] hover:border-primary/35 hover:bg-primary/5 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_18%,transparent)]">
            <span class="flex items-start justify-between gap-3"><span class="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground group-has-[[data-state=checked]]:bg-primary/12 group-has-[[data-state=checked]]:text-primary"><Icon name="askx-objects:selection" class="size-4" /></span><Checkbox :id="`target-${option.value}`" :model-value="isTargetSelected(option.value)" @update:model-value="updateTarget(option.value, $event)" /></span>
            <strong class="mt-4 text-[13px]">{{ option.label }}</strong>
            <span class="mt-1 text-xs leading-5 text-muted-foreground">{{ option.description }}</span>
          </label>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3">
          <span class="inline-flex items-center gap-2 text-xs text-muted-foreground"><Icon name="askx-status:check" class="size-4 text-primary" />已选择 {{ selectedTargets.length }} 项</span>
          <code class="font-mono text-[10px] text-muted-foreground">[{{ selectedTargets.join(', ') }}]</code>
        </div>
      </article>
    </section>

    <section class="grid gap-2" data-demo-subsection="choice-states">
      <div class="px-1"><h4 class="text-base font-semibold">交互与校验状态</h4><p class="mt-1 text-xs leading-5 text-muted-foreground">控件状态来自标准属性；禁用仍保持既有 50% 透明度，不改变布局尺寸。</p></div>
      <article class="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-2 sm:p-5" data-testid="choice-states-section">
        <div class="rounded-xl border bg-card p-5">
          <span class="font-mono text-[10px] text-primary">CHECKBOX</span>
          <div class="mt-5 grid gap-4 text-[13px]">
            <label class="flex cursor-pointer items-center gap-3"><Checkbox v-model="notifications" />开启更新通知</label>
            <label class="flex cursor-pointer items-center gap-3"><Checkbox v-model="indeterminate" />部分项目已选择</label>
            <label class="flex cursor-pointer items-center gap-3"><Checkbox :model-value="true" disabled />已选且禁用</label>
            <div><label class="flex cursor-pointer items-center gap-3 text-destructive"><Checkbox aria-invalid="true" />需要至少选择一项</label><p class="ml-[30px] mt-1 text-xs text-destructive">请选择一个目标平台。</p></div>
          </div>
        </div>
        <div class="rounded-xl border bg-card p-5">
          <span class="font-mono text-[10px] text-primary">RADIO</span>
          <RadioGroup default-value="normal" aria-label="状态预览" class="mt-5 text-[13px]">
            <label class="flex cursor-pointer items-center gap-3"><RadioGroupItem value="normal" />默认选中</label>
            <label class="flex cursor-pointer items-center gap-3"><RadioGroupItem value="idle" />默认未选</label>
            <label class="flex cursor-pointer items-center gap-3"><RadioGroupItem value="disabled" disabled />禁用选项</label>
            <div><label class="flex cursor-pointer items-center gap-3 text-destructive"><RadioGroupItem value="invalid" aria-invalid="true" />校验失败</label><p class="ml-[30px] mt-1 text-xs text-destructive">当前选项不可用。</p></div>
          </RadioGroup>
        </div>
      </article>
    </section>

    <section class="grid gap-2" data-demo-subsection="choice-usage">
      <div class="px-1"><h4 class="text-base font-semibold">组件边界</h4><p class="mt-1 text-xs leading-5 text-muted-foreground">基础组件只负责行为、状态和视觉；标题、说明与错误信息由表单场景组合。</p></div>
      <article class="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-3 sm:p-5">
        <div v-for="item in [
          { index: '01', title: '原生语义', text: 'RadioGroup 管理互斥关系，Checkbox 保持独立布尔或半选状态。' },
          { index: '02', title: '可点击标签', text: '通过 label 包裹控件扩展热区，不在组件内部绑定业务文案。' },
          { index: '03', title: '语义颜色', text: '选中、焦点与错误态全部读取主题 token，深浅主题自动适配。' },
        ]" :key="item.index" class="rounded-xl border bg-card p-5">
          <span class="font-mono text-[10px] text-primary">{{ item.index }}</span><h4 class="mt-6 text-sm font-semibold">{{ item.title }}</h4><p class="mt-2 text-xs leading-5 text-muted-foreground">{{ item.text }}</p>
        </div>
      </article>
    </section>
    </div>
  </DemoSection>
</template>
