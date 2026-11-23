<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'

/** 标题来自目录 owner，编辑只提交用户意图。 */
const props = defineProps<{ threadId: string, title: string, groupName?: string, rename: (name: string) => Promise<boolean> }>()
/** 内部仅保留编辑草稿与请求状态。 */
const editing = ref(false)
const saving = ref(false)
const composing = ref(false)
const value = ref('')
const field = ref<InstanceType<typeof Input> | null>(null)
/** 输入生命周期。 */
let generation = 0
/** 翻译入口。 */
const { t } = useI18n()
/** 开始编辑时捕获当前标题。 */
function edit() { value.value = props.title; editing.value = true; void nextTick(() => { const element = field.value?.$el as HTMLInputElement | undefined; element?.focus(); element?.select() }) }
/** 只有同一会话仍有效时才结束编辑状态。 */
async function save() {
    if (saving.value || composing.value) return
    const name = value.value.trim()
    if (!name || name === props.title) { editing.value = false; return }
    const current = generation
    saving.value = true
    try { if (await props.rename(name) && current === generation) editing.value = false }
    finally { if (current === generation) saving.value = false }
}
watch(() => props.threadId, () => { generation++; editing.value = false; saving.value = false })
onBeforeUnmount(() => { generation++ })
</script>

<template>
    <header class="flex h-[76px] shrink-0 items-center gap-3 border-b border-border/50 px-4 sm:px-6">
        <span class="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/5 text-primary"><Icon
            name="askx-objects:agent"
            class="size-5"
        /></span>
        <div class="min-w-0 flex-1">
            <p class="mb-1 truncate text-[11px] leading-4 text-muted-foreground">
                {{ groupName || 'AskX Relay' }}
            </p>
            <form
                v-if="editing"
                class="flex max-w-lg items-center gap-2"
                @submit.prevent="save"
            >
                <Input
                    ref="field"
                    v-model="value"
                    :maxlength="256"
                    class="h-8 text-sm"
                    :aria-label="t('bridge.displayName')"
                    :disabled="saving"
                    @compositionstart="composing = true"
                    @compositionend="composing = false"
                    @keydown.esc="editing = false"
                    @blur="save"
                />
                <Icon
                    v-if="saving"
                    name="askx-status:loading"
                    class="shrink-0 animate-spin text-muted-foreground"
                />
            </form>
            <button
                v-else-if="threadId"
                type="button"
                class="group flex max-w-full items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :aria-label="`${t('bridge.rename')} · ${title}`"
                @click="edit"
            >
                <h1 class="truncate text-sm font-semibold leading-[22px]">
                    {{ title }}
                </h1><Icon
                    name="askx-actions:edit"
                    class="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                />
            </button>
            <h1
                v-else
                class="truncate text-sm font-semibold leading-[22px]"
            >
                {{ t('bridge.newSession') }}
            </h1>
        </div>
        <Button
            v-if="editing"
            variant="ghost"
            :size="36"
            square
            :disabled="saving"
            :aria-label="t('common.cancel')"
            @pointerdown.prevent="editing = false"
            @click="editing = false"
        >
            <Icon name="askx-actions:close" />
        </Button>
    </header>
</template>
