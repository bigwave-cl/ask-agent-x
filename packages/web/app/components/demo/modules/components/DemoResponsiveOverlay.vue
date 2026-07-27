<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoResponsiveOverlay' })

const isOpen = defineModel<boolean>({ default: false })
const dialogOpen = ref(false)
const popoverOpen = ref(false)
const standaloneDialogOpen = ref(false)
const standaloneDrawerOpen = ref(false)
const standalonePopoverOpen = ref(false)
const includeHidden = ref(false)
const followWorkspaceTheme = ref(true)
const toast = useToast()

const dialogCode = `<CsResponsiveOverlayDialogDrawer
  v-model:open="open"
  title="发布变更"
  description="桌面使用 Dialog，移动端自动切换为 Drawer。"
  close-label="关闭发布面板"
>
  <template #trigger>
    <Button>打开响应式 Dialog</Button>
  </template>

  <!-- content -->

  <template #footer="{ close }">
    <Button variant="outline" @click="close">取消</Button>
    <Button>确认发布</Button>
  </template>
</CsResponsiveOverlayDialogDrawer>`

const popoverCode = `<CsResponsiveOverlayPopoverDrawer
  v-model:open="open"
  title="扫描选项"
  :popover="{
    content: { side: 'bottom', align: 'end', sideOffset: 10 }
  }"
  close-label="关闭扫描选项"
>
  <template #trigger>
    <Button variant="outline">打开响应式 Popover</Button>
  </template>

  <!-- 桌面是 Popover，移动端是 Drawer -->
</CsResponsiveOverlayPopoverDrawer>`

const standaloneCode = {
  dialog: `<CsResponsiveOverlayDialog
  v-model:open="open"
  title="单独 Dialog"
  close-label="关闭 Dialog"
  :dialog="{ content: { class: 'max-w-md' } }"
>...</CsResponsiveOverlayDialog>`,
  drawer: `<CsResponsiveOverlayDrawer
  v-model:open="open"
  title="单独 Drawer"
  close-label="关闭 Drawer"
  :drawer="{ root: { direction: 'bottom' } }"
>...</CsResponsiveOverlayDrawer>`,
  popover: `<CsResponsiveOverlayPopover
  v-model:open="open"
  title="单独 Popover"
  close-label="关闭 Popover"
  :popover="{ content: { side: 'bottom', align: 'start' } }"
>...</CsResponsiveOverlayPopover>`,
}

function finishPublish(close: () => void) {
  close()
  toast.success('发布计划已确认', { description: '这里只演示弹层状态，不会写入本地配置。' })
}
</script>

<template>
  <DemoSection
    v-model="isOpen"
    sec-key="components-responsive-overlay"
    title="ResponsiveOverlay 响应式弹层"
    description="以 shadcn Dialog、Drawer、Popover 为底座，让业务只维护一份触发器和内容。"
  >
    <div class="grid gap-6 rounded-2xl border bg-background p-3 sm:p-5" data-testid="responsive-overlay-demo">
      <article class="relative overflow-hidden rounded-2xl border bg-background p-6 sm:p-8">
        <div class="pointer-events-none absolute -right-12 -top-24 size-72 rounded-full bg-primary/12 blur-3xl" />
        <div class="pointer-events-none absolute -bottom-28 left-1/3 size-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div class="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <Badge variant="soft"><Icon name="askx-status:star" />SHADCN / RESPONSIVE</Badge>
            <h3 class="mt-6 max-w-4xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">一个入口，选择正确的空间。</h3>
            <p class="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">桌面上的任务型内容进入 Dialog，轻量锚点内容进入 Popover；当视口变窄，两种模式都切换为底部 Drawer。业务无需维护 UA 判断和两份模板。</p>
          </div>
          <div class="grid min-w-60 gap-2 rounded-xl border bg-card/85 p-4 font-mono text-[10px] text-muted-foreground">
            <span class="flex items-center gap-2"><Icon name="askx-objects:layout" class="size-3.5 text-primary" />Dialog → Drawer</span>
            <span class="flex items-center gap-2"><Icon name="askx-objects:pointer" class="size-3.5 text-primary" />Popover → Drawer</span>
            <span class="flex items-center gap-2"><Icon name="askx-objects:layout" class="size-3.5 text-primary" />Breakpoint · 768px</span>
          </div>
        </div>
      </article>

      <section class="grid gap-3" data-demo-subsection="responsive-overlay-standalone">
        <div class="flex flex-wrap items-end justify-between gap-3 px-1">
          <div><Badge variant="outline">01 / STANDALONE</Badge><h4 class="mt-3 text-xl font-semibold tracking-[-0.035em]">基础模式可以单独使用。</h4><p class="mt-1.5 text-xs leading-5 text-muted-foreground">每个入口直接组合原始 shadcn primitive 与公共 Shell，不经过响应式切换。</p></div>
          <code class="rounded-lg border bg-muted/45 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">Dialog.vue · Drawer.vue · Popover.vue</code>
        </div>

        <div class="grid gap-3 lg:grid-cols-3">
          <article class="grid content-between gap-6 rounded-2xl border bg-card p-5">
            <div><div class="flex items-start justify-between gap-3"><span class="grid size-9 place-items-center rounded-xl bg-primary/10 font-mono text-[10px] text-primary">D</span><DemoCopyButton :text="standaloneCode.dialog" label="复制单独 Dialog" copied-label="已复制" square /></div><h5 class="mt-6 text-base font-semibold">Dialog</h5><p class="mt-2 text-xs leading-5 text-muted-foreground">固定任务、表单与确认流程，保持焦点锁定和背景 inert。</p></div>
            <CsResponsiveOverlayDialog
              v-model:open="standaloneDialogOpen"
              title="单独使用 Dialog"
              description="这个入口不会根据视口改变模式。"
              close-label="关闭单独 Dialog"
              :dialog="{ content: { class: 'max-w-md' } }"
            >
              <template #trigger><Button variant="outline" size="36" class="w-full" data-testid="open-standalone-dialog">打开 Dialog</Button></template>
              <p class="rounded-xl border bg-background p-4 text-sm leading-6 text-muted-foreground">shadcn Dialog 只负责弹层行为，标题、内容滚动和 Footer 样式来自 ResponsiveOverlayShell。</p>
              <template #footer="{ close }"><Button variant="outline" @click="close">完成</Button></template>
            </CsResponsiveOverlayDialog>
          </article>

          <article class="grid content-between gap-6 rounded-2xl border bg-card p-5">
            <div><div class="flex items-start justify-between gap-3"><span class="grid size-9 place-items-center rounded-xl bg-primary/10 font-mono text-[10px] text-primary">R</span><DemoCopyButton :text="standaloneCode.drawer" label="复制单独 Drawer" copied-label="已复制" square /></div><h5 class="mt-6 text-base font-semibold">Drawer</h5><p class="mt-2 text-xs leading-5 text-muted-foreground">移动操作面板和选择器，也可以在桌面页面中明确单独调用。</p></div>
            <CsResponsiveOverlayDrawer
              v-model:open="standaloneDrawerOpen"
              title="单独使用 Drawer"
              description="当前视口无论多宽都会保持 Drawer。"
              close-label="关闭单独 Drawer"
            >
              <template #trigger><Button variant="outline" size="36" class="w-full" data-testid="open-standalone-drawer">打开 Drawer</Button></template>
              <p class="rounded-xl border bg-background p-4 text-sm leading-6 text-muted-foreground">底层仍是 shadcn Drawer 与 Vaul；拖拽、ESC 和遮罩关闭由其原始能力处理。</p>
              <template #footer="{ close }"><Button @click="close">完成</Button></template>
            </CsResponsiveOverlayDrawer>
          </article>

          <article class="grid content-between gap-6 rounded-2xl border bg-card p-5">
            <div><div class="flex items-start justify-between gap-3"><span class="grid size-9 place-items-center rounded-xl bg-primary/10 font-mono text-[10px] text-primary">P</span><DemoCopyButton :text="standaloneCode.popover" label="复制单独 Popover" copied-label="已复制" square /></div><h5 class="mt-6 text-base font-semibold">Popover</h5><p class="mt-2 text-xs leading-5 text-muted-foreground">替代原 Panel 场景，锚点定位和碰撞计算直接使用 Reka。</p></div>
            <CsResponsiveOverlayPopover
              v-model:open="standalonePopoverOpen"
              title="单独使用 Popover"
              description="由 trigger 提供定位锚点。"
              close-label="关闭单独 Popover"
              :popover="{ content: { side: 'bottom', align: 'start', sideOffset: 10 } }"
            >
              <template #trigger><Button variant="outline" size="36" class="w-full" data-testid="open-standalone-popover">打开 Popover</Button></template>
              <p class="text-xs leading-5 text-muted-foreground">无需保留 show(event) 或手写 updatePosition。</p>
              <template #footer="{ close }"><Button variant="ghost" size="sm" @click="close">完成</Button></template>
            </CsResponsiveOverlayPopover>
          </article>
        </div>
      </section>

      <div class="flex flex-wrap items-end justify-between gap-3 px-1">
        <div><Badge variant="outline">02 / COMPOSED</Badge><h4 class="mt-3 text-xl font-semibold tracking-[-0.035em]">业务优先使用响应式组合。</h4><p class="mt-1.5 text-xs leading-5 text-muted-foreground">Wrapper 只负责 SSR 稳定的视口选择，内容仍由对应基础模式渲染。</p></div>
        <code class="rounded-lg border bg-muted/45 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">DialogDrawer.vue · PopoverDrawer.vue</code>
      </div>

      <section class="grid gap-3 lg:grid-cols-2" data-demo-subsection="responsive-overlay-modes">
        <article class="group relative grid min-h-72 content-between gap-8 overflow-hidden rounded-2xl border bg-card p-5 sm:p-6">
          <div class="absolute right-0 top-0 h-24 w-24 rounded-bl-[4rem] bg-primary/8 transition-transform duration-300 group-hover:scale-110" />
          <div class="relative">
            <div class="flex items-start justify-between gap-3">
              <span class="grid size-10 place-items-center rounded-xl border bg-background text-primary"><Icon name="askx-objects:layers" class="size-4" /></span>
              <DemoCopyButton :text="dialogCode" label="复制 Dialog 用法" copied-label="已复制" square />
            </div>
            <h4 class="mt-8 text-xl font-semibold tracking-[-0.035em]">任务弹层</h4>
            <p class="mt-2 max-w-md text-xs leading-5 text-muted-foreground">表单、确认和多步骤内容使用 Dialog。移动端自动获得 Drawer 的拖拽关闭和触控布局。</p>
          </div>

          <CsResponsiveOverlayDialogDrawer
            v-model:open="dialogOpen"
            title="发布本地变更"
            description="确认后才会进入 apply 阶段；当前 Demo 不执行任何写操作。"
            close-label="关闭发布面板"
          >
            <template #trigger="{ mode }">
              <Button size="40" class="w-full justify-between" data-testid="open-responsive-dialog">
                打开任务弹层
                <span class="flex items-center gap-2 text-[10px] font-normal opacity-75"><span class="hidden sm:inline">{{ mode }}</span><Icon name="askx-navigation:arrow-right" /></span>
              </Button>
            </template>

            <div class="grid gap-3">
              <div v-for="(step, index) in ['检测当前配置', '生成变更计划', '等待用户确认']" :key="step" class="flex items-center gap-3 rounded-xl border bg-background p-3">
                <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 font-mono text-[10px] text-primary">0{{ index + 1 }}</span>
                <div class="min-w-0 flex-1"><strong class="text-sm">{{ step }}</strong><p class="mt-0.5 text-xs text-muted-foreground">安全链路中的独立阶段</p></div>
                <Icon name="askx-status:check" class="size-4 text-primary" />
              </div>
            </div>

            <template #footer="{ close }">
              <Button variant="outline" @click="close">取消</Button>
              <Button @click="finishPublish(close)">确认计划</Button>
            </template>
          </CsResponsiveOverlayDialogDrawer>
        </article>

        <article class="group relative grid min-h-72 content-between gap-8 overflow-hidden rounded-2xl border bg-card p-5 sm:p-6">
          <div class="absolute right-0 top-0 h-24 w-24 rounded-bl-[4rem] bg-cyan-400/8 transition-transform duration-300 group-hover:scale-110" />
          <div class="relative">
            <div class="flex items-start justify-between gap-3">
              <span class="grid size-10 place-items-center rounded-xl border bg-background text-primary"><Icon name="askx-actions:adjust" class="size-4" /></span>
              <DemoCopyButton :text="popoverCode" label="复制 Popover 用法" copied-label="已复制" square />
            </div>
            <h4 class="mt-8 text-xl font-semibold tracking-[-0.035em]">锚点弹层</h4>
            <p class="mt-2 max-w-md text-xs leading-5 text-muted-foreground">原 Panel 场景由 Popover 接管，定位、碰撞和焦点行为沿用 Reka；移动端同样降级为 Drawer。</p>
          </div>

          <CsResponsiveOverlayPopoverDrawer
            v-model:open="popoverOpen"
            title="扫描选项"
            description="只调整本次检测行为，不修改共享设置。"
            :popover="{ content: { side: 'bottom', align: 'end', sideOffset: 10 } }"
            close-label="关闭扫描选项"
          >
            <template #trigger="{ mode }">
              <Button variant="outline" size="40" class="w-full justify-between" data-testid="open-responsive-popover">
                打开锚点弹层
                <span class="flex items-center gap-2 text-[10px] font-normal text-muted-foreground"><span class="hidden sm:inline">{{ mode }}</span><Icon name="askx-navigation:arrow-right" /></span>
              </Button>
            </template>

            <div class="grid gap-2">
              <label class="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-background p-3">
                <span><strong class="block text-sm">包含隐藏目录</strong><small class="mt-1 block text-xs text-muted-foreground">扫描以点开头的本地目录</small></span>
                <Switch v-model="includeHidden" aria-label="包含隐藏目录" />
              </label>
              <label class="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-background p-3">
                <span><strong class="block text-sm">跟随工作台主题</strong><small class="mt-1 block text-xs text-muted-foreground">预览使用当前共享主题</small></span>
                <Switch v-model="followWorkspaceTheme" aria-label="跟随工作台主题" />
              </label>
            </div>

            <template #footer="{ close }">
              <Button variant="ghost" size="sm" @click="close">完成</Button>
            </template>
          </CsResponsiveOverlayPopoverDrawer>
        </article>
      </section>

      <section class="grid gap-3 sm:grid-cols-3" data-demo-subsection="responsive-overlay-contract">
        <article v-for="item in [
          { icon: 'askx-objects:layout', title: 'SSR 稳定', text: '服务端只输出触发器，挂载后再选择弹层根组件，避免 hydration 分叉。' },
          { icon: 'askx-objects:pointer', title: 'Popover 定位', text: 'side、align、offset 和 collisionPadding 直接沿用 Reka 能力。' },
          { icon: 'askx-objects:layers', title: '统一状态', text: 'Dialog、Popover、Drawer 都使用同一个 v-model:open 与 close()。' },
        ]" :key="item.title" class="rounded-xl border bg-card p-5">
          <Icon :name="item.icon" class="size-4 text-primary" />
          <h4 class="mt-5 text-sm font-semibold">{{ item.title }}</h4>
          <p class="mt-2 text-xs leading-5 text-muted-foreground">{{ item.text }}</p>
        </article>
      </section>
    </div>
  </DemoSection>
</template>
