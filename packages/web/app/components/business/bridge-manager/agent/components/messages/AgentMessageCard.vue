<script setup lang="ts">
import type { BridgeConversationItem } from '@askx/module-feishu-bridge/conversation-contract'
import type { MessageRenderCompletePayload } from '../../core/types'
import AgentMessageCommonCard from './AgentMessageCommonCard.vue'
import { resolveMessageCard } from './messageCardRegistry'
/** 当前标准消息。 */
const props = defineProps<{ /** 要渲染的标准消息。 */ item: BridgeConversationItem, /** 仅尾部新增消息首次挂载时播放入场。 */ entering?: boolean }>()
/** 统一上报消息布局变化。 */
const emit = defineEmits<{ 'render-complete': [payload: MessageRenderCompletePayload] }>()
/** 过程卡片由注册表选择。 */
const card = computed(() => resolveMessageCard(props.item))
/** 翻译入口。 */
const { t } = useI18n()
</script>

<template>
    <article
        class="min-w-0"
        :class="{ 'bridge-message-enter': entering }"
        :aria-label="item.role === 'user' ? t('bridge.conversation.userMessage') : t('bridge.conversation.agentMessage')"
    >
        <AgentMessageCommonCard
            :item="item"
            @render-complete="emit('render-complete', $event)"
        />
        <component
            :is="card"
            v-if="card"
            :item="item"
            @render-complete="emit('render-complete', $event)"
        />
    </article>
</template>

<style scoped>
.bridge-message-enter {
    animation: bridge-message-enter 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes bridge-message-enter {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
    .bridge-message-enter { animation: none; }
}
</style>
