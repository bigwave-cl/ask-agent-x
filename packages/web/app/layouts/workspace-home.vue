<script setup lang="ts">
import type { ScrollAreaInstance } from '@/components/ui/scroll-area'
import { ScrollArea } from '@/components/ui/scroll-area'

/** 首页主滚动区域实例。 */
const workspaceScrollArea = ref<ScrollAreaInstance | null>(null)
</script>

<template>
  <div class="relative h-svh overflow-hidden bg-background text-foreground">
    <div class="pointer-events-none fixed inset-x-0 top-4 z-40 sm:top-5">
      <CsWorkspaceContent class="max-w-[52rem] px-5 sm:px-8 lg:px-10">
        <CsWorkspaceNavigation variant="bar" />
      </CsWorkspaceContent>
    </div>

    <ScrollArea ref="workspaceScrollArea" type="always" class="h-full min-h-0" viewport-class="overscroll-contain" data-testid="workspace-scroll-area">
      <div class="min-h-full">
        <slot />
      </div>
    </ScrollArea>
  </div>
</template>
