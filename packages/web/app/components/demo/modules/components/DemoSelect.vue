<script setup lang="ts">
import { Bot, Languages, ListFilter, MapPin, Sparkles } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import type { ResponsiveSelectChangeEvent, ResponsiveSelectOption } from '@/components/common/responsive-select/types'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoSelect' })

const isOpen = defineModel<boolean>({ default: false })
const language = ref<string>()
const model = ref('gpt-5')
const region = ref('cn-east')
const lastChange = ref('等待选择')

const languageOptions: ResponsiveSelectOption[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語', disabled: true },
]

const modelOptions: ResponsiveSelectOption[] = [
  { value: 'gpt-5', label: 'GPT-5', description: '适合复杂规划与代码任务' },
  { value: 'claude-sonnet', label: 'Claude Sonnet', description: '速度与推理能力均衡' },
  { value: 'gemini-pro', label: 'Gemini Pro', description: '支持较长上下文输入' },
]

const regionOptions: ResponsiveSelectOption[] = [
  { value: 'cn-east', label: '华东节点', description: '延迟约 28ms' },
  { value: 'cn-south', label: '华南节点', description: '延迟约 34ms' },
  { value: 'sg', label: '新加坡节点', description: '延迟约 62ms' },
]

function recordChange(event: ResponsiveSelectChangeEvent) {
  lastChange.value = event.option?.label ?? '已清除'
}
</script>

<template>
  <DemoSection
    v-model="isOpen"
    sec-key="components-select"
    title="Select 响应式下拉"
    description="桌面使用 shadcn Select，移动端自动切换为 Drawer。"
  >
    <div class="grid gap-6 rounded-2xl border bg-background p-3 sm:p-5" data-testid="responsive-select-demo">
      <article class="relative overflow-hidden rounded-2xl border bg-background p-6 sm:p-8">
        <div class="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-primary/12 blur-3xl" />
        <div class="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <Badge variant="soft"><Sparkles />SHADCN / RESPONSIVE</Badge>
            <h3 class="mt-6 max-w-3xl text-3xl font-semibold sm:text-5xl">同一份选择，在合适的容器里发生。</h3>
            <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">桌面端保留 Select 的键盘导航、typeahead 与定位能力；移动端根据统一断点规则切换为 Drawer，并共享同一份选项和 model。</p>
          </div>
          <div class="rounded-xl border bg-card px-4 py-3 font-mono text-[10px] text-muted-foreground">
            最近变更：<span class="text-primary">{{ lastChange }}</span>
          </div>
        </div>
      </article>

      <section class="grid gap-2" data-demo-subsection="select-basic">
        <div class="px-1">
          <h4 class="text-base font-semibold">基础单选</h4>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">支持占位、禁用选项和统一 change 事件；缩窄视口即可验证 Drawer 呈现。</p>
        </div>
        <article class="grid gap-5 rounded-2xl border bg-card p-4 sm:p-5">
          <div class="grid gap-2 sm:max-w-sm">
            <label class="text-xs font-medium" for="demo-language">界面语言</label>
            <CsResponsiveSelect
              id="demo-language"
              v-model="language"
              name="language"
              title="选择界面语言"
              placeholder="请选择语言"
              close-label="关闭语言选择"
              clear-label="清除语言"
              empty-text="暂无可选语言"
              :options="languageOptions"
              @change="recordChange"
            />
            <code class="font-mono text-[10px] text-muted-foreground">modelValue: {{ language ?? 'undefined' }}</code>
          </div>
          <div class="flex justify-end">
            <DemoCopyButton text='<CsResponsiveSelect v-model="language" :options="options" title="选择语言" placeholder="请选择" />' label="复制基础用法" copied-label="已复制" />
          </div>
        </article>
      </section>

      <section class="grid gap-2" data-demo-subsection="select-rich">
        <div class="px-1">
          <h4 class="text-base font-semibold">描述与自定义内容</h4>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">选项描述由两端共享，item 与 value 插槽可加入业务图标，不接管触发器结构。</p>
        </div>
        <article class="grid gap-5 rounded-2xl border bg-card p-4 sm:p-5">
          <div class="grid gap-2 sm:max-w-md">
            <label class="text-xs font-medium">默认模型</label>
            <CsResponsiveSelect
              v-model="model"
              title="选择默认模型"
              placeholder="请选择模型"
              close-label="关闭模型选择"
              clear-label="清除模型"
              empty-text="暂无可用模型"
              content-class="sm:min-w-80"
              :options="modelOptions"
              @change="recordChange"
            >
              <template #value="{ option, placeholder }">
                <span class="inline-flex min-w-0 items-center gap-2"><Bot class="size-4 shrink-0 text-primary" /><span class="truncate">{{ option?.label ?? placeholder }}</span></span>
              </template>
              <template #item="{ option }">
                <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Bot class="size-4" /></span>
                <span class="grid min-w-0 flex-1 gap-0.5 text-left"><strong class="text-sm">{{ option.label }}</strong><span class="text-xs leading-5 text-muted-foreground">{{ option.description }}</span></span>
              </template>
            </CsResponsiveSelect>
          </div>
        </article>
      </section>

      <section class="grid gap-2" data-demo-subsection="select-states">
        <div class="px-1">
          <h4 class="text-base font-semibold">清除、空列表与禁用</h4>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">清除操作独立提交空值；无选项和整体禁用时不产生变更事件。</p>
        </div>
        <article class="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-3 sm:p-5">
          <div class="grid content-start gap-2">
            <span class="inline-flex items-center gap-2 text-xs font-medium"><MapPin class="size-4 text-primary" />可清除节点</span>
            <CsResponsiveSelect v-model="region" clearable title="选择服务节点" placeholder="请选择节点" close-label="关闭节点选择" clear-label="清除节点" empty-text="暂无服务节点" :options="regionOptions" @change="recordChange" />
          </div>
          <div class="grid content-start gap-2">
            <span class="inline-flex items-center gap-2 text-xs font-medium"><ListFilter class="size-4 text-primary" />空列表</span>
            <CsResponsiveSelect title="选择执行器" placeholder="暂无执行器" close-label="关闭执行器选择" clear-label="清除执行器" empty-text="暂无可用执行器" :options="[]" />
          </div>
          <div class="grid content-start gap-2">
            <span class="inline-flex items-center gap-2 text-xs font-medium"><Languages class="size-4 text-primary" />整体禁用</span>
            <CsResponsiveSelect disabled title="选择语言" placeholder="不可修改" close-label="关闭语言选择" clear-label="清除语言" empty-text="暂无语言" :options="languageOptions" />
          </div>
        </article>
      </section>
    </div>
  </DemoSection>
</template>
