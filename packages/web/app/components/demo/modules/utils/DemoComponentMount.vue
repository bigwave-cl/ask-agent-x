<script setup lang="ts">
import { Boxes, CheckCircle2, PackageOpen, Trash2 } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'
import DemoMountedCard from './component-mount/DemoMountedCard.vue'
import DemoMountedNotice from './component-mount/DemoMountedNotice.vue'
import type { MountComponentReturn } from '@/utils/componentMount'
import { mountComponent } from '@/utils/componentMount'

defineOptions({ name: 'DemoComponentMount' })

const isOpen = defineModel<boolean>({ default: false })
const mountTarget = ref<HTMLElement | null>(null)
const cardMount = shallowRef<MountComponentReturn<typeof DemoMountedCard> | null>(null)
const noticeMount = shallowRef<MountComponentReturn<typeof DemoMountedNotice> | null>(null)
const lifecycleEvents = ref(['等待挂载操作'])

const containerCode = `const mounted = mountComponent(DemoMountedCard, {
  props: { title: '指定容器挂载' },
  containerEl: target.value,
})

mounted.unmount()`
const autoUnmountCode = `mountComponent(DemoMountedNotice, {
  autoUnmount: true,
  watchStateKey: 'isOpen',
  unmountDelay: 200,
})`

function record(message: string) {
  lifecycleEvents.value = [message, ...lifecycleEvents.value].slice(0, 5)
}

function unmountCard(shouldRecord = true) {
  cardMount.value?.unmount()
  cardMount.value = null
  if (shouldRecord) record('已手动卸载容器内组件')
}

function mountCard() {
  if (!mountTarget.value) return
  unmountCard(false)

  cardMount.value = mountComponent(DemoMountedCard, {
    props: {
      title: '指定容器挂载成功',
      description: 'props、事件回调和项目 UI 组件均可继续使用。',
      onAction: () => record('动态组件向宿主触发了 action 事件'),
    },
    containerEl: mountTarget.value,
    onMounted: () => record('组件已挂载到指定 HTMLElement'),
    onUnmounted: () => record('componentMount 已清理 Vue 实例与容器'),
  })
}

function mountNotice() {
  noticeMount.value?.unmount()

  const nextMount = mountComponent(DemoMountedNotice, {
    props: {
      title: '自动卸载已启用',
      description: '点击右上角关闭，200ms 后动态容器也会被移除。',
    },
    autoUnmount: true,
    watchStateKey: 'isOpen',
    unmountDelay: 200,
    onMounted: () => record('通知已挂载到 document.body'),
    onUnmounted: () => {
      if (noticeMount.value === nextMount) noticeMount.value = null
      record('isOpen 关闭后通知已自动卸载')
    },
  })

  noticeMount.value = nextMount
}

onBeforeUnmount(() => {
  unmountCard(false)
  noticeMount.value?.unmount()
})
</script>

<template>
  <DemoSection
    v-model="isOpen"
    title="componentMount"
    description="动态挂载组件，并继承 Nuxt AppContext、props、事件和卸载生命周期。"
    sec-key="utils-component-mount"
  >
    <article class="grid gap-5 rounded-2xl border bg-background p-5 sm:p-7">
      <header class="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" class="font-mono"><Boxes />UTILITY</Badge>
          <h4 class="mt-4 text-2xl font-semibold tracking-normal">组件可以在声明树之外安全生长。</h4>
        </div>
        <code class="w-fit rounded-lg bg-muted px-3 py-2 font-mono text-[10px] text-muted-foreground">app/utils/componentMount.ts</code>
      </header>

      <div class="grid gap-4 lg:grid-cols-2">
        <section class="grid content-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h5 class="text-sm font-semibold">指定容器挂载</h5>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">传入 HTMLElement，将普通组件插入明确的宿主区域。</p>
            </div>
            <DemoCopyButton :text="containerCode" />
          </div>
          <div class="flex flex-wrap gap-2">
            <Button size="36" @click="mountCard"><PackageOpen />挂载组件</Button>
            <Button variant="outlined" size="36" :disabled="!cardMount" @click="unmountCard()"><Trash2 />卸载</Button>
          </div>
          <div ref="mountTarget" data-testid="component-mount-target" class="min-h-36 rounded-xl border border-dashed bg-muted/35 p-3">
            <p v-if="!cardMount" class="grid min-h-28 place-items-center text-xs text-muted-foreground">动态组件挂载区域</p>
          </div>
        </section>

        <section class="grid content-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h5 class="text-sm font-semibold">状态驱动自动卸载</h5>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">监听 exposed 状态，完成离场后销毁实例和 DOM 容器。</p>
            </div>
            <DemoCopyButton :text="autoUnmountCode" />
          </div>
          <code class="min-h-36 whitespace-pre-wrap rounded-lg bg-muted/65 p-3 font-mono text-xs leading-5 text-muted-foreground">{{ autoUnmountCode }}</code>
          <Button variant="soft" size="36" class="justify-self-start" @click="mountNotice"><PackageOpen />挂载通知</Button>
        </section>
      </div>

      <section class="grid gap-3 rounded-xl bg-muted/45 p-4">
        <h5 class="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 class="size-4 text-success" />生命周期记录</h5>
        <ol class="grid gap-1.5 text-xs leading-5 text-muted-foreground">
          <li v-for="(event, index) in lifecycleEvents" :key="`${event}-${index}`">{{ event }}</li>
        </ol>
      </section>
    </article>
  </DemoSection>
</template>
