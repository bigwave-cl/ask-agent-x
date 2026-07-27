<script setup lang="ts">
import type { DemoModule, DemoModuleId } from '../catalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

defineOptions({ name: 'DemoSidebar' })

const props = defineProps<{
  modules: DemoModule[]
  activeModuleId: DemoModuleId
}>()

const emit = defineEmits<{ select: [moduleId: DemoModuleId] }>()
const localePath = useLocalePath()
</script>

<template>
  <div class="flex h-full flex-col">
    <NuxtLink :to="localePath('/demo')" class="hidden items-center gap-3 lg:flex">
      <BrandMark class="size-10" />
      <span><strong class="block text-sm tracking-tight">AskAgent X</strong><small class="font-mono text-[10px] text-muted-foreground">COMPONENT LAB / 0.1</small></span>
    </NuxtLink>

    <div class="mt-8 lg:mt-12">
      <Badge variant="soft" class="font-mono text-[10px] tracking-[0.12em]"><span class="size-1.5 rounded-full bg-primary" />PUBLIC COMPONENT LAB</Badge>
      <h1 class="mt-5 text-4xl font-semibold tracking-[-0.055em]">UI Demo</h1>
      <p class="mt-3 text-xs leading-5 text-muted-foreground">面向开发与设计验证的公开组件实验室。所有示例直接来自 shadcn UI 目录，无需 Token，也不会读取本地配置。</p>
    </div>

    <nav class="mt-8 grid gap-2" aria-label="Demo 导航">
      <button
        v-for="module in props.modules"
        :key="module.id"
        type="button"
        class="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-2 rounded-xl border px-3 py-3 text-left transition-all"
        :class="module.id === activeModuleId ? 'border-primary/35 bg-primary/8 shadow-[inset_3px_0_0_var(--primary)]' : 'border-transparent hover:border-border hover:bg-muted/55'"
        :aria-current="module.id === activeModuleId ? 'page' : undefined"
        @click="emit('select', module.id)"
      >
        <span class="pt-0.5 font-mono text-[10px] text-muted-foreground">{{ module.index }}</span>
        <span class="min-w-0"><strong class="block text-sm">{{ module.title }}</strong><small class="mt-1.5 block text-[11px] leading-4 text-muted-foreground">{{ module.description }}</small></span>
        <Icon name="askx-status:check" v-if="module.id === activeModuleId" class="mt-0.5 size-3.5 text-primary" />
      </button>
    </nav>

    <div class="mt-auto grid gap-3 pt-8">
      <div class="rounded-xl border border-dashed bg-muted/35 p-3">
        <div class="flex items-center gap-2 text-[11px] font-medium"><Icon name="askx-status:lock" class="size-3.5 text-primary" />无需登录</div>
        <p class="mt-1.5 text-[10px] leading-4 text-muted-foreground">仅展示 UI，不访问受保护 API</p>
      </div>
      <Button as-child variant="soft" size="sm" class="w-full"><NuxtLink :to="localePath('/login')">进入工作台<Icon name="askx-actions:external-link" /></NuxtLink></Button>
    </div>
  </div>
</template>
