<script setup lang="ts">
import type { ButtonVariants } from '@/components/ui/button'
import type { Component, VNode } from 'vue'
import { defineComponent, isVNode } from 'vue'
import AlertDialog from '@/components/ui/alert-dialog/AlertDialog.vue'
import AlertDialogAction from '@/components/ui/alert-dialog/AlertDialogAction.vue'
import AlertDialogCancel from '@/components/ui/alert-dialog/AlertDialogCancel.vue'
import AlertDialogContent from '@/components/ui/alert-dialog/AlertDialogContent.vue'
import AlertDialogDescription from '@/components/ui/alert-dialog/AlertDialogDescription.vue'
import AlertDialogFooter from '@/components/ui/alert-dialog/AlertDialogFooter.vue'
import AlertDialogHeader from '@/components/ui/alert-dialog/AlertDialogHeader.vue'
import AlertDialogTitle from '@/components/ui/alert-dialog/AlertDialogTitle.vue'

/** 确认操作完成函数。未调用时弹窗保持打开。 */
export type ConfirmDone = () => void
/** 通用确认框配置。 */
export interface ConfirmOptions {
    /** 是否隐藏取消按钮。 */
    hideCancel?: boolean
    /** 标题。 */
    title?: string
    /** 描述文本、Vue 组件或 VNode。 */
    desc?: string | Component | VNode
    /** 取消按钮文案。 */
    cancelText?: string
    /** 确认按钮文案。 */
    okText?: string
    /** 是否禁用确认按钮。 */
    okDisabled?: boolean
    /** 取消按钮样式。 */
    cancelVariant?: ButtonVariants['variant']
    /** 确认按钮样式。 */
    okVariant?: ButtonVariants['variant']
    /** 是否显示关闭图标。 */
    showCloseIcon?: boolean
    /** 内容区域样式。 */
    contentClass?: string
    /** 标题样式。 */
    titleClass?: string
    /** 描述样式。 */
    descClass?: string
    /** 底部区域样式。 */
    footerClass?: string
    /** 操作按钮布局：紧凑右对齐或等宽排列。 */
    actionLayout?: 'compact' | 'equal'
    /** 传给描述组件的属性。 */
    descProps?: Record<string, unknown>
}

/** 将 VNode 作为动态组件内容渲染。 */
const VNodeRenderer = defineComponent({
    name: 'ConfirmVNodeRenderer',
    props: {
        node: { type: Object as () => VNode, required: true },
    },
    setup(props) {
        return () => props.node
    },
})

const props = defineProps<{ onOk?: (done: ConfirmDone) => void | Promise<void>, onCancel?: (done: ConfirmDone) => void | Promise<void>, onAfterClose?: () => void }>()
const { t } = useI18n()
const emit = defineEmits<{ 'update:open': [value: boolean], ok: [done: ConfirmDone], cancel: [done: ConfirmDone], close: [], afterClose: [] }>()
const open = defineModel<boolean>('open', { default: false })
const loading = ref(false)
const handled = ref(false)
const options = reactive<ConfirmOptions>({})
const descComponent = computed(() => options.desc && typeof options.desc !== 'string' && !isVNode(options.desc) ? options.desc : null)
const descVNode = computed(() => options.desc && typeof options.desc !== 'string' && isVNode(options.desc) ? options.desc : null)
const buttonVariant = (variant: ButtonVariants['variant'] | undefined): 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | undefined => {
    if (variant === 'destructive') return 'destructive'
    if (variant === 'secondary' || variant === 'ghost' || variant === 'outline' || variant === 'outlined') return variant === 'outlined' ? 'outline' : variant
    return variant ? 'default' : undefined
}

/** 初始化动态确认框内容。 */
function init(next: ConfirmOptions): void {
    Object.assign(options, next)
    handled.value = false
    loading.value = false
}

/** 关闭确认框并等待卸载回调。 */
function close(): void {
    if (!handled.value) {
        void handleCancel()
        return
    }
    open.value = false
    emit('close')
    setTimeout(() => { emit('afterClose'); props.onAfterClose?.() }, 300)
}

/** 标记完成并关闭。 */
function done(): void {
    handled.value = true
    close()
}

async function handleCancel(): Promise<void> {
    if (loading.value || handled.value) return
    handled.value = true
    const finish = () => { open.value = false; emit('close'); setTimeout(() => { emit('afterClose'); props.onAfterClose?.() }, 300) }
    try { await props.onCancel?.(finish); if (open.value) finish() }
    catch { finish() }
}

async function handleOk(): Promise<void> {
    if (loading.value) return
    handled.value = true
    loading.value = true
    try {
        await props.onOk?.(done)
    }
    catch {
        handled.value = false
    }
    finally {
        loading.value = false
    }
}

function handleOpenChange(value: boolean): void {
    if (!value && open.value && !loading.value) void handleCancel()
    else open.value = value
}

defineExpose({ init, close })
</script>

<template>
    <AlertDialog
        :open="open"
        @update:open="handleOpenChange"
    >
        <AlertDialogContent :class="options.contentClass">
            <AlertDialogHeader>
                <AlertDialogTitle :class="['flex', options.titleClass]">
                    {{ options.title }}
                    <button
                        v-if="options.showCloseIcon !== false"
                        type="button"
                        class="ml-auto text-muted-foreground hover:text-foreground"
                        :disabled="loading"
                        :aria-label="t('common.close')"
                        @click="close"
                    >
                        ×<span class="sr-only">{{ t('common.close') }}</span>
                    </button>
                </AlertDialogTitle>
                <AlertDialogDescription
                    v-if="typeof options.desc === 'string'"
                    :class="['max-w-full break-all', options.descClass]"
                >
                    {{ options.desc }}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div
                v-if="descComponent || descVNode"
                class="min-w-0 text-sm leading-6 text-muted-foreground"
                :class="options.descClass"
            >
                <component
                    :is="descComponent"
                    v-if="descComponent"
                    v-bind="options.descProps"
                />
                <VNodeRenderer
                    v-else-if="descVNode"
                    :node="descVNode"
                />
            </div>
            <AlertDialogFooter :class="[options.actionLayout === 'equal' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : 'flex justify-end gap-3', options.footerClass]">
                <AlertDialogCancel
                    v-if="!options.hideCancel"
                    :disabled="loading"
                    :size="40"
                    :variant="buttonVariant(options.cancelVariant)"
                    :class="['text-sm', options.actionLayout === 'equal' ? 'min-w-0 w-full flex-1' : 'w-auto flex-none']"
                    @click="handleCancel"
                >
                    {{ options.cancelText || t('common.cancel') }}
                </AlertDialogCancel>
                <AlertDialogAction
                    :disabled="loading || options.okDisabled"
                    :size="40"
                    :variant="buttonVariant(options.okVariant)"
                    :class="['text-sm', options.actionLayout === 'equal' ? 'min-w-0 w-full flex-1' : 'w-auto flex-none']"
                    @click="handleOk"
                >
                    {{ options.okText || t('common.confirm') }}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
</template>
