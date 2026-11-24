import type { Component } from 'vue'
import type { BridgeConversationItem } from '@askx/module-feishu-bridge/conversation-contract'
import AgentProcessCard from './AgentProcessCard.vue'

/** 标准过程类型共享现有折叠卡片，未知类型保留兼容展示。 */
export function resolveMessageCard(item: BridgeConversationItem): Component | null {
    return item.role !== 'user' && item.kind !== 'message' ? AgentProcessCard : null
}
