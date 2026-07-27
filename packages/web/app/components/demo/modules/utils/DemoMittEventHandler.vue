<script setup lang="ts">
import mitt from 'mitt'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'
import { useCleanupQueue, useEventHandler, useMittEventHandler } from '@/utils/messageHandler'

defineOptions({ name: 'DemoMittEventHandler' })

type DemoEvents = {
  'task:created': { id: number, title: string }
  'queue:cleared': { count: number }
}

const isOpen = defineModel<boolean>({ default: false })
const emitter = mitt<DemoEvents>()
const { addCleanup, cleanup } = useCleanupQueue()
const nativeEventTarget = ref<HTMLElement | null>(null)
const isListening = ref(false)
const taskId = ref(0)
const receivedCount = ref(0)
const cleanupCount = ref(0)
const eventLog = ref(['监听尚未启动'])

const usageCode = `const emitter = mitt<AppEvents>()
const { addCleanup, cleanup } = useCleanupQueue()

addCleanup(
  useEventHandler(window, 'resize', handleResize),
  useMittEventHandler(emitter, 'task:created', handleTask),
  useMittEventHandler(emitter, 'queue:cleared', handleClear),
)

onBeforeUnmount(cleanup)`

function log(message: string) {
  eventLog.value = [message, ...eventLog.value].slice(0, 5)
}

function stopListening() {
  cleanup()
}

function startListening() {
  stopListening()

  const eventCleanups = [
    useMittEventHandler(emitter, 'task:created', ({ id, title }) => {
      receivedCount.value += 1
      log(`收到 task:created #${id} · ${title}`)
    }),
    useMittEventHandler(emitter, 'queue:cleared', ({ count }) => {
      receivedCount.value += 1
      log(`收到 queue:cleared · 已清理 ${count} 项`)
    }),
  ]

  if (nativeEventTarget.value) {
    eventCleanups.push(useEventHandler(nativeEventTarget.value, 'click', () => {
      receivedCount.value += 1
      log('收到 DOM click · useEventHandler 已执行')
    }))
  }

  addCleanup(
    eventCleanups,
    () => {
      isListening.value = false
      cleanupCount.value += 1
      log('cleanup 队列已执行，DOM 与 mitt 监听全部解绑')
    },
  )

  isListening.value = true
  log('DOM 与两个强类型 mitt 监听已注册')
}

function emitTask() {
  taskId.value += 1
  emitter.emit('task:created', { id: taskId.value, title: '同步本地设置' })
}

function emitClear() {
  emitter.emit('queue:cleared', { count: taskId.value })
}

function resetStats() {
  taskId.value = 0
  receivedCount.value = 0
  cleanupCount.value = 0
  eventLog.value = ['统计已重置']
}

onBeforeUnmount(cleanup)
</script>

<template>
  <DemoSection
    v-model="isOpen"
    title="useEventHandler / useMittEventHandler / useCleanupQueue"
    description="统一注册 DOM 与 mitt 事件，并将返回的解绑函数交给清理队列。"
    sec-key="utils-mitt-event-handler"
  >
    <article class="grid gap-5 rounded-2xl border bg-background p-5 sm:p-7">
      <header class="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" class="font-mono"><Icon name="askx-objects:agent" />EVENT UTILITY</Badge>
          <h4 class="mt-4 text-2xl font-semibold tracking-normal">监听和清理必须成对出现。</h4>
        </div>
        <code class="w-fit rounded-lg bg-muted px-3 py-2 font-mono text-[10px] text-muted-foreground">app/utils/messageHandler.ts</code>
      </header>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
        <section class="grid content-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
          <div class="flex flex-wrap items-center gap-2">
            <Button v-if="!isListening" size="36" @click="startListening"><Icon name="askx-status:loading" />开始监听</Button>
            <Button v-else variant="destructive" size="36" @click="stopListening"><Icon name="askx-status:error" />执行 cleanup</Button>
            <Button variant="outlined" size="36" :disabled="!isListening" @click="emitTask"><Icon name="askx-actions:external-link" />发送任务事件</Button>
            <Button variant="soft" size="36" :disabled="!isListening" @click="emitClear"><Icon name="askx-actions:erase" />发送清理事件</Button>
            <span ref="nativeEventTarget" class="inline-flex">
              <Button variant="outlined" size="36" :disabled="!isListening"><Icon name="askx-objects:pointer" />触发 DOM click</Button>
            </span>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-lg bg-muted/55 p-3">
              <span class="block text-[10px] text-muted-foreground">监听状态</span>
              <strong class="mt-1 block text-sm" :class="isListening ? 'text-success' : 'text-muted-foreground'">{{ isListening ? 'ACTIVE' : 'STOPPED' }}</strong>
            </div>
            <div class="rounded-lg bg-muted/55 p-3">
              <span class="block text-[10px] text-muted-foreground">收到事件</span>
              <strong class="mt-1 block text-sm">{{ receivedCount }}</strong>
            </div>
            <div class="rounded-lg bg-muted/55 p-3">
              <span class="block text-[10px] text-muted-foreground">清理次数</span>
              <strong class="mt-1 block text-sm">{{ cleanupCount }}</strong>
            </div>
          </div>

          <div class="rounded-lg border border-dashed p-3">
            <p v-for="(event, index) in eventLog" :key="`${event}-${index}`" class="font-mono text-[11px] leading-5 text-muted-foreground">{{ event }}</p>
          </div>
        </section>

        <section class="grid content-start gap-3 rounded-xl border bg-card p-4 sm:p-5">
          <div class="flex items-center justify-between gap-3">
            <h5 class="text-sm font-semibold">推荐组合</h5>
            <DemoCopyButton :text="usageCode" />
          </div>
          <code class="whitespace-pre-wrap rounded-lg bg-muted/65 p-3 font-mono text-xs leading-5 text-muted-foreground">{{ usageCode }}</code>
          <Button variant="ghost" size="36" class="justify-self-end" @click="resetStats">重置统计</Button>
        </section>
      </div>
    </article>
  </DemoSection>
</template>
