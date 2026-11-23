<script setup lang="ts">
import type { BridgeConversationItem } from '@askx/module-feishu-bridge/conversation-contract'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'

/** 标准过程项，不接触原始协议字段。 */
const props = defineProps<{ item: BridgeConversationItem }>()
/** 内容尺寸改变后通知列表调整阅读位置。 */
const emit = defineEmits<{ resolve: [] }>()
/** 翻译入口。 */
const { t } = useI18n()
/** 标题按过程语义映射。 */
const label = computed(() => props.item.kind === 'tool' || props.item.kind === 'unknown' ? props.item.tool?.name || t('bridge.conversation.tool') : t(`bridge.conversation.${props.item.kind}`))
/** 状态与内容类型分开。 */
const statusIcon = computed(() => props.item.status === 'inProgress' ? 'askx-status:loading' : props.item.status === 'failed' ? 'askx-status:warning' : props.item.status === 'interrupted' ? 'askx-actions:stop' : 'askx-status:check')
</script>

<template>
    <details
        class="group rounded-2xl border border-border/60 bg-muted/20 text-sm"
        @toggle="emit('resolve')"
    >
        <summary class="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-3 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <Icon
                :name="statusIcon"
                class="size-4 shrink-0"
                :class="{ 'animate-spin motion-reduce:animate-none': item.status === 'inProgress', 'text-destructive': item.status === 'failed' }"
            />
            <span class="min-w-0 flex-1 truncate font-medium">{{ label }}</span>
            <span class="text-[11px] opacity-70">{{ t(`bridge.conversation.${item.status}`) }}</span>
            <Icon
                name="askx-navigation:chevron-down"
                class="size-3.5 transition-transform group-open:rotate-180"
            />
        </summary>
        <div class="px-3.5 pb-3.5">
            <ol
                v-if="item.plan?.length"
                class="space-y-2"
            >
                <li
                    v-for="(step, index) in item.plan"
                    :key="index"
                    class="flex items-start gap-2.5 leading-6"
                >
                    <Icon
                        :name="step.status === 'completed' ? 'askx-status:check' : step.status === 'inProgress' ? 'askx-status:loading' : 'askx-objects:history'"
                        class="mt-1 size-4 shrink-0 text-muted-foreground"
                        :class="{ 'animate-spin motion-reduce:animate-none': step.status === 'inProgress' }"
                    />
                    <span>{{ step.step }}</span>
                </li>
            </ol>
            <div
                v-if="item.tool?.files?.length"
                class="space-y-1.5 font-mono text-xs"
            >
                <p
                    v-for="file in item.tool.files"
                    :key="file"
                    class="flex items-center gap-2 break-all"
                >
                    <Icon
                        name="askx-objects:file-code"
                        class="shrink-0"
                    />{{ file }}
                </p>
            </div>
            <ScrollArea
                v-if="item.kind === 'command'"
                class="h-64 rounded-xl bg-background"
                viewport-class="p-3"
            >
                <pre class="whitespace-pre-wrap break-all font-mono text-xs leading-5"><span
v-if="item.tool?.command"
                                                                                             class="font-semibold"
>$ {{ item.tool.command }}

</span>{{ item.tool?.output || item.content }}</pre>
                <p
                    v-if="item.tool?.exitCode != null"
                    class="mt-3 text-xs text-muted-foreground"
                >
                    {{ t('bridge.conversation.exitCode', { code: item.tool.exitCode }) }}
                </p>
            </ScrollArea>
            <BusMdcRender
                v-else-if="item.content"
                :value="item.content"
                :cache-key="item.id"
                @resolve="emit('resolve')"
            />
        </div>
    </details>
</template>
