<script setup lang="ts">
import type { Component } from 'vue'
import type { DemoSectionAnchor } from './components/DemoSectionAnchorRail.vue'
import type { DemoLocale, DemoModuleId } from './catalog'
import type { LocationQueryRaw, LocationQueryValue } from 'vue-router'
import { BookOpen } from '@lucide/vue'
import DemoNavigation from './components/DemoNavigation.vue'
import DemoSectionAnchorRail from './components/DemoSectionAnchorRail.vue'
import { getDemoModule, demoModules } from './catalog'

defineOptions({ name: 'LocalDemoShell' })

const messages = {
  'zh-CN': {
    title: 'UI Demo', source: '当前源码', footer: 'AskAgent X · Local UI specimen', pipeline: 'components/ui → demo', loading: '正在载入 Demo 模块…', loadFailed: '模块载入失败，请刷新后重试。',
  },
  en: {
    title: 'UI Demo', source: 'Active source', footer: 'AskAgent X · Local UI specimen', pipeline: 'components/ui → demo', loading: 'Loading demo module…', loadFailed: 'The module failed to load. Refresh and try again.',
  },
} as const

const route = useRoute()
const router = useRouter()
const locale = ref<DemoLocale>('zh-CN')
const activeModuleId = ref<DemoModuleId>(getModuleIdFromQuery())
const activeComponent = shallowRef<Component | null>(null)
const isLoading = ref(false)
const loadFailed = ref(false)
const sectionAnchors = ref<DemoSectionAnchor[]>([])
const resolvedSecKey = ref('')
let activeLoadId = 0

const copy = computed(() => messages[locale.value])
const activeModule = computed(() => getDemoModule(activeModuleId.value))
const demoSectionReady = computed(() => !isLoading.value && Boolean(activeComponent.value))

provide('demoSectionReady', demoSectionReady)
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
  title: `${activeModule.value.title[locale.value]} · AskAgent X`,
  htmlAttrs: { lang: locale.value },
  bodyAttrs: { class: 'bg-background text-foreground' },
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
  return router.replace({ path: '/demo', query })
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
  void selectModule(getModuleIdFromQuery(), false)
})
</script>

<template>
  <div id="demo-page-top-anchor" class="relative min-h-screen overflow-x-hidden bg-background text-foreground" :data-resolved-section="resolvedSecKey || undefined">
    <div class="pointer-events-none fixed inset-0 opacity-70 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" aria-hidden="true" />
    <div class="pointer-events-none fixed -right-36 -top-36 size-[34rem] rounded-full bg-primary/12 blur-[110px]" aria-hidden="true" />

    <main class="relative mx-auto grid min-h-screen max-w-[1680px] grid-cols-1 pt-16 lg:grid-cols-[19rem_minmax(0,1fr)] lg:pt-0">
      <DemoNavigation
        v-model:locale="locale"
        :modules="demoModules"
        :active-module-id="activeModuleId"
        @select="selectModule"
      />

      <section class="relative min-w-0 px-4 pb-12 pt-7 sm:px-6 lg:px-10 lg:pb-16 lg:pt-12 xl:px-14">
        <header class="mb-7 grid gap-5 border-b pb-7 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div>
            <div class="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-primary"><span>{{ activeModule.index }}</span><span class="h-px w-10 bg-primary/45" />{{ activeModule.groupLabel[locale] }}</div>
            <h1 class="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">{{ activeModule.title[locale] }}</h1>
            <p class="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{{ activeModule.description[locale] }}</p>
          </div>
          <div class="w-fit max-w-full rounded-lg border border-dashed bg-card px-3 py-2 font-mono text-[10px] text-muted-foreground">
            <span class="mr-2 text-primary">{{ copy.source }}</span><span class="break-all">{{ activeModule.sourcePath }}</span>
          </div>
        </header>

        <section class="relative min-h-[32rem] overflow-hidden rounded-2xl border bg-card/80 shadow-[0_24px_90px_rgba(0,0,0,0.08)] backdrop-blur-sm" :aria-busy="isLoading">
          <div v-if="isLoading" class="grid min-h-[32rem] content-start gap-5 p-5 sm:p-7" aria-live="polite">
            <span class="font-mono text-[10px] text-primary">{{ copy.loading }}</span>
            <div class="h-40 animate-pulse rounded-2xl border bg-muted/60" />
            <div class="grid gap-3 sm:grid-cols-2"><div v-for="item in 4" :key="item" class="h-24 animate-pulse rounded-xl bg-muted/45" /></div>
          </div>
          <div v-else-if="loadFailed" class="grid min-h-[32rem] place-items-center p-8 text-center text-sm text-muted-foreground">{{ copy.loadFailed }}</div>
          <component :is="activeComponent" v-else-if="activeComponent" :locale="locale" />
        </section>

        <footer class="mt-6 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] text-muted-foreground">
          <span>{{ copy.footer }}</span>
          <span class="inline-flex items-center gap-1.5"><BookOpen class="size-3" />{{ copy.pipeline }}</span>
        </footer>
      </section>
    </main>

    <DemoSectionAnchorRail :anchors="sectionAnchors" :locale="locale" />
  </div>
</template>
