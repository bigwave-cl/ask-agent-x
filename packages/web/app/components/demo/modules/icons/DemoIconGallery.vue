<script setup lang="ts">
import type { AskxIconName } from '@/lib/iconCatalog'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import DemoSection from '../../components/DemoSection.vue'
import { askxIconCatalog, askxIconCategories, askxIconCategoryLabels } from '@/lib/iconCatalog'

defineOptions({ name: 'DemoIconGallery' })

/** Gallery Section 的展开状态。 */
const isOpen = defineModel<boolean>({ default: false })
/** 当前图标搜索关键词。 */
const query = ref('')
/** 最近完成复制的图标名称。 */
const copiedName = ref<AskxIconName>()
/** Demo 页面消息反馈实例。 */
const toast = useToast()
/** 复制成功状态的复位定时器。 */
let copiedTimer: ReturnType<typeof setTimeout> | undefined

/** 统一处理过的图标搜索关键词。 */
const normalizedQuery = computed(() => query.value.trim().toLowerCase())
/** 根据名称筛选后的图标清单。 */
const filteredIcons = computed(() => askxIconCatalog.filter(icon => (
  !normalizedQuery.value
  || icon.name.toLowerCase().includes(normalizedQuery.value)
)))

/** 按语义分类整理后的可见图标组。 */
const groups = computed(() => askxIconCategories.map(category => ({
  category,
  label: askxIconCategoryLabels[category],
  icons: filteredIcons.value.filter(icon => icon.category === category),
})).filter(group => group.icons.length > 0))

/**
 * 复制指定图标的标准调用代码。
 *
 * @param name 要复制用法的图标名称。
 * @param event 触发复制操作的鼠标事件。
 */
async function copyUsage(name: AskxIconName, event: MouseEvent) {
  const text = `<Icon name="${name}" class="size-4" aria-hidden="true" />`
  const el = event.currentTarget instanceof Element ? event.currentTarget : undefined
  const copied = await useCopyText({ text, el })
  if (!copied) {
    toast.error('复制失败，请重试')
    return
  }

  copiedName.value = name
  toast.success('Icon 用法已复制')
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copiedName.value = undefined }, 1400)
}

onBeforeUnmount(() => copiedTimer && clearTimeout(copiedTimer))
</script>

<template>
  <DemoSection
    v-model="isOpen"
    sec-key="icons-gallery"
    title="Icon Gallery"
    description="搜索四个本地集合，点击任意图标卡片即可复制调用代码。"
  >
    <div class="grid gap-5 rounded-2xl border bg-background p-4 sm:p-6" data-testid="icon-gallery">
      <header class="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" class="font-mono"><Icon name="askx-objects:layout" />{{ askxIconCatalog.length }} ICONS</Badge>
          <h4 class="mt-4 text-2xl font-semibold">一个 Catalog 管理全部名称。</h4>
          <p class="mt-2 text-xs leading-5 text-muted-foreground">结果按 actions、navigation、status、objects 分类，图标会继承卡片当前文本颜色。</p>
        </div>
        <label for="icon-search" class="relative block w-full lg:max-w-sm">
          <span class="sr-only">搜索图标</span>
          <Icon name="askx-actions:search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="icon-search" v-model="query" name="icon-search" class="pl-9" type="search" placeholder="搜索图标名称" data-testid="icon-search" />
        </label>
      </header>

      <div v-if="groups.length" class="grid gap-7">
        <section v-for="group in groups" :key="group.category" class="grid gap-3">
          <div class="flex items-center justify-between gap-3">
            <h5 class="text-sm font-semibold">{{ group.label }} <code class="ml-1 font-mono text-[10px] font-normal text-muted-foreground">askx-{{ group.category }}</code></h5>
            <Badge variant="secondary">{{ group.icons.length }}</Badge>
          </div>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            <button
              v-for="icon in group.icons"
              :key="icon.name"
              type="button"
              class="group grid min-h-28 content-between gap-4 rounded-lg border bg-card p-3 text-left transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :aria-label="`复制 ${icon.name} 用法`"
              :data-icon-name="icon.name"
              @click="copyUsage(icon.name, $event)"
            >
              <span class="flex items-start justify-between gap-3">
                <span class="grid size-10 place-items-center rounded-lg bg-muted text-foreground transition group-hover:bg-primary/10 group-hover:text-primary">
                  <Icon :name="icon.name" class="size-5" aria-hidden="true" />
                </span>
                <Icon :name="copiedName === icon.name ? 'askx-status:check' : 'askx-actions:copy'" class="size-3.5 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
              </span>
              <code class="min-w-0 break-all font-mono text-[10px] leading-4 text-muted-foreground">{{ icon.name }}</code>
            </button>
          </div>
        </section>
      </div>

      <div v-else class="grid min-h-48 place-items-center rounded-xl border border-dashed bg-muted/25 p-8 text-center">
        <div><Icon name="askx-actions:search" class="mx-auto size-6 text-muted-foreground" /><p class="mt-3 text-sm font-medium">没有匹配的图标</p><p class="mt-1 text-xs text-muted-foreground">尝试输入 copy、status 或完整图标名称。</p></div>
      </div>
    </div>
  </DemoSection>
</template>
