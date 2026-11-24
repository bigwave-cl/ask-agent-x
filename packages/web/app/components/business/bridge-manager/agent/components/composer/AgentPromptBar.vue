<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import { useProvidedAgentCore } from '../../core/useAgentCore'

/** 输入草稿与提交动作统一由 Core 持有。 */
const { draft, submitting, running, canStop, canCompose, connection, send, interrupt } = useProvidedAgentCore()
/** 页面只传入展示上下文。 */
defineProps<{ /** 当前绑定为只读时显示提示。 */ readOnly: boolean, /** 当前项目展示名称。 */ projectName?: string }>()
/** 服务设置交给外部导航。 */
const emit = defineEmits<{ settings: [] }>()
/** DOM 输入及输入法状态。 */
const input = ref<HTMLTextAreaElement | null>(null)
const composing = ref(false)
/** 翻译入口。 */
const { t } = useI18n()
/** 发送资格不等同于传输连接或请求状态。 */
const canSend = computed(() => Boolean(draft.value.trim() && canCompose.value && !submitting.value && !running.value))
/** 输入高度跟随内容，保留 PG 输入区的高度边界。 */
function resize() {
    if (!input.value) return
    input.value.style.height = 'auto'
    input.value.style.height = `${Math.min(218, Math.max(78, input.value.scrollHeight))}px`
}
/** 中文输入法确认不触发发送，Shift+Enter 保留换行。 */
function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !composing.value) {
        event.preventDefault()
        if (canSend.value) send()
    }
}
watch(draft, () => { void nextTick(resize) })
onMounted(resize)
defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
    <div class="shrink-0 px-3 pb-3 pt-2 sm:px-6 sm:pb-5">
        <div class="mx-auto max-w-3xl">
            <div class="mb-2 flex h-5 items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
                <span
                    v-if="projectName"
                    class="flex min-w-0 items-center gap-1.5 truncate"
                ><Icon
                    name="askx-objects:folder"
                    class="shrink-0"
                />{{ projectName }}</span><span v-else />
                <span
                    v-if="connection !== 'connected'"
                    class="flex items-center gap-1.5"
                ><span class="size-1.5 rounded-full bg-muted-foreground/50" />{{ t(`bridge.conversation.${connection}`) }}</span>
                <span
                    v-else-if="running"
                    class="flex items-center gap-1.5"
                ><Icon
                    name="askx-status:loading"
                    class="animate-spin"
                />{{ t('bridge.conversation.inProgress') }}</span>
            </div>
            <form
                class="rounded-2xl border border-border/70 bg-card p-2 shadow-sm transition-[border-color,box-shadow] hover:border-border focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10"
                @submit.prevent="canSend && send()"
            >
                <textarea
                    ref="input"
                    v-model="draft"
                    rows="3"
                    class="block min-h-[78px] max-h-[218px] w-full resize-none border-0 bg-transparent px-3 py-2.5 text-sm leading-[22px] outline-none placeholder:text-muted-foreground/60"
                    :placeholder="readOnly ? t('bridge.readOnlyHint') : t('bridge.chatPlaceholder')"
                    :readonly="readOnly"
                    :aria-label="t('bridge.chatPlaceholder')"
                    @input="resize"
                    @keydown="keydown"
                    @compositionstart="composing = true"
                    @compositionend="composing = false"
                />
                <div class="flex items-center justify-between gap-3 px-1 pb-1 pt-1">
                    <Button
                        type="button"
                        variant="ghost"
                        :size="36"
                        square
                        :aria-label="t('bridge.conversation.serviceSettings')"
                        @click="emit('settings')"
                    >
                        <Icon
                            name="askx-actions:adjust"
                            class="text-muted-foreground"
                        />
                    </Button>
                    <span
                        v-if="readOnly"
                        class="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"
                    ><Icon name="askx-status:lock" />{{ t('bridge.readOnly') }}</span>
                    <Button
                        v-if="canStop"
                        type="button"
                        :size="36"
                        square
                        shape="pill"
                        :aria-label="t('bridge.conversation.stop')"
                        @click="interrupt()"
                    >
                        <Icon
                            name="askx-actions:stop"
                            class="text-white"
                        />
                    </Button>
                    <Button
                        v-else
                        type="submit"
                        :size="36"
                        square
                        shape="pill"
                        :disabled="!canSend"
                        :aria-label="t('bridge.send')"
                    >
                        <Icon
                            :name="submitting ? 'askx-status:loading' : 'askx-navigation:arrow-up'"
                            :class="{ 'animate-spin': submitting }"
                            class="text-white"
                        />
                    </Button>
                </div>
            </form>
        </div>
    </div>
</template>
