<script setup lang="ts">
import type { BridgeConversationItem } from '@askx/module-feishu-bridge/conversation-contract'
import type { MessageRenderCompletePayload } from '../../core/types'
import AgentSourceAvatar from './AgentSourceAvatar.vue'
/** 正文与来源只消费标准消息。 */
const props = defineProps<{ /** 当前标准消息。 */ item: BridgeConversationItem }>()
/** 异步正文完成后通知列表重新测量。 */
const emit = defineEmits<{ 'render-complete': [payload: MessageRenderCompletePayload] }>()
/** 翻译入口。 */
const { t } = useI18n()
/** 标准布局通知。 */
function complete() { emit('render-complete', { messageId: props.item.id }) }
</script>

<template>
    <div
        v-if="item.role === 'user'"
        class="flex flex-col items-end gap-2"
    >
        <AgentSourceAvatar
            :source="item.source"
            :created-at="item.createdAt"
        />
        <div class="max-w-[85%] rounded-[22px] rounded-tr-md bg-bridge-message-surface px-5 py-3.5 text-sm leading-[22px] text-bridge-message-text shadow-sm">
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
    </div>
    <div
        v-else-if="item.kind === 'message'"
        class="min-w-0 px-1 py-1 text-sm leading-[22px]"
    >
        <BusMdcRender
            :value="item.content"
            :cache-key="item.id"
            @resolve="complete"
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
</template>
