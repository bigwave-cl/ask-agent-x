<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

defineOptions({ name: 'DemoMountedCard' })

withDefaults(defineProps<{
  title?: string
  description?: string
}>(), {
  title: '动态组件',
  description: '这个组件由 componentMount 挂载。',
})

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <article data-testid="mounted-card" class="grid gap-4 rounded-xl border bg-background p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
    <div>
      <Badge variant="soft" class="font-mono">APP CONTEXT</Badge>
      <h6 class="mt-3 text-sm font-semibold">{{ title }}</h6>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">{{ description }}</p>
    </div>
    <Button variant="outlined" size="36" @click="emit('action')">触发回调</Button>
  </article>
</template>

