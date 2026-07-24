<script setup lang="ts">
import type { Component } from 'vue'
import type { DemoSectionAnchor } from './components/DemoSectionAnchorRail.vue'
import type { DemoModuleId } from './catalog'
import type { ScrollAreaInstance } from '@/components/ui/scroll-area'
import type { LocationQueryRaw, LocationQueryValue } from 'vue-router'
import { BookOpen } from '@lucide/vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import DemoNavigation from './components/DemoNavigation.vue'
import DemoSectionAnchorRail from './components/DemoSectionAnchorRail.vue'
import { getDemoModule, demoModules } from './catalog'

defineOptions({ name: 'LocalDemoShell' })

const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()
const activeModuleId = ref<DemoModuleId>(getModuleIdFromQuery())
const activeComponent = shallowRef<Component | null>(null)
const isLoading = ref(false)
const loadFailed = ref(false)
const sectionAnchors = ref<DemoSectionAnchor[]>([])
const resolvedSecKey = ref('')
const contentScrollArea = ref<ScrollAreaInstance | null>(null)
const contentScrollViewport = shallowRef<HTMLElement | null>(null)
let activeLoadId = 0

const activeModule = computed(() => getDemoModule(activeModuleId.value))
const demoSectionReady = computed(() => !isLoading.value && Boolean(activeComponent.value))

provide('demoSectionReady', demoSectionReady)
provide('demoScrollViewport', readonly(contentScrollViewport))
provide('notifyDemoSecKeyReady', (secKey: string) => { resolvedSecKey.value = secKey })
provide('registerDemoSectionAnchor', (anchor: DemoSectionAnchor) => {
  const existingIndex = sectionAnchors.value.findIndex(item => item.secKey === anchor.secKey)
  if (existingIndex >= 0) sectionAnchors.value.splice(existingIndex, 1, anchor)
  else sectionAnchors.value.push(anchor)
  return () => {
    const index = sectionAnchors.value.findIndex(item => item.secKey === anchor.secKey)
    if (index >= 0) sectionAnchors.value.splice(index, 1)
  }
})

useHead(() => ({
  title: `${activeModule.value.title} · AskAgent X`,
}))

function getQueryValue(value?: LocationQueryValue | LocationQueryValue[]) {
  return Array.isArray(value) ? value[0] : value
}

function getModuleIdFromQuery(): DemoModuleId {
  return getDemoModule(getQueryValue(route.query.module)).id
}

function updateModuleQuery(moduleId: DemoModuleId) {
  const query: LocationQueryRaw = { ...route.query, module: moduleId }
  delete query.secKey
  return router.replace({ path: localePath('/demo'), query })
}

async function selectModule(moduleId: DemoModuleId, updateQuery = true) {
  const moduleItem = getDemoModule(moduleId)

  if (updateQuery) void updateModuleQuery(moduleItem.id)
  if (moduleItem.id === activeModuleId.value && (activeComponent.value || isLoading.value)) return

  const loadId = activeLoadId + 1
  activeLoadId = loadId
  activeModuleId.value = moduleItem.id
  activeComponent.value = null
  isLoading.value = true
  loadFailed.value = false
  sectionAnchors.value = []
  resolvedSecKey.value = ''

  try {
    const loadedModule = await moduleItem.loader()
    if (loadId !== activeLoadId) return
    activeComponent.value = markRaw(loadedModule.default)
    await nextTick()
    if (!getQueryValue(route.query.secKey)) contentScrollArea.value?.scrollTo({ top: 0, behavior: 'auto' })
  } catch {
    if (loadId !== activeLoadId) return
    loadFailed.value = true
  } finally {
    if (loadId === activeLoadId) isLoading.value = false
  }
}

watch(() => route.query.module, () => {
  const nextModuleId = getModuleIdFromQuery()
  if (nextModuleId !== activeModuleId.value) void selectModule(nextModuleId, false)
})

onMounted(() => {
  contentScrollViewport.value = contentScrollArea.value?.getViewportElement() ?? null
  void selectModule(getModuleIdFromQuery(), false)
})
</script>

<template>
  <div id="demo-page-top-anchor" class="relative h-svh overflow-hidden bg-background text-foreground" :data-resolved-section="resolvedSecKey || undefined">
    <div class="pointer-events-none fixed inset-0 opacity-70 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" aria-hidden="true" />
    <div class="pointer-events-none fixed -right-36 -top-36 size-[34rem] rounded-full bg-primary/12 blur-[110px]" aria-hidden="true" />

    <main class="relative grid h-svh w-full grid-cols-1 pt-16 lg:grid-cols-[19rem_minmax(0,1fr)] lg:pt-0">
      <DemoNavigation
        :modules="demoModules"
        :active-module-id="activeModuleId"
        @select="selectModule"
      />

      <ScrollArea
        ref="contentScrollArea"
        type="always"
        class="h-full min-h-0 min-w-0"
        viewport-class="overscroll-contain"
        aria-label="Demo 内容滚动区域"
      >
        <section class="relative w-full max-w-[1376px] min-w-0 px-4 pb-12 pt-7 sm:px-6 lg:px-10 lg:pb-16 lg:pt-12 xl:px-14">
          <header class="mb-7 grid gap-5 border-b pb-7 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div>
              <div class="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-primary"><span>{{ activeModule.index }}</span><span class="h-px w-10 bg-primary/45" />{{ activeModule.groupLabel }}</div>
              <h1 class="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">{{ activeModule.title }}</h1>
              <p class="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{{ activeModule.description }}</p>
            </div>
            <div class="w-fit max-w-full rounded-lg border border-dashed bg-card px-3 py-2 font-mono text-[10px] text-muted-foreground">
              <span class="mr-2 text-primary">当前源码</span><span class="break-all">{{ activeModule.sourcePath }}</span>
            </div>
          </header>

          <section class="relative min-h-[32rem] overflow-hidden rounded-2xl border bg-card/80 shadow-[0_24px_90px_rgba(0,0,0,0.08)] backdrop-blur-sm" :aria-busy="isLoading">
            <div v-if="isLoading" class="grid min-h-[32rem] content-start gap-5 p-5 sm:p-7" aria-live="polite">
              <span class="font-mono text-[10px] text-primary">正在载入 Demo 模块…</span>
              <div class="h-40 animate-pulse rounded-2xl border bg-muted/60" />
              <div class="grid gap-3 sm:grid-cols-2"><div v-for="item in 4" :key="item" class="h-24 animate-pulse rounded-xl bg-muted/45" /></div>
            </div>
            <div v-else-if="loadFailed" class="grid min-h-[32rem] place-items-center p-8 text-center text-sm text-muted-foreground">模块载入失败，请刷新后重试。</div>
            <component :is="activeComponent" v-else-if="activeComponent" />
          </section>

          <footer class="mt-6 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] text-muted-foreground">
            <span>AskAgent X · Local UI specimen</span>
            <span class="inline-flex items-center gap-1.5"><BookOpen class="size-3" />components/ui → demo</span>
          </footer>
        </section>
      </ScrollArea>
    </main>

    <DemoSectionAnchorRail :anchors="sectionAnchors" />
  </div>
</template>
