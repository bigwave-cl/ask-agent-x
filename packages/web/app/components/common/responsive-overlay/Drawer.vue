<script setup lang="ts">
import Drawer from '@/components/ui/drawer/Drawer.vue'
import DrawerContent from '@/components/ui/drawer/DrawerContent.vue'
import DrawerTrigger from '@/components/ui/drawer/DrawerTrigger.vue'
import { getDrawerOptions, responsiveOverlayShellDefaults } from './overlayOptions'
import ResponsiveOverlayShell from './Shell.vue'
import type { ResponsiveOverlayDrawerProps, ResponsiveOverlaySlotProps } from './types'

defineOptions({ name: 'ResponsiveOverlayDrawer' })

const props = withDefaults(defineProps<ResponsiveOverlayDrawerProps>(), {
    ...responsiveOverlayShellDefaults,
    dismissible: true,
    drawer: undefined,
    isMobile: true,
})
const open = defineModel<boolean>('open', { default: false })

/** 弹层显示状态及退出完成事件。 */
const emit = defineEmits<{
    /** 内容退出完成或关闭态展示被拆除后，通知调用方释放资源。 */
    afterClose: []
    close: []
    hide: []
    show: []
    'top-left': []
}>()

defineSlots<{
    default?: (props: ResponsiveOverlaySlotProps) => unknown
    footer?: (props: ResponsiveOverlaySlotProps) => unknown
    header?: (props: ResponsiveOverlaySlotProps) => unknown
    title?: (props: ResponsiveOverlaySlotProps) => unknown
    trigger?: (props: ResponsiveOverlaySlotProps) => unknown
    'top-left'?: (props: ResponsiveOverlaySlotProps) => unknown
}>()

const drawerOptions = computed(() => getDrawerOptions(props.drawer))
const slotProps = computed<ResponsiveOverlaySlotProps>(() => ({
    close: closeOverlay,
    isMobile: props.isMobile,
    mode: 'drawer',
    open: open.value,
    topLeft: () => emit('top-left'),
}))

/** 内容退出完成或关闭态展示被拆除时通知调用方；打开态响应式切换不触发。 */
function afterLeave(): void {
    if (!open.value) emit('afterClose')
}

// 响应式展示分支在退出动画期间被拆除时，也必须完成关闭资源释放。
onBeforeUnmount(afterLeave)

function updateOpen(value: boolean) {
    open.value = value
}

function openOverlay() {
    open.value = true
}

function closeOverlay() {
    open.value = false
}

function toggleOverlay() {
    open.value = !open.value
}

watch(open, (next, previous) => {
    if (next && !previous) emit('show')
    if (!next && previous) {
        emit('hide')
        emit('close')
    }
})

defineExpose({ close: closeOverlay, open: openOverlay, toggle: toggleOverlay })
</script>

<template>
    <Drawer
        v-bind="drawerOptions.root"
        :open="open"
        :dismissible="dismissible"
        @update:open="updateOpen"
    >
        <DrawerTrigger
            v-if="$slots.trigger"
            as-child
        >
            <slot
                name="trigger"
                v-bind="slotProps"
            />
        </DrawerTrigger>
        <DrawerContent
            v-bind="drawerOptions.content"
            @after-leave="afterLeave"
        >
            <ResponsiveOverlayShell
                mode="drawer"
                :is-mobile="isMobile"
                :open="open"
                :title="title"
                :description="description"
                :show-header="showHeader"
                :show-top-left="showTopLeft"
                :top-left-disabled="topLeftDisabled"
                :top-left-label="topLeftLabel"
                :show-close="showClose"
                :close-disabled="closeDisabled"
                :close-label="closeLabel"
                :shell-class="shellClass"
                :header-class="headerClass"
                :title-class="titleClass"
                :description-class="descriptionClass"
                :body-class="bodyClass"
                :footer-class="footerClass"
                :top-left-button-class="topLeftButtonClass"
                :close-button-class="closeButtonClass"
                @close="closeOverlay"
                @top-left="emit('top-left')"
            >
                <template
                    v-if="$slots.header"
                    #header="props"
                >
                    <slot
                        name="header"
                        v-bind="props"
                    />
                </template>
                <template
                    v-if="$slots.title"
                    #title="props"
                >
                    <slot
                        name="title"
                        v-bind="props"
                    />
                </template>
                <template
                    v-if="$slots['top-left']"
                    #top-left="props"
                >
                    <slot
                        name="top-left"
                        v-bind="props"
                    />
                </template>
                <template #default="props">
                    <slot v-bind="props" />
                </template>
                <template
                    v-if="$slots.footer"
                    #footer="props"
                >
                    <slot
                        name="footer"
                        v-bind="props"
                    />
                </template>
            </ResponsiveOverlayShell>
        </DrawerContent>
    </Drawer>
</template>
