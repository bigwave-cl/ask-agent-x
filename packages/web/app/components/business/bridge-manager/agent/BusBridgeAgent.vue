<script setup lang="ts">
import BusBridgeConversationHeader from './components/header/AgentHeader.vue'
import BusBridgeMessageList from './components/messages/AgentMessageList.vue'
import BusBridgeComposer from './components/composer/AgentPromptBar.vue'

/** Agent 容器只接收导航展示上下文。 */
const props = defineProps<{
    /** 当前会话标题。 */ title: string
    /** 群组展示名称。 */ groupName?: string
    /** 项目展示名称。 */ projectName?: string
    /** 当前绑定是否只读。 */ readOnly: boolean
    /** 将标题提交给目录 owner。 */ rename: (name: string) => Promise<boolean>
}>()
/** 设置动作由导航处理。 */
const emit = defineEmits<{ settings: [] }>()
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
            :title="title"
            :group-name="groupName"
            :rename="props.rename"
        />
        <BusBridgeMessageList />
        <BusBridgeComposer
            ref="composer"
            :read-only="readOnly"
            :project-name="projectName"
            @settings="emit('settings')"
        />
    </section>
</template>
