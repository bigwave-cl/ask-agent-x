<script setup lang="ts">
import type { BridgeNewSessionGroupOption } from '@/composables/useBridgeCatalog'
import Button from '@/components/ui/button/Button.vue'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'

/** 新会话群选择只消费目录结果，不维护业务选择。 */
const props = defineProps<{
    /** 目录 owner 提供的可选群与当前项目。 */
    groups: readonly BridgeNewSessionGroupOption[]
    /** 当前草稿选择的群身份。 */
    selectedChatId: string
}>()
/** 选群或请求为群绑定项目。 */
const emit = defineEmits<{ select: [chatId: string] }>()
/** 选择层开关。 */
const open = ref(false)
/** 国际化文案。 */
const { t } = useI18n()
/** 当前选择仅用于展示，不推导可写能力。 */
const selected = computed(() => props.groups.find(group => group.chatId === props.selectedChatId))
/** 选择后关闭列表，后续绑定流程由父级负责。 */
function select(chatId: string): void { open.value = false; emit('select', chatId) }
</script>

<template>
    <CsResponsiveOverlayPopoverDrawer
        v-model:open="open"
        :title="t('bridge.chooseGroupProject')"
        :show-header="false"
        :show-close="{ desktop: false, mobile: true }"
        :close-label="t('common.close')"
        :popover="{ content: { side: 'top', align: 'start', class: 'w-72' } }"
        body-class="p-1.5"
    >
        <template #trigger>
            <Button
                variant="ghost"
                size="xs"
                class="max-w-full justify-start font-normal"
            >
                <Icon name="askx-objects:users" />
                <span class="truncate">{{ selected ? `${selected.name}${selected.activeProject ? ` · ${selected.activeProject.name}` : ''}` : t('bridge.chooseGroupProject') }}</span>
            </Button>
        </template>
        <ScrollArea
            class="max-h-72"
            viewport-class="max-h-72"
        >
            <div class="grid gap-1">
                <Button
                    v-for="group in groups"
                    :key="group.chatId"
                    variant="ghost"
                    :size="36"
                    class="min-w-0 justify-start font-normal"
                    :aria-label="group.activeProject ? `${group.name} · ${group.activeProject.name}` : `${t('bridge.linkProjects')} · ${group.name}`"
                    @click="select(group.chatId)"
                >
                    <span class="min-w-0 truncate">{{ group.name }}<span v-if="group.activeProject"> · {{ group.activeProject.name }}</span></span>
                    <Icon
                        v-if="!group.activeProject"
                        name="askx-actions:link"
                        class="ml-auto shrink-0"
                    />
                </Button>
            </div>
        </ScrollArea>
    </CsResponsiveOverlayPopoverDrawer>
</template>
