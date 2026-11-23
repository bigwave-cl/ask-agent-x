<script setup lang="ts">
import type { BridgeConversationItem } from '@askx/module-feishu-bridge/conversation-contract'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'
import Button from '@/components/ui/button/Button.vue'
import BusBridgeSourceAvatar from './BusBridgeSourceAvatar.vue'
import BusBridgeProcess from './BusBridgeProcess.vue'

/** 消息展示层只消费 owner 快照。 */
const props = defineProps<{ threadId: string, messages: BridgeConversationItem[], loading: boolean, loadingMore: boolean, hasMore: boolean }>()
/** 分页由会话 Core 执行。 */
const emit = defineEmits<{ more: [] }>()
/** 项目滚动组件公开接口。 */
const scroll = ref<InstanceType<typeof ScrollArea> | null>(null)
/** 用户是否正在阅读历史。 */
const pinned = ref(true)
/** 顶部分页的视觉锚点。 */
let anchor: { height: number, top: number } | undefined
/** 当前监听的视口。 */
let viewport: HTMLElement | null = null
/** 本帧布局任务。 */
let frame = 0
/** 翻译入口。 */
const { t } = useI18n()
/** 根据距底部距离判断是否自动跟随。 */
function measure() { if (viewport) pinned.value = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80 }
/** 渲染和折叠完成后，每帧最多校准一次。 */
function resolveLayout() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
        if (!viewport) return
        if (anchor && !props.loadingMore) { viewport.scrollTop = anchor.top + viewport.scrollHeight - anchor.height; anchor = undefined }
        else if (!anchor && pinned.value) viewport.scrollTop = viewport.scrollHeight
    })
}
/** 保持分页前的第一条可见消息位置。 */
function more() {
    if (viewport) anchor = { height: viewport.scrollHeight, top: viewport.scrollTop }
    emit('more')
}
/** 用户主动回到最新消息后恢复跟随。 */
function latest() { pinned.value = true; resolveLayout() }
watch(() => props.threadId, () => { pinned.value = true; anchor = undefined; resolveLayout() })
watch(() => props.messages, () => { void nextTick(resolveLayout) }, { deep: true })
watch(() => props.loadingMore, value => { if (!value) void nextTick(resolveLayout) })
onMounted(() => { viewport = scroll.value?.getViewportElement() ?? null; viewport?.addEventListener('scroll', measure, { passive: true }); resolveLayout() })
onBeforeUnmount(() => { viewport?.removeEventListener('scroll', measure); cancelAnimationFrame(frame) })
</script>

<template>
    <div class="relative flex min-h-0 flex-1 flex-col">
        <ScrollArea
            ref="scroll"
            class="min-h-0 flex-1"
            viewport-class="px-4 py-5 sm:px-6 sm:py-6"
        >
            <div class="mx-auto w-full max-w-3xl space-y-5">
                <div
                    v-if="hasMore"
                    class="flex justify-center"
                >
                    <Button
                        variant="ghost"
                        :size="36"
                        :disabled="loadingMore"
                        @click="more"
                    >
                        <Icon
                            v-if="loadingMore"
                            name="askx-status:loading"
                            class="animate-spin"
                        />{{ t('bridge.conversation.earlier') }}
                    </Button>
                </div>
                <div
                    v-if="loading && !messages.length"
                    class="flex justify-center py-8"
                    role="status"
                    :aria-label="t('bridge.loading')"
                >
                    <Icon
                        name="askx-status:loading"
                        class="size-5 animate-spin text-muted-foreground"
                    />
                </div>
                <article
                    v-for="item in messages"
                    :key="item.id"
                    class="min-w-0"
                    :aria-label="item.role === 'user' ? t('bridge.conversation.userMessage') : t('bridge.conversation.agentMessage')"
                >
                    <div
                        v-if="item.role === 'user'"
                        class="flex items-end justify-end gap-2.5"
                    >
                        <div class="max-w-[85%] rounded-[20px] rounded-br-md bg-muted/70 px-4 py-3 text-sm leading-[22px]">
                            <p class="whitespace-pre-wrap break-words">
                                {{ item.content || t('bridge.conversation.imageMessage') }}
                            </p>
                            <Icon
                                v-if="item.status === 'failed'"
                                name="askx-status:warning"
                                class="mt-2 text-destructive"
                                :aria-label="t('bridge.conversation.failed')"
                            />
                        </div>
                        <BusBridgeSourceAvatar
                            :source="item.source"
                            :created-at="item.createdAt"
                        />
                    </div>
                    <BusBridgeProcess
                        v-else-if="item.kind !== 'message'"
                        :item="item"
                        @resolve="resolveLayout"
                    />
                    <div
                        v-else
                        class="min-w-0 px-1 py-1 text-sm leading-[22px]"
                    >
                        <BusMdcRender
                            :value="item.content"
                            :cache-key="item.id"
                            @resolve="resolveLayout"
                        />
                        <span
                            v-if="item.status === 'inProgress' && !item.content"
                            class="inline-flex gap-1.5 py-2"
                            :aria-label="t('bridge.conversation.inProgress')"
                        ><span
                            v-for="dot in 3"
                            :key="dot"
                            class="size-1.5 animate-pulse rounded-full bg-primary/60 motion-reduce:animate-none"
                        /></span>
                    </div>
                </article>
            </div>
        </ScrollArea>
        <Button
            v-if="!pinned && messages.length"
            class="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-sm"
            variant="outlined"
            :size="36"
            shape="pill"
            @click="latest"
        >
            <Icon name="askx-navigation:arrow-down" />{{ t('bridge.conversation.latest') }}
        </Button>
    </div>
</template>
