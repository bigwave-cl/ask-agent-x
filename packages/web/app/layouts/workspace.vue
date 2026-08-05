<script setup lang="ts">
import type { ScrollAreaInstance } from '@/components/ui/scroll-area'
import { ScrollArea } from '@/components/ui/scroll-area'

const route = useRoute()
const localePath = useLocalePath()
const commonMessages = useMessageSection('common')
const copy = computed(() => ({
  ...commonMessages.value,
}))
/** 工作台主滚动区域实例。 */
const workspaceScrollArea = ref<ScrollAreaInstance | null>(null)

watch(
  () => route.path,
  () => nextTick(() => workspaceScrollArea.value?.scrollTo({ top: 0, behavior: 'auto' })),
)
</script>

<template>
  <div class="relative h-svh overflow-hidden bg-background text-foreground">
    <div class="pointer-events-none fixed inset-x-0 bottom-4 z-40 sm:bottom-5">
      <CsWorkspaceContent class="flex justify-end">
        <CsWorkspaceNavigation />
      </CsWorkspaceContent>
    </div>

    <ScrollArea ref="workspaceScrollArea" type="always" class="h-full min-h-0" viewport-class="overscroll-contain" data-testid="workspace-scroll-area">
      <div class="min-h-full">
        <slot />

        <footer v-if="route.path !== localePath('/')" data-testid="workspace-footer" class="border-t bg-card/50">
          <CsWorkspaceContent class="flex flex-col gap-2 pb-28 pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:py-5 sm:pr-64">
            <span class="font-medium text-foreground">AskAgent X <span class="font-normal text-muted-foreground">/ 26.805.1</span></span>
            <span class="flex items-center gap-1.5"><Icon name="askx-status:lock" class="size-3" />{{ copy.footer }}</span>
          </CsWorkspaceContent>
        </footer>
      </div>
    </ScrollArea>
  </div>
</template>
