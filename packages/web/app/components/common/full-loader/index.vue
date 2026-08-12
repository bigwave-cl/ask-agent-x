<script setup lang="ts">
/** 全屏 Loading 属性。 */
const props = withDefaults(defineProps<{ modelValue?: boolean, text?: string }>(), { modelValue: false, text: undefined })
const { t } = useI18n()
let appRootWasInert = false

/** 切换底层应用的焦点和交互能力。 */
function syncAppInert(loading: boolean): void {
    if (!import.meta.client) return
    const appRoot = document.querySelector<HTMLElement>('#__nuxt')
    if (!appRoot) return
    if (loading) {
        appRootWasInert = appRoot.inert
        appRoot.inert = true
        return
    }
    appRoot.inert = appRootWasInert
}

watch(() => props.modelValue, syncAppInert, { immediate: true })
onBeforeUnmount(() => syncAppInert(false))
</script>

<template>
    <Teleport to="body">
        <div
            class="fixed inset-0 z-[100] grid place-items-center bg-background/78 backdrop-blur-sm transition-opacity duration-200"
            :class="modelValue ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'"
            :data-loading="String(modelValue)"
            :aria-hidden="!modelValue"
            :aria-busy="modelValue"
            :inert="!modelValue"
            role="status"
            aria-live="polite"
            data-testid="full-loader"
        >
            <CsInlineLoader
                size="50px"
                :text="text ?? t('common.loading')"
                text-class="text-sm font-medium text-foreground"
            />
        </div>
    </Teleport>
</template>

<style scoped>
[data-loading='false'] :deep(.askx-loader__block) {
  animation-play-state: paused;
}
</style>
