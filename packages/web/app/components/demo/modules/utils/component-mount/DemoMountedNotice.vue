<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

defineOptions({ name: 'DemoMountedNotice' })

withDefaults(defineProps<{
  title?: string
  description?: string
}>(), {
  title: '动态通知',
  description: '关闭后 isOpen 变为 false，并触发自动卸载。',
})

const isOpen = ref(true)

function close() {
  isOpen.value = false
}

defineExpose({ isOpen, close })
</script>

<template>
  <aside
    v-if="isOpen"
    data-testid="mounted-notice"
    aria-label="动态挂载通知"
    class="fixed bottom-5 right-5 z-[200] grid w-[min(360px,calc(100vw-40px))] gap-3 rounded-xl border bg-background p-4 shadow-xl"
  >
    <div class="flex items-start justify-between gap-4">
      <div>
        <Badge variant="soft" class="font-mono">AUTO UNMOUNT</Badge>
        <h6 class="mt-3 text-sm font-semibold">{{ title }}</h6>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">{{ description }}</p>
      </div>
      <Button variant="ghost" size="icon" square aria-label="关闭动态通知" @click="close">
        <Icon name="askx-actions:close" />
      </Button>
    </div>
  </aside>
</template>

