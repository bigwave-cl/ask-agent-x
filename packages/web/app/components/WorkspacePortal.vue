<script setup lang="ts">
import type { AskXThemeColor } from '@askx/core'
import { useDocumentVisibility, useEventListener, usePreferredReducedMotion } from '@vueuse/core'

/** 首页可进入的工作台目标。 */
type PortalDestination = 'skills-x' | 'bridge' | 'settings'

/** 保持首页调用方的属性契约。 */
const props = defineProps<{
    /** 已启用的平台数量。 */
    enabledCount: number
    /** 当前配置版本。 */
    revision?: number
    /** 是否启用备份。 */
    backupEnabled: boolean
    /** 当前主题颜色。 */
    themeColor: AskXThemeColor
}>()

/** 立即通知调用方进入目标页面。 */
const emit = defineEmits<{
    /** 用户选择的导航目标。 */
    select: [destination: PortalDestination]
}>()

/** 首页本地化文案。 */
const copy = useMessageSection('portal')
/** 保持现有粒子背景配色。 */
const particleColor = computed(() => props.themeColor === 'rose' ? '#e7659f' : '#31bbc5')
/** 页面不可见时暂停动画并重置视线。 */
const visibility = useDocumentVisibility()
/** 不受入场与姿态变换影响的布局锚点。 */
const logoAnchor = ref<HTMLElement | null>(null)
/** 首次挂载后启动一次入场，不随预览更新。 */
const entered = ref(false)
/** 用户的动态效果偏好。 */
const reducedMotion = usePreferredReducedMotion()
/** 相对 Logo 中心的标准化视线方向。 */
const gaze = ref({
    /** 水平方向，范围为负一到一。 */
    x: 0,
    /** 垂直方向，范围为负一到一。 */
    y: 0,
})
/** 待提交的最新鼠标坐标，同一帧仅消费一次。 */
let pendingPointer: { /** 视口横坐标。 */ x: number, /** 视口纵坐标。 */ y: number } | null = null
/** 事件驱动的单次动画帧，不保持空转循环。 */
let gazeFrame: number | null = null

/** 取消尚未提交的跟随并恢复正面视线。 */
function resetGaze() {
    if (gazeFrame !== null) cancelAnimationFrame(gazeFrame)
    gazeFrame = null
    pendingPointer = null
    gaze.value = { x: 0, y: 0 }
}

/** 在当前帧读取稳定布局，提交最新鼠标方向。 */
function updateGaze() {
    gazeFrame = null
    if (!pendingPointer || !logoAnchor.value || visibility.value === 'hidden' || reducedMotion.value === 'reduce') return
    /** 当前布局容器在视口中的稳定位置。 */
    const bounds = logoAnchor.value.getBoundingClientRect()
    /** 相对中心的水平偏移。 */
    const x = (pendingPointer.x - bounds.left - bounds.width / 2) / 350
    /** 相对中心的垂直偏移。 */
    const y = (pendingPointer.y - bounds.top - bounds.height / 2) / 350
    /** 径向归一化避免对角线追随超过单位范围。 */
    const radius = Math.max(1, Math.hypot(x, y))
    gaze.value = { x: x / radius, y: y / radius }
    pendingPointer = null
}

/** 合并鼠标移动；触控不创建跟随任务。 */
function trackPointer(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || visibility.value === 'hidden' || reducedMotion.value === 'reduce') return
    pendingPointer = { x: event.clientX, y: event.clientY }
    if (gazeFrame === null) gazeFrame = requestAnimationFrame(updateGaze)
}

useEventListener('pointermove', trackPointer, { passive: true })
useEventListener('blur', resetGaze)
useEventListener('pointerout', (event: PointerEvent) => {
    if (!event.relatedTarget) resetGaze()
})
watch([visibility, reducedMotion], resetGaze)
onMounted(() => { entered.value = true })
onBeforeUnmount(resetGaze)
/** 当前获得键盘或点击焦点的目标。 */
const focusedDestination = ref<PortalDestination | null>(null)
/** 指针当前悬停的目标。 */
const hoveredDestination = ref<PortalDestination | null>(null)
/** 最近一次有效交互；空值表示首页空闲。 */
const previewTarget = ref<PortalDestination | null>(null)
/** 空闲时仍显示技能入口介绍。 */
const previewDestination = computed(() => previewTarget.value ?? 'skills-x')
/** 导航目标对应的品牌表情，只负责接线。 */
const expressions = {
    /** 技能入口展现好奇与兴奋。 */
    'skills-x': 'curious',
    /** 中继入口展现交流状态。 */
    bridge: 'speaking',
    /** 设置入口展现专注状态。 */
    settings: 'focused',
} as const
/** 表情与说明、高亮共用同一预览状态。 */
const expression = computed(() => previewTarget.value ? expressions[previewTarget.value] : 'idle')

/** 记录最新焦点或鼠标交互，立即更新预览。 */
function preview(destination: PortalDestination, source: 'focus' | 'pointer') {
    if (source === 'focus') focusedDestination.value = destination
    else hoveredDestination.value = destination
    previewTarget.value = destination
}

/** 指针离开后恢复仍存在的焦点，否则回到空闲。 */
function leavePointer() {
    hoveredDestination.value = null
    previewTarget.value = focusedDestination.value
}

/** 焦点离开后恢复仍存在的悬停，否则回到空闲。 */
function leaveFocus() {
    focusedDestination.value = null
    previewTarget.value = hoveredDestination.value
}
/** 菜单预览的单一数据来源。 */
const portals = computed<Array<{
    /** 导航目标标识。 */
    id: PortalDestination
    /** 菜单名称。 */
    title: string
    /** 目标的简短介绍。 */
    description: string
}>>(() => [
    { id: 'skills-x', title: copy.value.skillsTitle, description: copy.value.skillsDescription },
    { id: 'bridge', title: copy.value.bridgeTitle, description: copy.value.bridgeDescription },
    { id: 'settings', title: copy.value.settingsTitle, description: copy.value.settingsDescription },
])
/** 当前目标的介绍，不触发请求或延迟导航。 */
const previewDescription = computed(() => portals.value.find(portal => portal.id === previewDestination.value)?.description)
</script>

<template>
    <main
        :data-entered="entered"
        :data-paused="visibility === 'hidden'"
        class="relative isolate min-h-svh overflow-hidden [background:radial-gradient(circle_at_20%_5%,color-mix(in_srgb,var(--ds-color-brand-default)_14%,transparent),transparent_34rem),linear-gradient(145deg,var(--background)_15%,color-mix(in_srgb,var(--ds-color-bg-surface-raised)_76%,var(--background))_100%)]"
    >
        <ClientOnly>
            <LazyAntigravityBackground
                :count="190"
                :color="particleColor"
                :magnet-radius="13"
                :ring-radius="9"
                :wave-amplitude="0.85"
            />
        </ClientOnly>

        <div
            class="pointer-events-none absolute -inset-[20%] -z-1 animate-portal-drift opacity-70 blur-[28px] motion-reduce:animate-none [background:radial-gradient(ellipse_at_23%_38%,rgb(100_224_231_/_22%),transparent_27%),radial-gradient(ellipse_at_73%_25%,rgb(255_194_116_/_14%),transparent_23%),radial-gradient(ellipse_at_72%_83%,rgb(242_103_162_/_10%),transparent_22%)]"
            aria-hidden="true"
        />
        <div
            class="pointer-events-none absolute inset-0 -z-1 opacity-20 [background-image:radial-gradient(circle,color-mix(in_srgb,var(--foreground)_28%,transparent)_0.7px,transparent_0.8px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,transparent,black_22%,black_74%,transparent)]"
            aria-hidden="true"
        />

        <CsWorkspaceContent class="relative z-1 min-h-svh pb-7 pt-28 min-[801px]:pt-[clamp(7rem,12vh,8rem)]">
            <section class="mx-auto max-w-[58rem] text-center">
                <Badge
                    variant="outline"
                    class="h-7 gap-1.5 border-primary/30 bg-card/70 text-ds-text-brand shadow-[0_10px_40px_rgb(47_189_199_/_8%)] backdrop-blur-[14px]"
                >
                    <Icon
                        name="askx-status:star"
                        class="size-3"
                    />
                    {{ copy.eyebrow }}
                </Badge>
                <h1 class="mt-6 text-balance text-[clamp(2.65rem,6.5vw,5.7rem)] font-semibold leading-[0.98] tracking-[-0.065em]">
                    {{ copy.title }}
                </h1>
                <p class="mx-auto mt-5 max-w-2xl text-pretty text-[clamp(0.9rem,1.5vw,1.05rem)] leading-7 text-muted-foreground">
                    {{ copy.description }}
                </p>
            </section>

            <section
                class="portal-menu mx-auto mt-[clamp(2.5rem,5vh,3.6rem)] flex min-h-72 flex-col items-center justify-center gap-8 sm:flex-row sm:gap-20"
            >
                <div
                    ref="logoAnchor"
                    class="size-24 shrink-0 sm:size-44"
                    aria-hidden="true"
                >
                    <div class="portal-logo-enter size-full">
                        <BrandMark
                            class="pointer-events-none size-full"
                            :expression="expression"
                            :paused="visibility === 'hidden'"
                            :look-x="gaze.x"
                            :look-y="gaze.y"
                        />
                    </div>
                </div>
                <div class="w-full max-w-[280px] sm:w-[216px] sm:max-w-none">
                    <nav
                        class="grid gap-2"
                        :aria-label="copy.destinations"
                        @pointerleave="leavePointer"
                    >
                        <button
                            v-for="(portal, index) in portals"
                            :key="portal.id"
                            type="button"
                            class="portal-row-enter h-12 rounded-xl px-4 text-left text-xl font-medium outline-none transition-colors duration-180 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
                            :class="previewDestination === portal.id ? 'bg-muted text-foreground' : 'text-muted-foreground'"
                            :data-testid="`portal-${portal.id}`"
                            :style="{ '--entry-delay': `${180 + index * 90}ms` }"
                            @pointerenter="$event.pointerType === 'mouse' && preview(portal.id, 'pointer')"
                            @focus="preview(portal.id, 'focus')"
                            @blur="leaveFocus"
                            @click="emit('select', portal.id)"
                        >
                            {{ portal.title }}
                        </button>
                    </nav>
                    <p class="portal-description-enter mt-5 min-h-[4.5rem] px-4 text-sm leading-6 text-muted-foreground">
                        {{ previewDescription }}
                    </p>
                </div>
            </section>

            <footer class="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[0.68rem] text-muted-foreground">
                <span class="inline-flex items-center gap-1.5"><i class="size-1.5 rounded-full bg-success shadow-[0_0_0_4px_var(--success-soft)]" />{{ copy.connected }}</span>
                <span
                    v-if="backupEnabled"
                    class="inline-flex items-center gap-1.5"
                ><Icon
                    name="askx-status:lock"
                    class="size-3 text-success"
                />{{ copy.protected }}</span>
                <span class="inline-flex items-center gap-1.5">{{ copy.private }}</span>
            </footer>
        </CsWorkspaceContent>
    </main>
</template>

<style scoped>
.portal-logo-enter, .portal-row-enter, .portal-description-enter {
    opacity: 0;
}

[data-entered="true"] .portal-logo-enter {
    animation: portal-logo-enter 600ms cubic-bezier(0.2, 0.8, 0.3, 1.12) both;
}

[data-entered="true"] .portal-row-enter {
    animation: portal-row-enter 400ms ease-out var(--entry-delay) both;
}

[data-entered="true"] .portal-description-enter {
    animation: portal-description-enter 400ms ease-out 450ms both;
}

[data-entered] .portal-row-enter:focus {
    opacity: 1 !important;
    transform: none !important;
}

[data-paused="true"] .portal-logo-enter,
[data-paused="true"] .portal-row-enter,
[data-paused="true"] .portal-description-enter {
    animation-play-state: paused;
}

@keyframes portal-logo-enter {
    from { opacity: 0; transform: translateY(12px) scale(0.85); }
    to { opacity: 1; transform: none; }
}

@keyframes portal-row-enter {
    from { opacity: 0; transform: translateX(12px); }
    to { opacity: 1; transform: none; }
}

@keyframes portal-description-enter {
    from { opacity: 0; }
    to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
    [data-entered] .portal-logo-enter,
    [data-entered] .portal-row-enter,
    [data-entered] .portal-description-enter { animation: none; opacity: 1; }
}
</style>
