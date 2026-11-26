<script setup lang="ts">
import type Sortable from 'sortablejs'
import { CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from 'reka-ui'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import BusBridgeItemMenu from './BusBridgeItemMenu.vue'
import BusBridgeNewSessionSelect from './BusBridgeNewSessionSelect.vue'
import BusBridgeAgent from './agent/BusBridgeAgent.vue'
import { provideAgentCore, useAgentCore } from './agent/core/useAgentCore'
import type { BridgeCatalogChange } from './BusBridgeItemMenu.vue'
import Button from '@/components/ui/button/Button.vue'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue'
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'
import { useBridgeSidebarGroupPreferences } from '@/composables/useBridgeSidebarGroupPreferences'
import { useBridgeProjectSettings } from '@/composables/useBridgeProjectSettings'
import { useBridgeServiceControl } from '@/composables/useBridgeServiceControl'
import { useBridgeCatalog, type BridgeCatalogProjectView, type BridgeCatalogThreadView } from '@/composables/useBridgeCatalog'

/** 服务状态与准入控制。 */
const { statusIndicator, requireRunning, openSettings } = useBridgeServiceControl()
/** 国际化文案。 */
const { t } = useI18n()
/** 群项目设置统一动态入口。 */
const { openProjectSettings } = useBridgeProjectSettings()
/** 统一目录与身份选择 owner。 */
const { sidebarGroups, newSessionGroups, selectedChatId, selectedProjectPath, selectedThreadId, selectedGroup, selectedProjectEntry, selectedProject, selectedThread, loadCatalog, selectThread: selectCatalogThread, selectNewThread, archiveThread, updateThreadTitle, acceptThread: acceptCatalogThread } = useBridgeCatalog()
/** 群组层的本地排序与展开偏好，不改变目录本身。 */
const { orderedGroups, isGroupOpen, setGroupOpen } = useBridgeSidebarGroupPreferences(sidebarGroups)
/** 一次性拦截拖拽合成点击；新的真实手势或键盘操作立即解除。 */
let suppressGroupClick = false
/** 仅群标题可发起排序，触屏保留短按展开与纵向滚动。 */
const groupDragOptions: Sortable.Options = {
    delay: 180,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
    onStart: () => { suppressGroupClick = true },
}
/** 在 Reka 的点击处理前阻止拖拽附带点击。 */
function guardGroupClick(event: MouseEvent): void {
    if (!suppressGroupClick) return
    suppressGroupClick = false
    event.preventDefault()
    event.stopPropagation()
}
/** 标题的键盘排序与拖拽共用同一偏好提交入口。 */
function reorderGroup(event: KeyboardEvent, chatId: string): void {
    suppressGroupClick = false
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    /** 复制当前显示顺序，不修改目录 owner 的数组。 */
    const groups = [...orderedGroups.value]
    /** 当前群组与移动目标的位置。 */
    const index = groups.findIndex(group => group.chatId === chatId)
    /** 上下键只允许相邻群组交换。 */
    const target = index + (event.key === 'ArrowUp' ? -1 : 1)
    if (index < 0 || target < 0 || target >= groups.length) return
    groups.splice(target, 0, ...groups.splice(index, 1))
    orderedGroups.value = groups
}
/** 操作反馈。 */
const toast = useToast()
/** 显式新建重置草稿；选择群保留输入。 */
const draftSessionKey = ref(0)
/** 右侧聊天外壳的焦点入口。 */
const conversationPanel = ref<{ focus: () => void } | null>(null)
/** 会话页面生命周期。 */
let active = false
/** 导航选择意图序号，使较早的准入等待失效。 */
let navigationGeneration = 0
/** 历史项目与不可用项目只保留查看入口。 */
const readOnly = computed(() => Boolean(selectedProjectEntry.value && (!selectedProjectEntry.value.active || !selectedProjectEntry.value.available)))
/** 当前项目仍有效时才开放发送。 */
const canCompose = computed(() => Boolean(selectedProjectEntry.value?.active && selectedProjectEntry.value.available))
/** 服务状态的可访问说明。 */
const statusLabel = computed(() => t(statusIndicator.value.labelKey))

/** 选择会话；历史项目保持只读。 */
async function selectThread(group: { chatId: string }, entry: Pick<BridgeCatalogProjectView, 'project' | 'available' | 'active'>, thread: BridgeCatalogThreadView): Promise<void> {
    /** 当前会话选择意图。 */
    const current = ++navigationGeneration
    if (!entry.available) { toast.error(t('bridge.projectUnavailableHint')); return }
    if (!await requireRunning() || !active || current !== navigationGeneration) return
    if (!selectCatalogThread(group.chatId, entry.project.path, thread.id)) return
}

/** 等待输入栏装配后聚焦，过期导航不能抢焦点。 */
async function focusDraft(current: number): Promise<void> {
    await nextTick()
    if (active && current === navigationGeneration) conversationPanel.value?.focus()
}
/** 新建空会话或指定群会话，不在打开输入态时检查服务。 */
function createThread(chatId?: string): void {
    /** 用户本次明确的新建意图。 */
    const current = ++navigationGeneration
    if (!chatId) {
        selectNewThread()
        draftSessionKey.value++
        void focusDraft(current)
        return
    }
    ensureNewSessionGroup(chatId, current, true)
}
/** 选择群保留草稿，绑定完成前不改变现有导航。 */
function selectNewSessionGroup(chatId: string): void { ensureNewSessionGroup(chatId, ++navigationGeneration, false) }
/** 目录 owner 决定可用性，缺少有效项目时打开绑定入口。 */
function ensureNewSessionGroup(chatId: string, current: number, resetDraft: boolean): void {
    if (selectNewThread(chatId)) {
        if (resetDraft) draftSessionKey.value++
        void focusDraft(current)
        return
    }
    /** 绑定回调需要当前打开会话的有效句柄。 */
    const handle = openProjectSettings({ kind: 'group', chatId, onSaved: async () => {
        await loadCatalog()
        if (!active || current !== navigationGeneration || !handle.isOpen()) return
        if (!selectNewThread(chatId)) return
        if (resetDraft) draftSessionKey.value++
        handle.close()
        await focusDraft(current)
    } })
}

/** 项目/会话菜单操作完成后刷新唯一目录。 */
function catalogChanged(change: BridgeCatalogChange): void {
    if (change.action === 'rename-thread' && change.name !== undefined) updateThreadTitle(change.id, change.name)
    if (change.action === 'archive-thread' && archiveThread(change.id)) {
        navigationGeneration++
    }
    void loadCatalog()
}

/** Core 所需的稳定导航上下文。 */
const conversationContext = computed(() => ({ chatId: selectedChatId.value, projectPath: selectedProjectPath.value }))
/** 新会话提交到目录 owner 后退出输入态。 */
function acceptThread(thread: { id: string, title: string }): void {
    acceptCatalogThread(thread)
}
/** 消息、实时事件及发送生命周期统一交给会话 Core。 */
const agentCore = useAgentCore({ threadId: selectedThreadId, context: conversationContext, draftSessionKey, canCompose, requireRunning, onCreated: acceptThread, onCatalogChanged: () => { void loadCatalog() }, onTitle: updateThreadTitle })
/** 整个右侧 Agent 共用一个 Core，目录层只提供导航和目录回调。 */
provideAgentCore(agentCore)
/** 标题行内编辑复用既有目录写入 API 与授权链路。 */
async function renameConversation(name: string): Promise<boolean> {
    /** 名称更新绑定点击时的导航上下文。 */
    const current = navigationGeneration
    /** 待重命名的会话身份。 */
    const threadId = selectedThreadId.value
    /** 待重命名的项目身份。 */
    const projectPath = selectedProjectPath.value
    if (!threadId || !await requireRunning() || !active || current !== navigationGeneration) return false
    try {
        await $fetch('/api/bridge/catalog-action', { method: 'POST', body: { action: 'rename-thread', threadId, projectPath, name, confirmation: true }, retry: 0 })
        if (!active || current !== navigationGeneration) return false
        updateThreadTitle(threadId, name)
        return true
    }
    catch (cause) {
        if (active && current === navigationGeneration) toast.error((cause as { data?: { statusMessage?: string } }).data?.statusMessage || t('bridge.loadError'))
        return false
    }
}
onMounted(() => { active = true })
onUnmounted(() => { active = false; navigationGeneration++ })
</script>

<template>
    <div class="bridge-manager h-full min-h-0 min-w-0 overflow-hidden bg-background text-foreground">
        <section
            class="grid h-full min-h-0 min-w-0 grid-rows-[12rem_minmax(0,1fr)] lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-1"
        >
            <aside
                class="flex min-h-0 flex-col border-b bg-muted/20 lg:border-b-0 lg:border-r"
            >
                <header class="flex items-center gap-3 border-b px-4 py-4">
                    <div class="min-w-0">
                        <p class="truncate text-base font-semibold">
                            {{ t('common.bridgeNav') }}
                        </p>
                        <p class="truncate text-xs text-muted-foreground">
                            {{ t('bridge.managerEyebrow') }}
                        </p>
                    </div>
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <span
                                class="inline-flex size-7 shrink-0 items-center justify-center rounded-full"
                                tabindex="0"
                                role="status"
                                :aria-label="statusLabel"
                            ><span
                                class="size-2 shrink-0 rounded-full"
                                :class="statusIndicator.colorClass"
                                aria-hidden="true"
                            /></span>
                        </TooltipTrigger>
                        <TooltipContent>{{ statusLabel }}</TooltipContent>
                    </Tooltip>
                    <Button
                        size="icon"
                        shape="pill"
                        class="ml-auto"
                        :aria-label="t('bridge.newSession')"
                        @click="createThread()"
                    >
                        <Icon name="askx-actions:add" />
                    </Button>
                </header>
                <ScrollArea
                    class="min-h-0 flex-1"
                    viewport-class="px-3 py-4"
                >
                    <div>
                        <CsDraggable
                            v-model="orderedGroups"
                            item-key="chatId"
                            insertion-indicator
                            handle=".bridge-group-drag-handle"
                            :options="groupDragOptions"
                            class="space-y-5"
                        >
                            <template #default="{ item: group }">
                                <CollapsibleRoot
                                    v-slot="{ open: groupExpanded }"
                                    :open="isGroupOpen(group.chatId)"
                                    :unmount-on-hide="false"
                                    @update:open="setGroupOpen(group.chatId, $event)"
                                >
                                    <div class="group/row flex items-center gap-1 rounded-lg transition-colors hover:bg-muted">
                                        <CollapsibleTrigger as-child>
                                            <button
                                                type="button"
                                                class="bridge-group-drag-handle flex min-w-0 flex-1 cursor-grab items-center gap-2 bg-transparent px-2 py-1.5 text-left text-sm font-semibold active:cursor-grabbing"
                                                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                                                :class="group.chatId === selectedChatId ? 'text-primary' : ''"
                                                :aria-label="t(groupExpanded ? 'bridge.collapseItem' : 'bridge.expandItem', { name: group.name })"
                                                @pointerdown="suppressGroupClick = false"
                                                @click.capture="guardGroupClick"
                                                @keydown="reorderGroup($event, group.chatId)"
                                            >
                                                <Icon
                                                    name="askx-objects:users"
                                                    class="size-4 shrink-0"
                                                />
                                                <span class="truncate">{{ group.name }}</span>
                                            </button>
                                        </CollapsibleTrigger>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            class="opacity-0 hover:bg-transparent hover:text-primary group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100"
                                            :aria-label="`${t('bridge.newSession')} · ${group.name}`"
                                            @click.stop="createThread(group.chatId)"
                                        >
                                            <Icon name="askx-actions:add" />
                                        </Button>
                                    </div>
                                    <CollapsibleContent class="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up motion-reduce:animate-none">
                                        <div class="ml-3 border-l pt-2 pl-3">
                                            <CsProgressiveList
                                                v-slot="{ items: visibleProjects }"
                                                :items="group.projects"
                                                :expanded="groupExpanded"
                                                :label="t('bridge.showMoreProjects', { name: group.name })"
                                                chunk-class="space-y-2"
                                                batch-class="pt-2"
                                            >
                                                <CollapsibleRoot
                                                    v-for="entry in visibleProjects"
                                                    :key="entry.project.path"
                                                    v-slot="{ open: projectExpanded }"
                                                    :default-open="entry.project.path === group.projects[0]?.project.path"
                                                    :unmount-on-hide="false"
                                                >
                                                    <div
                                                        class="group/row flex items-center gap-1 rounded-lg transition-colors hover:bg-muted"
                                                        :class="entry.project.path === selectedProjectPath && group.chatId === selectedChatId ? 'bg-muted' : ''"
                                                    >
                                                        <CollapsibleTrigger as-child>
                                                            <Button
                                                                variant="ghost"
                                                                :size="36"
                                                                class="min-w-0 flex-1 justify-start gap-2 px-2 hover:bg-transparent active:bg-transparent"
                                                                :class="entry.project.path === selectedProjectPath && group.chatId === selectedChatId ? 'text-primary' : ''"
                                                                :aria-label="t(projectExpanded ? 'bridge.collapseItem' : 'bridge.expandItem', { name: entry.project.name })"
                                                            >
                                                                <Icon
                                                                    name="askx-objects:folder"
                                                                    class="size-4 shrink-0"
                                                                />
                                                                <span class="truncate text-xs">{{ entry.project.name }}</span>
                                                                <span
                                                                    v-if="!entry.available"
                                                                    class="inline-flex shrink-0 items-center gap-1 text-[10px] text-destructive"
                                                                    :title="t('bridge.projectUnavailableHint')"
                                                                >
                                                                    <Icon
                                                                        name="askx-status:error"
                                                                        class="size-3"
                                                                    />{{ t('bridge.projectUnavailable') }}
                                                                </span>
                                                                <span
                                                                    v-else-if="!entry.active"
                                                                    class="shrink-0 text-[10px] text-muted-foreground"
                                                                >{{ t('bridge.history') }}</span>
                                                            </Button>
                                                        </CollapsibleTrigger>

                                                        <BusBridgeItemMenu
                                                            kind="project"
                                                            hover-only
                                                            :mutations-disabled="!entry.available"
                                                            :item-id="entry.project.path"
                                                            :label="entry.project.name"
                                                            @settings="openProjectSettings({ kind: 'group', chatId: group.chatId, onSaved: loadCatalog })"
                                                            @changed="catalogChanged"
                                                        />
                                                        <Button
                                                            v-if="entry.active"
                                                            variant="ghost"
                                                            size="icon"
                                                            class="opacity-0 hover:bg-transparent hover:text-primary group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100"
                                                            :aria-label="`${t('bridge.newSession')} · ${entry.project.name}`"
                                                            @click.stop="createThread(group.chatId)"
                                                        >
                                                            <Icon name="askx-actions:add" />
                                                        </Button>
                                                    </div>
                                                    <CollapsibleContent class="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up motion-reduce:animate-none">
                                                        <div class="ml-2 border-l border-border/70 pt-1 pl-2">
                                                            <CsProgressiveList
                                                                v-slot="{ items: visibleThreads }"
                                                                :items="entry.sessions"
                                                                :expanded="projectExpanded"
                                                                :label="t('bridge.showMoreThreads', { name: entry.project.name })"
                                                                chunk-class="space-y-0.5"
                                                                batch-class="pt-0.5"
                                                            >
                                                                <div
                                                                    v-for="thread in visibleThreads"
                                                                    :key="thread.id"
                                                                    class="flex items-center gap-1 rounded-lg transition-colors hover:bg-muted"
                                                                    :class="thread.id === selectedThreadId ? 'bg-primary/10' : ''"
                                                                >
                                                                    <Button
                                                                        variant="ghost"
                                                                        :size="36"
                                                                        class="min-w-0 flex-1 justify-start px-2 text-left hover:bg-transparent active:bg-transparent"
                                                                        :class="thread.id === selectedThreadId ? 'text-primary' : ''"
                                                                        @click="selectThread(group, entry, thread)"
                                                                    >
                                                                        <Icon
                                                                            name="askx-objects:chat"
                                                                            class="size-3.5 shrink-0"
                                                                        /><span class="truncate text-xs">{{ thread.title || thread.id }}</span>
                                                                    </Button>
                                                                    <BusBridgeItemMenu
                                                                        kind="thread"
                                                                        :disabled="!entry.available"
                                                                        :item-id="thread.id"
                                                                        :project-path="entry.project.path"
                                                                        :label="thread.title || thread.id"
                                                                        @changed="catalogChanged"
                                                                    />
                                                                </div>
                                                            </CsProgressiveList>
                                                        </div>
                                                    </CollapsibleContent>
                                                </CollapsibleRoot>
                                            </CsProgressiveList>
                                            <div
                                                v-if="!group.projects.length"
                                                class="px-2 py-2 text-xs text-muted-foreground"
                                            >
                                                <Button
                                                    variant="ghost"
                                                    size="xs"
                                                    class="block font-normal"
                                                    @click="openProjectSettings({ kind: 'group', chatId: group.chatId, onSaved: loadCatalog })"
                                                >
                                                    {{ t('bridge.linkProjects') }}
                                                </Button>
                                            </div>
                                        </div>
                                    </CollapsibleContent>
                                </CollapsibleRoot>
                            </template>
                            <template #preview="{ item }">
                                <div class="flex min-w-0 items-center gap-2 text-sm font-semibold">
                                    <Icon
                                        name="askx-objects:users"
                                        class="size-4 shrink-0"
                                    />
                                    <span class="truncate">{{ item.name }}</span>
                                </div>
                            </template>
                        </CsDraggable>
                        <div
                            v-if="!sidebarGroups.length"
                            class="rounded-xl border border-dashed p-5 text-center"
                        >
                            <Icon
                                name="askx-objects:users"
                                class="mx-auto mb-2 size-6 text-muted-foreground"
                            />
                            <p class="text-sm font-medium">
                                {{ t('bridge.noGroups') }}
                            </p>
                            <p class="mt-1 text-xs text-muted-foreground">
                                {{ t('bridge.emptyGroupHint') }}
                            </p>
                        </div>
                    </div>
                </ScrollArea>
            </aside>

            <BusBridgeAgent
                ref="conversationPanel"
                :title="selectedThread?.title || t('bridge.newSession')"
                :group-name="selectedGroup?.name"
                :project-name="selectedProject?.name"
                :read-only="readOnly"
                :rename="renameConversation"
                @settings="openSettings"
            >
                <template
                    v-if="!selectedThreadId"
                    #composer-context
                >
                    <BusBridgeNewSessionSelect
                        :groups="newSessionGroups"
                        :selected-chat-id="selectedChatId"
                        @select="selectNewSessionGroup"
                    />
                </template>
            </BusBridgeAgent>
        </section>
    </div>
</template>
