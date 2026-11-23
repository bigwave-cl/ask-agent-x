<script setup lang="ts">
import BusBridgeConversationHeader from './BusBridgeConversationHeader.vue'
import BusBridgeMessageList from './BusBridgeMessageList.vue'
import BusBridgeComposer from './BusBridgeComposer.vue'
import type { BridgeConversationItem } from '@askx/module-feishu-bridge/conversation-contract'

/** PG Agent 的固定标题、消息视口和底部输入区映射到右侧。 */
const props = defineProps<{
    threadId: string
    title: string
    groupName?: string
    projectName?: string
    messages: BridgeConversationItem[]
    loading: boolean
    loadingMore: boolean
    hasMore: boolean
    submitting: boolean
    running: boolean
    canStop: boolean
    canCompose: boolean
    readOnly: boolean
    connection: string
    rename: (name: string) => Promise<boolean>
}>()
/** 草稿由会话 Core 持有。 */
const draft = defineModel<string>({ required: true })
/** 组件只转发用户动作。 */
const emit = defineEmits<{ send: [], stop: [], settings: [], more: [] }>()
/** 新建会话后的焦点入口。 */
const composer = ref<{ focus: () => void } | null>(null)
defineExpose({ focus: () => composer.value?.focus() })
</script>

<template>
    <section
        class="flex min-h-0 min-w-0 flex-col overflow-hidden bg-card lg:m-3 lg:ml-0 lg:rounded-[20px] lg:border lg:border-border/60 lg:shadow-sm"
        aria-label="AskX Relay"
    >
        <BusBridgeConversationHeader
            :thread-id="threadId"
            :title="title"
            :group-name="groupName"
            :rename="props.rename"
        />
        <BusBridgeMessageList
            :thread-id="threadId"
            :messages="messages"
            :loading="loading"
            :loading-more="loadingMore"
            :has-more="hasMore"
            @more="emit('more')"
        />
        <BusBridgeComposer
            ref="composer"
            v-model="draft"
            :disabled="!canCompose"
            :submitting="submitting"
            :running="running"
            :can-stop="canStop"
            :read-only="readOnly"
            :connection="connection"
            :project-name="projectName"
            @send="emit('send')"
            @stop="emit('stop')"
            @settings="emit('settings')"
        />
    </section>
</template>
