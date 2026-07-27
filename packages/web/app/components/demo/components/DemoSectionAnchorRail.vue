<script setup lang="ts">
import type { Ref } from 'vue'
import { Button } from '@/components/ui/button'

defineOptions({ name: 'DemoSectionAnchorRail' })

export interface DemoSectionAnchor {
  secKey: string
  title: string
}

const props = defineProps<{
  anchors: DemoSectionAnchor[]
}>()

const route = useRoute()
const router = useRouter()
const activeSecKeys = ref<string[]>([])
const hoveredSecKey = ref('')
const scrollViewport = inject<Readonly<Ref<HTMLElement | null>>>('demoScrollViewport', ref(null))
let observedViewport: HTMLElement | null = null

function sectionElement(secKey: string) {
  return document.getElementById(secKey)
}

function updateActiveSections() {
  if (!import.meta.client) return
  const viewportRect = scrollViewport.value?.getBoundingClientRect()
  const viewportTop = viewportRect?.top ?? 0
  const viewportBottom = viewportRect?.bottom ?? window.innerHeight
  const visible = props.anchors.filter(({ secKey }) => {
    const rect = sectionElement(secKey)?.getBoundingClientRect()
    return rect && rect.bottom > viewportTop + 96 && rect.top < viewportBottom - 72
  })
  if (visible.length) {
    activeSecKeys.value = visible.map(anchor => anchor.secKey)
    return
  }
  const previous = props.anchors.filter(anchor => (sectionElement(anchor.secKey)?.getBoundingClientRect().top ?? 1) <= viewportTop + 220).at(-1)
  activeSecKeys.value = previous ? [previous.secKey] : props.anchors[0] ? [props.anchors[0].secKey] : []
}

function lineClass(secKey: string, index: number) {
  const hoveredIndex = props.anchors.findIndex(anchor => anchor.secKey === hoveredSecKey.value)
  const distance = Math.abs(index - hoveredIndex)
  const width = hoveredIndex < 0 ? 'w-2' : ['w-7', 'w-5', 'w-3.5'][distance] ?? 'w-2'
  const active = hoveredSecKey.value ? secKey === hoveredSecKey.value : activeSecKeys.value.includes(secKey)
  return [width, active ? 'bg-primary opacity-100' : 'bg-muted-foreground/45 opacity-70']
}

async function setSecKey(secKey?: string) {
  const query = { ...route.query }
  if (secKey) query.secKey = secKey
  else delete query.secKey
  await router.replace({ path: route.path, query })
}

async function scrollToAnchor(secKey: string) {
  activeSecKeys.value = [secKey]
  await setSecKey(secKey)
  await nextTick()
  sectionElement(secKey)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function scrollToTop() {
  await setSecKey()
  scrollViewport.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

watch(() => props.anchors.map(anchor => anchor.secKey).join(','), () => nextTick(updateActiveSections))
watch(scrollViewport, (viewport) => {
  observedViewport?.removeEventListener('scroll', updateActiveSections)
  observedViewport = viewport
  observedViewport?.addEventListener('scroll', updateActiveSections, { passive: true })
  nextTick(updateActiveSections)
}, { flush: 'post' })
onMounted(() => {
  updateActiveSections()
  window.addEventListener('resize', updateActiveSections)
})
onBeforeUnmount(() => {
  observedViewport?.removeEventListener('scroll', updateActiveSections)
  window.removeEventListener('resize', updateActiveSections)
})
</script>

<template>
  <nav v-if="anchors.length" class="fixed bottom-24 right-3 top-24 z-30 hidden w-10 flex-col items-center justify-center lg:flex" aria-label="章节导航">
    <div class="flex max-h-[60vh] flex-col items-end py-2" @mouseleave="hoveredSecKey = ''">
      <button
        v-for="(anchor, index) in anchors"
        :key="anchor.secKey"
        type="button"
        class="group relative flex h-4 w-10 items-center justify-end pr-1"
        :data-sec-key="anchor.secKey"
        :aria-label="`跳转到 ${anchor.title}`"
        :title="anchor.title"
        @mouseenter="hoveredSecKey = anchor.secKey"
        @focus="hoveredSecKey = anchor.secKey"
        @blur="hoveredSecKey = ''"
        @click="scrollToAnchor(anchor.secKey)"
      >
        <span class="h-0.5 rounded-full transition-[width,opacity,background-color]" :class="lineClass(anchor.secKey, index)" />
        <span class="pointer-events-none absolute right-11 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-lg group-hover:block group-focus:block">{{ anchor.title }}</span>
      </button>
    </div>
  </nav>
  <Button
    v-if="anchors.length"
    variant="tertiary"
    size="40"
    square
    shape="pill"
    class="fixed bottom-6 right-4 z-30 hidden shadow-[0_12px_32px_color-mix(in_oklab,var(--primary)_22%,transparent)] lg:inline-flex"
    aria-label="回到顶部"
    title="回到顶部"
    @click="scrollToTop"
  >
    <Icon name="askx-navigation:arrow-up" />
  </Button>
</template>
