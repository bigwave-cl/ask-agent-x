<script setup lang="ts">
import CsResponsiveOverlayDialogDrawer from '@/components/common/responsive-overlay/DialogDrawer.vue'

/** 关系管理外壳参数。 */
const props = withDefaults(defineProps<{
    /** 是否以内嵌页面形式渲染。 */
    page?: boolean
    /** 页面或弹窗标题。 */
    title: string
    /** 页面模式顶部描述文案。 */
    pageEyebrow?: string
    /** 页面或弹窗描述。 */
    description?: string
    /** 关闭按钮文案。 */
    closeLabel: string
}>(), { page: false, pageEyebrow: undefined, description: undefined })
/** 弹窗开关。页面模式下由父组件控制渲染，不使用该状态。 */
const open = defineModel<boolean>('open', { default: false })
/** 管理页品牌入口使用的路由和文案。 */
const localePath = useLocalePath()
const { t } = useI18n()
</script>

<template>
    <section
        v-if="props.page"
        class="flex h-full min-h-0 flex-col bg-background"
    >
        <header class="mx-auto w-full max-w-7xl shrink-0 px-4 pb-4 pt-6 sm:px-6 sm:pb-5 sm:pt-8 lg:px-8">
            <div class="flex flex-wrap items-center gap-3">
                <NuxtLink
                    :to="localePath('/bridge')"
                    class="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    :aria-label="t('bridge.sessionsNav')"
                >
                    <Icon
                        name="askx-navigation:arrow-left"
                        class="size-4"
                    />
                    {{ t('bridge.sessionsNav') }}
                </NuxtLink>
                <span
                    v-if="pageEyebrow"
                    class="text-sm font-medium text-foreground"
                >
                    {{ pageEyebrow }}
                </span>
            </div>
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
        :dialog="{ content: { class: 'h-[min(40rem,90dvh)] sm:max-w-2xl' } }"
        :drawer="{ content: { class: 'h-[90dvh]' } }"
        shell-class="h-full min-h-0"
        header-class="pb-2 md:pb-2"
        body-class="min-h-0 flex flex-1 flex-col px-5 pb-5 pt-2 sm:px-6"
        footer-class="shrink-0 border-t p-4"
        :close-label="closeLabel"
    >
        <div
            v-if="description"
            class="mb-5 flex shrink-0 items-start gap-3 rounded-xl bg-muted/50 px-4 py-3"
        >
            <Icon
                name="askx-objects:users"
                class="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <p class="min-w-0 truncate text-sm font-medium">
                {{ description }}
            </p>
        </div>
        <slot />
        <template
            v-if="$slots.footer"
            #footer
        >
            <slot name="footer" />
        </template>
    </CsResponsiveOverlayDialogDrawer>
</template>
