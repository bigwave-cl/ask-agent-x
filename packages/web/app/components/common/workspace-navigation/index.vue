<script setup lang="ts">
import type { AskxIconName } from '@/lib/iconCatalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useResponsiveOverlayViewport } from '../responsive-overlay/useResponsiveOverlayViewport'

defineOptions({ name: 'WorkspaceNavigation' })

/** 工作台导航触发器形态。 */
type WorkspaceNavigationVariant = 'bar' | 'signal'

/** 工作台导航属性。 */
interface WorkspaceNavigationProps {
  /** 导航触发器形态：首页使用顶部工具条，子页面使用右下角信标。 */
  variant?: WorkspaceNavigationVariant
}

const props = withDefaults(defineProps<WorkspaceNavigationProps>(), {
  variant: 'signal',
})

/** 工作台导航项。 */
interface WorkspaceNavigationItem {
  /** 导航序号。 */
  index: string
  /** 目标业务路径。 */
  path: '/' | '/demo' | '/skills-x' | '/theme' | '/settings'
  /** 本地图标名称。 */
  icon: AskxIconName
  /** 标题翻译键。 */
  titleKey: string
  /** 描述翻译键。 */
  descriptionKey: string
}

/** 当前路由。 */
const route = useRoute()
/** 本地化路径生成器。 */
const localePath = useLocalePath()
/** 工作台导航文案。 */
const { t } = useI18n()
/** 导航抽屉开关状态。 */
const open = ref(false)
/** 响应式导航断点。 */
const { isDesktop } = useResponsiveOverlayViewport('(min-width: 768px)')
/** 当前抽屉展开方向。 */
const drawerDirection = computed(() => isDesktop.value ? 'left' : 'bottom')
/** 工作台导航配置。 */
const navigationItems: WorkspaceNavigationItem[] = [
  {
    index: '00',
    path: '/',
    icon: 'askx-objects:layout',
    titleKey: 'layout.homeTitle',
    descriptionKey: 'layout.homeDescription',
  },
  {
    index: '01',
    path: '/skills-x',
    icon: 'askx-objects:agent',
    titleKey: 'common.skillsNav',
    descriptionKey: 'layout.skillsDescription',
  },
  {
    index: '02',
    path: '/theme',
    icon: 'askx-objects:palette',
    titleKey: 'common.themeNav',
    descriptionKey: 'layout.themeDescription',
  },
  {
    index: '03',
    path: '/settings',
    icon: 'askx-actions:settings',
    titleKey: 'common.settingsNav',
    descriptionKey: 'layout.settingsDescription',
  },
  {
    index: '04',
    path: '/demo',
    icon: 'askx-objects:model',
    titleKey: 'common.demoNav',
    descriptionKey: 'layout.demoDescription',
  },
]

/**
 * 判断导航项是否对应当前路由。
 * @param path 业务路径。
 * @returns 当前路由命中时返回 true。
 */
function isActive(path: WorkspaceNavigationItem['path']) {
  const localizedPath = localePath(path)
  if (path === '/') return route.path === localizedPath
  return route.path === localizedPath || route.path.startsWith(`${localizedPath}/`)
}

/** 关闭工作台导航。 */
function closeNavigation() {
  open.value = false
}
</script>

<template>
  <Drawer
    v-model:open="open"
    :direction="drawerDirection"
    :should-scale-background="false"
    :handle-only="true"
  >
    <div
      v-if="props.variant === 'bar'"
      class="pointer-events-auto relative grid h-[72px] w-full grid-cols-[auto_1fr] items-center gap-5 rounded-[42px] border border-ds-border-subtle-10 bg-ds-bg-surface/88 p-4 shadow-[0_14px_42px_color-mix(in_srgb,var(--ds-color-bw-black)_11%,transparent)] backdrop-blur-xl supports-[backdrop-filter]:bg-ds-bg-surface/76 sm:gap-8"
      data-testid="workspace-navigation-bar"
    >
      <DrawerTrigger as-child>
        <CsSpecialButton
          size="compact"
          tone="ice"
          icon="askx-actions:adjust"
          :aria-label="open ? t('layout.closeNavigation') : t('layout.openNavigation')"
          data-testid="workspace-navigation-trigger"
        />
      </DrawerTrigger>

      <NuxtLink
        :to="localePath('/')"
        class="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-xl px-3 py-1.5 transition-colors hover:bg-ds-fill-bw-transparent-3"
        :aria-label="t('common.home')"
      >
        <BrandMark class="size-9 shrink-0" />
        <strong class="hidden whitespace-nowrap text-sm font-semibold tracking-tight min-[420px]:block">AskAgent X</strong>
      </NuxtLink>

      <Badge variant="outline" class="ml-auto h-10 gap-2.5 rounded-full border-ds-border-subtle-10 bg-ds-fill-bw-transparent-3 px-3.5 font-mono text-[10px] font-medium">
        <span class="size-1.5 shrink-0 rounded-full bg-success shadow-[0_0_0_3px_var(--ds-color-success-soft)]" />
        <span class="hidden sm:inline">127.0.0.1 · {{ t('common.localOnly') }}</span>
        <span class="sr-only sm:hidden">{{ t('common.localOnly') }}</span>
      </Badge>
    </div>

    <DrawerTrigger v-else as-child>
      <CsSpecialButton
        :label="t('layout.menu')"
        :active-label="t('layout.openMenu')"
        :icon="null"
        size="signal"
        tone="ice"
        color="var(--ds-color-special-signal-default)"
        class="pointer-events-auto"
        :aria-label="open ? t('layout.closeNavigation') : t('layout.openMenu')"
        data-testid="workspace-navigation-trigger"
      >
        <template #icon>
          <BrandMark class="size-11 shrink-0" />
        </template>
      </CsSpecialButton>
    </DrawerTrigger>

    <DrawerContent
      class="max-h-[86svh] overflow-hidden rounded-t-3xl border-ds-border-subtle-10 bg-sidebar p-0 shadow-2xl [&>div:first-child]:hidden data-[vaul-drawer-direction=left]:h-svh data-[vaul-drawer-direction=left]:max-h-none data-[vaul-drawer-direction=left]:w-[min(22rem,calc(100vw-1.5rem))] data-[vaul-drawer-direction=left]:rounded-none data-[vaul-drawer-direction=left]:border-y-0 data-[vaul-drawer-direction=left]:border-l-0"
      data-testid="workspace-navigation-drawer"
    >
      <DrawerTitle class="sr-only">{{ t('layout.navigationTitle') }}</DrawerTitle>
      <DrawerDescription class="sr-only">{{ t('layout.navigationDescription') }}</DrawerDescription>

      <ScrollArea class="h-full min-h-0" viewport-class="overscroll-contain" :aria-label="t('layout.navigationTitle')">
        <aside class="flex min-h-full flex-col p-5 sm:p-7">
          <div class="flex items-start justify-between gap-4">
            <NuxtLink :to="localePath('/')" class="flex min-w-0 items-center gap-3" @click="closeNavigation">
              <BrandMark class="size-10 shrink-0" />
              <span class="min-w-0">
                <strong class="block truncate text-sm tracking-tight">AskAgent X</strong>
                <small class="font-mono text-[10px] text-ds-text-helper">LOCAL TOOL / 0.1</small>
              </span>
            </NuxtLink>
            <Button variant="ghost" size="icon-sm" square :aria-label="t('layout.closeNavigation')" @click="closeNavigation">
              <Icon name="askx-actions:close" />
            </Button>
          </div>

          <div class="mt-9">
            <Badge variant="soft" class="font-mono text-[10px] tracking-[0.12em]">
              <span class="size-1.5 rounded-full bg-primary" />
              {{ t('layout.toolBadge') }}
            </Badge>
            <h2 class="mt-5 text-3xl font-semibold tracking-[-0.05em]">{{ t('layout.navigationTitle') }}</h2>
            <p class="mt-3 text-xs leading-5 text-ds-text-helper">{{ t('layout.navigationDescription') }}</p>
          </div>

          <nav class="mt-8 grid gap-2" :aria-label="t('layout.overview')">
            <NuxtLink
              v-for="item in navigationItems"
              :key="item.path"
              :to="localePath(item.path)"
              class="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-2 rounded-xl border px-3 py-3 text-left transition-colors"
              :class="isActive(item.path) ? 'border-ds-border-brand-85 bg-ds-fill-brand-transparent-8 shadow-[inset_3px_0_0_var(--primary)]' : 'border-transparent hover:border-ds-border-subtle-10 hover:bg-ds-fill-bw-transparent-3'"
              :aria-current="isActive(item.path) ? 'page' : undefined"
              @click="closeNavigation"
            >
              <span class="pt-0.5 font-mono text-[10px] text-ds-text-helper">{{ item.index }}</span>
              <span class="min-w-0">
                <strong class="flex items-center gap-2 text-sm font-semibold">
                  <Icon :name="item.icon" class="size-3.5 text-ds-text-tertiary" />
                  {{ t(item.titleKey) }}
                </strong>
                <small class="mt-1.5 block text-[11px] leading-4 text-ds-text-helper">{{ t(item.descriptionKey) }}</small>
              </span>
              <Icon v-if="isActive(item.path)" name="askx-status:check" class="mt-0.5 size-3.5 text-primary" />
            </NuxtLink>
          </nav>

          <div class="mt-auto grid gap-3 pt-8">
            <div class="rounded-xl border border-dashed border-ds-border-subtle-10 bg-ds-fill-bw-transparent-3 p-3">
              <div class="flex items-center gap-2 text-[11px] font-medium">
                <span class="size-1.5 rounded-full bg-success shadow-[0_0_0_3px_var(--ds-color-success-soft)]" />
                127.0.0.1 · {{ t('common.localOnly') }}
              </div>
              <p class="mt-1.5 text-[10px] leading-4 text-ds-text-helper">{{ t('common.footer') }}</p>
            </div>
          </div>
        </aside>
      </ScrollArea>
    </DrawerContent>
  </Drawer>
</template>
