<script setup lang="ts">
import TooltipProvider from '@/components/ui/tooltip/TooltipProvider.vue'

/** Bridge 子页面当前路由。 */
const route = useRoute()
/** 本地化路由构造器。 */
const localePath = useLocalePath()
/** 管理页与会话页的公共导航选中状态。 */
const management = computed(() => route.path === localePath('/bridge/management') || route.path.endsWith('/bridge/management'))
provideBridgeServiceControl()
</script>

<template>
    <TooltipProvider :delay-duration="150">
        <div class="grid h-svh min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background text-foreground lg:grid-cols-[4rem_minmax(0,1fr)] lg:grid-rows-1">
            <CsBridgeLayoutSidebar :management="management" />
            <main class="h-full min-h-0 min-w-0">
                <slot />
            </main>
        </div>
    </TooltipProvider>
</template>
