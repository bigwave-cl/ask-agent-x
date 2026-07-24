<script setup lang="ts">
import type { DemoModule, DemoModuleId } from '../catalog'
import { Menu, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import DemoSidebar from './DemoSidebar.vue'

defineOptions({ name: 'DemoNavigation' })

defineProps<{
  modules: DemoModule[]
  activeModuleId: DemoModuleId
}>()

const emit = defineEmits<{ select: [moduleId: DemoModuleId] }>()
const mobileMenuOpen = ref(false)
const localePath = useLocalePath()

function handleModuleSelect(moduleId: DemoModuleId) {
  mobileMenuOpen.value = false
  emit('select', moduleId)
}
</script>

<template>
  <header class="fixed inset-x-0 top-0 z-40 border-b bg-background/88 backdrop-blur-xl lg:hidden">
    <div class="flex h-16 items-center gap-3 px-4 sm:px-6">
      <Button variant="ghost" size="icon" :aria-label="mobileMenuOpen ? '关闭导航' : '打开导航'" @click="mobileMenuOpen = !mobileMenuOpen">
        <X v-if="mobileMenuOpen" />
        <Menu v-else />
      </Button>
      <NuxtLink :to="localePath('/demo')" class="flex min-w-0 flex-1 items-center gap-2.5">
        <BrandMark class="size-8 shrink-0" />
        <strong class="truncate text-sm">AskAgent X / Demo</strong>
      </NuxtLink>
    </div>
  </header>

  <aside
    class="fixed inset-x-0 bottom-0 top-16 z-30 border-r bg-background/98 backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:block lg:h-screen lg:translate-x-0 lg:bg-card/75"
    :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
    aria-label="Demo 导航"
  >
    <ScrollArea class="h-full" viewport-class="overscroll-contain" aria-label="Demo 导航滚动区域">
      <div class="min-h-full p-5 lg:p-7">
        <DemoSidebar
          :modules="modules"
          :active-module-id="activeModuleId"
          @select="handleModuleSelect"
        />
      </div>
    </ScrollArea>
  </aside>
</template>
