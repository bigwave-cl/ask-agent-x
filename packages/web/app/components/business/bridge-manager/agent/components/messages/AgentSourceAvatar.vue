<script setup lang="ts">
import type { BridgeConversationSource } from '@askx/module-feishu-bridge/conversation-contract'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue'
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue'

/** 来源属于单条用户消息。 */
const props = defineProps<{ source?: BridgeConversationSource, createdAt?: string | null }>()
/** 浮层支持鼠标、键盘与触屏点击。 */
const open = ref(false)
/** 远端头像失效后保持稳定回退。 */
const imageFailed = ref(false)
/** 翻译与时间格式。 */
const { t, locale } = useI18n()
/** 优先显示实际昵称；历史渠道占位名按缺失资料处理，并用发送者 ID 区分成员。 */
const name = computed(() => {
    const source = props.source
    const senderName = source?.senderName?.trim()
    if (senderName && !(source?.channel === 'feishu' && senderName === 'Feishu')) return senderName
    if (source?.channel !== 'feishu') return t('bridge.conversation.localUser')
    return source.senderId ? t('bridge.conversation.feishuMemberId', { id: source.senderId.slice(-8) }) : t('bridge.conversation.feishuMember')
})
/** 只渲染服务端确认的 HTTPS 图片。 */
const avatar = computed(() => !imageFailed.value && props.source?.avatarUrl?.startsWith('https://') ? props.source.avatarUrl : '')
/** 本地字形头像。 */
const initials = computed(() => Array.from(name.value).slice(0, 1).join(''))
/** 格式化消息时间。 */
const time = computed(() => {
    const value = props.source?.createdAt || props.createdAt
    if (!value) return ''
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toLocaleString(locale.value === 'en' ? 'en-US' : 'zh-CN') : ''
})
watch(() => [props.source?.senderId, props.source?.avatarUrl], () => { imageFailed.value = false; open.value = false })
</script>

<template>
    <Tooltip v-model:open="open">
        <TooltipTrigger as-child>
            <button
                type="button"
                class="inline-flex max-w-full items-center gap-2 rounded-full text-xs font-medium outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
                :aria-label="`${name} · ${t('bridge.conversation.source')}`"
                @click="open = !open"
            >
                <span class="max-w-48 truncate rounded-full bg-bridge-message-label px-2.5 py-1 text-[11px] leading-4 text-bridge-message-label-text">{{ name }}</span>
                <span class="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-bridge-process-border bg-bridge-message-label text-bridge-message-label-text">
                    <img
                        v-if="avatar"
                        :src="avatar"
                        :alt="name"
                        class="size-full object-cover"
                        referrerpolicy="no-referrer"
                        @error="imageFailed = true"
                    >
                    <span v-else>{{ initials }}</span>
                </span>
            </button>
        </TooltipTrigger>
        <TooltipContent
            side="left"
            :side-offset="8"
            class="max-w-80 px-3 py-2.5"
        >
            <div class="space-y-1.5 text-xs leading-5">
                <p class="text-sm font-semibold">
                    {{ name }}
                </p>
                <p>
                    {{ source?.channel === 'feishu' ? t('bridge.conversation.feishu') : 'Web' }}<template v-if="source?.chatName">
                        · {{ source.chatName }}
                    </template>
                </p>
                <p
                    v-if="source?.senderId"
                    class="break-all opacity-75"
                >
                    {{ t('bridge.conversation.senderId') }} · {{ source.senderId }}
                </p>
                <p
                    v-if="source?.projectPath"
                    class="break-all opacity-75"
                >
                    {{ source.projectPath }}
                </p>
                <p
                    v-if="time"
                    class="opacity-65"
                >
                    {{ time }}
                </p>
            </div>
        </TooltipContent>
    </Tooltip>
</template>
