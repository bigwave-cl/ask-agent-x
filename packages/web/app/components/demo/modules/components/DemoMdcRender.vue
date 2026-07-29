<script setup lang="ts">
import type { AskxIconName } from '@/lib/iconCatalog'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoMdcRender' })

/** MDC Demo Section 的展开状态。 */
const isOpen = defineModel<boolean>({ default: false })
/** 是否按纯文本模式渲染。 */
const isPlainText = ref(false)
/** MDC 完成渲染的累计次数。 */
const resolveCount = ref(0)
/** 用于验证原始 HTML 不执行的示例。 */
const rawHtmlExample = '<script>alert("blocked")</' + 'script>'
/** Demo 中可实时编辑的 Markdown 内容。 */
const markdownValue = ref(`# Markdown 渲染

普通段落支持 **粗体**、*斜体*、~~删除线~~ 和 \`inline code\`。

单个波浪号保持原样：1~2。

## 列表与引用

- 支持无序列表
- 支持 [安全链接](/demo?module=components&secKey=components-mdc-render)
- 危险链接不会生成锚点：[blocked](javascript:alert(1))

1. 第一项
2. 第二项

> 一级引用使用品牌浅色背景。
> > 嵌套引用会提升背景层级。
> > > 三级引用继续提升色彩强度。

## 表格

| 能力 | 状态 |
| :--- | ---: |
| Vue 节点渲染 | Ready |
| 原始 HTML 执行 | Blocked |

---

## 代码块

\`\`\`ts
const renderer = "BusMdcRender"
const isSafe = true
\`\`\`

原始 HTML 会显示为文本：${rawHtmlExample}

图片降级为 alt 文本：![Preview image](https://example.com/image.png)`)
/** MDC 渲染器的标准调用代码。 */
const usageCode = `<BusMdcRender
  :value="markdown"
  cache-key="message-id"
  :plain-text="false"
  @resolve="handleResolve"
/>`
/** MDC 安全边界说明项。 */
const securityItems: Array<{ icon: AskxIconName, title: string, text: string }> = [
  { icon: 'askx-status:lock', title: '受控节点', text: '只渲染白名单语义，不使用 v-html。' },
  { icon: 'askx-actions:hide', title: '主动降级', text: 'HTML 与图片只保留可读文本。' },
  { icon: 'askx-status:check', title: 'SSR 稳定', text: 'Token 解析和节点结构可在服务端直接输出。' },
]

/** 记录 MDC 完成渲染的通知。 */
function handleResolve() {
  resolveCount.value += 1
}
</script>

<template>
  <DemoSection
    v-model="isOpen"
    sec-key="components-mdc-render"
    title="MDC Render"
    description="融合 IMA 排版层级与 PG DS 主题的安全 Markdown 预设。"
  >
    <div class="grid gap-6 rounded-2xl border bg-background p-3 sm:p-5" data-testid="mdc-render-demo">
      <article class="grid gap-5 rounded-2xl border bg-card p-5 sm:p-6">
        <header class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="soft"><Icon name="askx-objects:model" />MARKED / CONTROLLED NODES</Badge>
            <h3 class="mt-5 text-3xl font-semibold">Markdown 只描述内容，不获得执行权限。</h3>
            <p class="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">解析结果只会进入明确允许的 Vue 节点；HTML、图片和危险协议全部降级，适合后续 Agent 消息与本地文档预览。</p>
          </div>
          <DemoCopyButton :text="usageCode" label="复制实现" copied-label="已复制" />
        </header>

        <div class="grid min-w-0 gap-3 lg:grid-cols-2">
          <section class="grid min-w-0 content-start gap-3 rounded-xl border bg-background p-4">
            <div class="flex min-h-12 flex-wrap items-center justify-between gap-3">
              <div><h4 class="text-sm font-semibold">Markdown 输入</h4><span class="mt-1 block font-mono text-[10px] text-muted-foreground">{{ markdownValue.length }} characters</span></div>
              <label class="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><Checkbox v-model="isPlainText" />纯文本模式</label>
            </div>
            <textarea
              v-model="markdownValue"
              class="h-[480px] w-full resize-none rounded-lg border bg-muted/35 p-4 font-mono text-[13px] leading-5 text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              aria-label="Markdown 输入"
              spellcheck="false"
            />
          </section>

          <section class="grid min-w-0 content-start gap-3 rounded-xl border bg-background p-4">
            <div class="flex min-h-12 flex-wrap items-center justify-between gap-3">
              <h4 class="text-sm font-semibold">实时预览</h4>
              <div class="flex items-center gap-2"><span class="rounded-lg bg-primary/10 px-2.5 py-1 font-mono text-[10px] text-primary">{{ isPlainText ? 'PLAIN TEXT' : 'MARKDOWN' }}</span><span class="font-mono text-[10px] text-muted-foreground">resolved {{ resolveCount }}</span></div>
            </div>
            <ScrollArea class="h-[480px] min-w-0 rounded-lg border bg-muted/35" type="always" aria-label="MDC 实时预览">
              <div class="min-w-0 p-4 pr-5">
                <BusMdcRender :value="markdownValue" cache-key="demo-mdc-render" :plain-text="isPlainText" @resolve="handleResolve" />
              </div>
            </ScrollArea>
          </section>
        </div>

        <code class="block whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-4 font-mono text-xs leading-5 text-muted-foreground">{{ usageCode }}</code>
      </article>

      <section class="grid gap-3 sm:grid-cols-3">
        <article v-for="item in securityItems" :key="item.title" class="rounded-xl border bg-card p-5">
          <Icon :name="item.icon" class="size-4 text-primary" />
          <h4 class="mt-5 text-sm font-semibold">{{ item.title }}</h4>
          <p class="mt-2 text-xs leading-5 text-muted-foreground">{{ item.text }}</p>
        </article>
      </section>
    </div>
  </DemoSection>
</template>
