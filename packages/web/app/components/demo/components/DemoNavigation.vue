<script setup lang="ts">
import type { DemoLocale, DemoModule, DemoModuleId } from '../catalog'
import { Languages, Menu, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import DemoSidebar from './DemoSidebar.vue'

defineOptions({ name: 'DemoNavigation' })

defineProps<{
  modules: DemoModule[]
  activeModuleId: DemoModuleId
}>()

const locale = defineModel<DemoLocale>('locale', { required: true })
const emit = defineEmits<{ select: [moduleId: DemoModuleId] }>()
const mobileMenuOpen = ref(false)

const labels = computed(() => locale.value === 'zh-CN'
  ? { language: '切换语言', openMenu: '打开导航', closeMenu: '关闭导航' }
  : { language: 'Switch language', openMenu: 'Open navigation', closeMenu: 'Close navigation' })

function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en' : 'zh-CN'
}

function handleModuleSelect(moduleId: DemoModuleId) {
  mobileMenuOpen.value = false
  emit('select', moduleId)
}
</script>

<template>
  <header class="fixed inset-x-0 top-0 z-40 border-b bg-background/88 backdrop-blur-xl lg:hidden">
    <div class="flex h-16 items-center gap-3 px-4 sm:px-6">
      <Button variant="ghost" size="icon" :aria-label="mobileMenuOpen ? labels.closeMenu : labels.openMenu" @click="mobileMenuOpen = !mobileMenuOpen">
        <X v-if="mobileMenuOpen" />
        <Menu v-else />
      </Button>
      <NuxtLink to="/demo" class="flex min-w-0 flex-1 items-center gap-2.5">
        <BrandMark class="size-8 shrink-0" />
        <strong class="truncate text-sm">AskAgent X / Demo</strong>
      </NuxtLink>
      <Button variant="ghost" size="icon" :aria-label="labels.language" @click="toggleLocale"><Languages /></Button>
    </div>
  </header>

  <aside
    class="fixed inset-x-0 bottom-0 top-16 z-30 overflow-y-auto border-r bg-background/98 p-5 backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:block lg:h-screen lg:translate-x-0 lg:bg-card/75 lg:p-7"
    :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
    aria-label="Demo modules"
  >
    <DemoSidebar
      v-model:locale="locale"
      :modules="modules"
      :active-module-id="activeModuleId"
      @select="handleModuleSelect"
    />
  </aside>
</template>
