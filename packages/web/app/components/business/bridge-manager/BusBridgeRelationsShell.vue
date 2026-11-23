<script setup lang="ts">
import CsResponsiveOverlayDialogDrawer from '@/components/common/responsive-overlay/DialogDrawer.vue'

/** 关系管理外壳参数。 */
const props = withDefaults(defineProps<{
    /** 是否以内嵌页面形式渲染。 */
    page?: boolean
    /** 页面或弹窗标题。 */
    title: string
    /** 页面或弹窗描述。 */
    description?: string
    /** 关闭按钮文案。 */
    closeLabel: string
}>(), { page: false, description: undefined })
/** 弹窗开关。页面模式下由父组件控制渲染，不使用该状态。 */
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
    <section
        v-if="props.page"
        class="flex h-full min-h-0 flex-col bg-background"
    >
        <header class="shrink-0 border-b px-6 py-5">
            <h1 class="text-lg font-semibold tracking-tight">
                {{ title }}
            </h1>
            <p
                v-if="description"
                class="mt-1 truncate text-sm text-muted-foreground"
            >
                {{ description }}
            </p>
        </header>
        <slot />
        <footer
            v-if="$slots.footer"
            class="shrink-0 border-t px-6 py-4"
        >
            <slot name="footer" />
        </footer>
    </section>
    <CsResponsiveOverlayDialogDrawer
        v-else
        v-model:open="open"
        :title="title"
        :description="description"
        :dialog="{ content: { class: 'h-[min(38rem,90dvh)] sm:max-w-xl' } }"
        :drawer="{ content: { class: 'h-[90dvh]' } }"
        shell-class="h-full min-h-0"
        body-class="min-h-0 flex flex-1 flex-col p-6"
        footer-class="shrink-0 border-t p-4"
        :close-label="closeLabel"
    >
        <slot />
        <template
            v-if="$slots.footer"
            #footer
        >
            <slot name="footer" />
        </template>
    </CsResponsiveOverlayDialogDrawer>
</template>
