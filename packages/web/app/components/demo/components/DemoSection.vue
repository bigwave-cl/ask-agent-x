<script setup lang="ts">
import type { Ref } from 'vue'
import { Button } from '@/components/ui/button'

defineOptions({ name: 'DemoSection' })

const props = defineProps<{
  title: string
  description?: string
  secKey: string
}>()

const isOpen = defineModel<boolean>({ default: false })
const route = useRoute()
const sectionRef = ref<HTMLElement | null>(null)
const isDemoSectionReady = inject<Readonly<Ref<boolean>>>('demoSectionReady', ref(true))
const scrollViewport = inject<Readonly<Ref<HTMLElement | null>>>('demoScrollViewport', ref(null))
const notifyDemoSecKeyReady = inject<(secKey: string) => void>('notifyDemoSecKeyReady', () => {})
const registerAnchor = inject<(anchor: { secKey: string, title: string }) => () => void>('registerDemoSectionAnchor', () => () => {})
let unregisterAnchor: (() => void) | undefined
let hasHandledInitialKey = false
const correctionTimers: ReturnType<typeof setTimeout>[] = []

const accentClass = computed(() => {
  const classes = ['from-primary to-cyan-400', 'from-fuchsia-500 to-primary', 'from-amber-400 to-rose-400', 'from-emerald-400 to-cyan-400']
  const hash = [...props.secKey].reduce((total, character) => total + character.charCodeAt(0), 0)
  return classes[hash % classes.length]
})

function querySecKey() {
  const value = Array.isArray(route.query.secKey) ? route.query.secKey[0] : route.query.secKey
  return value ? String(value) : ''
}

function updateQuery() {
  if (!import.meta.client) return
  const url = new URL(window.location.href)
  url.searchParams.set('secKey', props.secKey)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

function clearCorrectionTimers() {
  correctionTimers.splice(0).forEach(timer => clearTimeout(timer))
}

function scrollElementToTop(element: HTMLElement, behavior: ScrollBehavior) {
  const viewport = scrollViewport.value
  if (!viewport) {
    element.scrollIntoView({ block: 'start', behavior })
    return
  }
  const viewportRect = viewport.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  viewport.scrollTo({
    top: viewport.scrollTop + elementRect.top - viewportRect.top - 20,
    behavior,
  })
}

function scrollToSection() {
  if (!import.meta.client) return
  clearCorrectionTimers()
  nextTick(() => {
    ;[0, 100, 240].forEach((delay, index, delays) => {
      correctionTimers.push(setTimeout(() => {
        if (sectionRef.value) scrollElementToTop(sectionRef.value, 'auto')
        if (index === delays.length - 1) notifyDemoSecKeyReady(props.secKey)
      }, delay))
    })
  })
}

function syncWithQuery(shouldScroll = false) {
  if (querySecKey() !== props.secKey) return
  isOpen.value = true
  if (shouldScroll && isDemoSectionReady.value && !hasHandledInitialKey) {
    hasHandledInitialKey = true
    scrollToSection()
  }
}

function toggleOpen() {
  isOpen.value = !isOpen.value
  updateQuery()
}

function registerCurrentAnchor() {
  unregisterAnchor?.()
  unregisterAnchor = props.secKey ? registerAnchor({ secKey: props.secKey, title: props.title }) : undefined
}

syncWithQuery()

onMounted(() => {
  registerCurrentAnchor()
  syncWithQuery(true)
})

watch(() => [props.secKey, props.title], registerCurrentAnchor, { flush: 'post' })
watch(() => route.query.secKey, () => syncWithQuery(false))
watch(isDemoSectionReady, ready => ready && syncWithQuery(true))

onBeforeUnmount(() => {
  unregisterAnchor?.()
  clearCorrectionTimers()
})
</script>

<template>
  <section :id="secKey" ref="sectionRef" class="scroll-mt-5" :data-demo-section="secKey">
    <Button
      type="button"
      variant="ghost"
      class="group h-auto min-h-16 w-full justify-start border border-border/70 bg-background/82 p-3 text-left shadow-[0_8px_30px_rgba(0,0,0,0.035)] hover:-translate-y-px hover:border-primary/20 hover:bg-muted/45 sm:p-4"
      :aria-expanded="isOpen"
      :aria-controls="`${secKey}-content`"
      @click="toggleOpen"
    >
      <span class="flex w-full items-center justify-between gap-5">
        <span class="min-w-0">
          <strong class="block text-base tracking-[-0.02em] sm:text-lg">{{ title }}</strong>
          <span v-if="description" class="mt-1 block whitespace-normal text-xs font-normal leading-5 text-muted-foreground">{{ description }}</span>
          <span class="mt-3 block h-1 w-20 rounded-full bg-gradient-to-r" :class="accentClass" aria-hidden="true" />
        </span>
        <Icon name="askx-navigation:chevron-down" class="size-4 shrink-0 text-muted-foreground transition-transform duration-200" :class="isOpen ? 'rotate-180' : ''" />
      </span>
    </Button>

    <div
      :id="`${secKey}-content`"
      class="grid overflow-hidden transition-[grid-template-rows] duration-300"
      :class="isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
    >
      <div class="min-h-0 min-w-0 pt-2">
        <slot />
      </div>
    </div>
  </section>
</template>
