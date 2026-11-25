<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue'
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue'

/** Bridge 公共侧边栏参数。 */
withDefaults(defineProps<{ /** 当前是否位于群组和项目管理页。 */ management?: boolean }>(), { management: false })
/** 本地化路由构造器。 */
const localePath = useLocalePath()
/** 公共导航翻译入口。 */
const { t } = useI18n()
/** 公共侧边栏复用桥接设置的动态打开入口。 */
const { openSettings } = useBridgeSettings()
</script>

<template>
    <nav
        class="flex items-center gap-1 border-b px-2 py-2 lg:flex-col lg:border-b-0 lg:border-r lg:px-1.5 lg:py-4"
        :aria-label="t('common.bridgeNav')"
    >
        <Tooltip>
            <TooltipTrigger as-child>
                <Button
                    as-child
                    variant="ghost"
                    :size="42"
                    :square="true"
                    :aria-label="t('common.home')"
                >
                    <NuxtLink :to="localePath('/')"><Icon
                        name="askx-navigation:home-alt"
                        class="size-5"
                        :size="20"
                    /></NuxtLink>
                </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
                {{ t('common.home') }}
            </TooltipContent>
        </Tooltip>
        <Tooltip
            v-for="entry in [
                { key: 'sessions', path: '/bridge', selected: !management, icon: 'askx-objects:chat', label: t('bridge.sessionsNav') },
                { key: 'management', path: '/bridge/management', selected: management, icon: 'askx-objects:project-management', label: t('bridge.managementTitle') },
            ]"
            :key="entry.key"
        >
            <TooltipTrigger as-child>
                <Button
                    as-child
                    variant="ghost"
                    :size="42"
                    :square="true"
                    :aria-label="entry.label"
                    :class="entry.selected ? 'bg-muted text-primary' : ''"
                >
                    <NuxtLink
                        :to="localePath(entry.path)"
                        :aria-current="entry.selected ? 'page' : undefined"
                    ><Icon
                        :name="entry.icon"
                        class="size-5"
                        :size="20"
                    /></NuxtLink>
                </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
                {{ entry.label }}
            </TooltipContent>
        </Tooltip>
        <Tooltip>
            <TooltipTrigger as-child>
                <Button
                    variant="ghost"
                    :size="42"
                    :square="true"
                    class="ml-auto lg:ml-0 lg:mt-auto"
                    :aria-label="t('bridge.serviceSettings')"
                    @click="openSettings()"
                >
                    <Icon
                        name="askx-actions:settings"
                        class="size-5"
                        :size="20"
                    />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
                {{ t('bridge.serviceSettings') }}
            </TooltipContent>
        </Tooltip>
    </nav>
</template>
