import type { MaybeRefOrGetter } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'

export type ResponsiveOverlayViewport = 'desktop' | 'mobile' | 'pending'

export function resolveResponsiveOverlayViewport(
  mounted: boolean,
  isDesktop: boolean,
): ResponsiveOverlayViewport {
  if (!mounted) return 'pending'
  return isDesktop ? 'desktop' : 'mobile'
}

export function useResponsiveOverlayViewport(desktopQuery: MaybeRefOrGetter<string>) {
  const mounted = ref(false)
  const desktopMedia = useMediaQuery(desktopQuery)
  const viewport = computed(() => resolveResponsiveOverlayViewport(mounted.value, desktopMedia.value))
  const isPending = computed(() => viewport.value === 'pending')
  const isDesktop = computed(() => viewport.value === 'desktop')
  const isMobile = computed(() => viewport.value === 'mobile')

  onMounted(() => {
    mounted.value = true
  })

  return {
    isDesktop,
    isMobile,
    isPending,
    viewport,
  }
}
