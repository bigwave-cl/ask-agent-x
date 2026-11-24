<script setup lang="ts">
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'
import Button from '@/components/ui/button/Button.vue'
import AgentMessageCard from './AgentMessageCard.vue'
import { useMessageListRendering } from './useMessageListRendering'
import { useProvidedAgentCore } from '../../core/useAgentCore'
/** 列表只消费当前注入的历史 owner。 */
const agent = useProvidedAgentCore()
/** 消息、加载与游标来自同一历史快照。 */
const { messages, loading, loadingMore, nextCursor } = agent.historyHub
/** 分页按钮按游标展示。 */
const hasMore = computed(() => Boolean(nextCursor.value))
/** 所有滚动与渲染完成通知统一进入布局 helper。 */
const { scroll, pinned, resolveLayout, more, latest, enteringKeys } = useMessageListRendering(agent)
/** 翻译入口。 */
const { t } = useI18n()
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
                <AgentMessageCard
                    v-for="item in messages"
                    :key="item.clientMessageId || item.id"
                    :item="item"
                    :entering="enteringKeys.has(item.clientMessageId || item.id)"
                    @render-complete="resolveLayout"
                />
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
