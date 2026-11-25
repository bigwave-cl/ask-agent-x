<script setup lang="ts">
import { CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from 'reka-ui'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import BusBridgeRelations from './BusBridgeRelations.vue'
import BusBridgeItemMenu from './BusBridgeItemMenu.vue'
import BusBridgeAgent from './agent/BusBridgeAgent.vue'
import { provideAgentCore, useAgentCore } from './agent/core/useAgentCore'
import type { BridgeCatalogChange } from './BusBridgeItemMenu.vue'
import Button from '@/components/ui/button/Button.vue'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue'
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'
import { useBridgeServiceControl } from '@/composables/useBridgeServiceControl'
import { useBridgeCatalog, type BridgeCatalogProjectView, type BridgeCatalogThreadView } from '@/composables/useBridgeCatalog'

/** 服务状态与准入控制。 */
const { statusIndicator, requireRunning, openSettings } = useBridgeServiceControl()
/** 国际化文案。 */
const { t } = useI18n()
/** 本地化路由入口。 */
const localePath = useLocalePath()
/** 统一目录与身份选择 owner。 */
const { sidebarGroups, projectOptions, selectedChatId, selectedProjectPath, selectedThreadId, selectedGroup, selectedProjectEntry, selectedProject, selectedThread, loadCatalog, selectGroup: selectCatalogGroup, selectProject: selectCatalogProject, selectThread: selectCatalogThread, selectNewThread, archiveThread, updateThreadTitle, acceptThread: acceptCatalogThread } = useBridgeCatalog()
/** 操作反馈。 */
const toast = useToast()
/** 新会话输入态。 */
const composingNewSession = ref(false)
/** 右侧聊天外壳的焦点入口。 */
const conversationPanel = ref<{ focus: () => void } | null>(null)
/** 项目导入弹窗开关。 */
const projectPanel = ref(false)
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

/** 切换群组，只改变导航上下文，不自动打开历史会话。 */
function selectGroup(chatId: string): void {
    if (chatId === selectedChatId.value) return
    navigationGeneration++
    selectCatalogGroup(chatId)
    composingNewSession.value = false
}

/** 选择项目；历史项目可查看，但不会打开可写输入。 */
function selectProject(entry: Pick<BridgeCatalogProjectView, 'project' | 'available' | 'active'>): void {
    if (entry.project.path === selectedProjectPath.value) return
    navigationGeneration++
    selectCatalogProject(entry.project.path)
    composingNewSession.value = false
}

/** 选择会话；历史项目保持只读。 */
async function selectThread(group: { chatId: string }, entry: Pick<BridgeCatalogProjectView, 'project' | 'available' | 'active'>, thread: BridgeCatalogThreadView): Promise<void> {
    /** 当前会话选择意图。 */
    const current = ++navigationGeneration
    if (!entry.available) { toast.error(t('bridge.projectUnavailableHint')); return }
    if (!await requireRunning() || !active || current !== navigationGeneration) return
    if (!selectCatalogThread(group.chatId, entry.project.path, thread.id)) return
    composingNewSession.value = false
}

/** 新会话只打开输入态，真正发送时才创建 Codex thread。 */
async function createThread(): Promise<void> {
    /** 当前新会话选择意图。 */
    const current = ++navigationGeneration
    if (!await requireRunning() || !active || current !== navigationGeneration) return
    selectNewThread()
    composingNewSession.value = true
    await nextTick()
    if (active && current === navigationGeneration) conversationPanel.value?.focus()
}

/** 项目/会话菜单操作完成后刷新唯一目录。 */
function catalogChanged(change: BridgeCatalogChange): void {
    if (change.action === 'rename-thread' && change.name !== undefined) updateThreadTitle(change.id, change.name)
    if (change.action === 'archive-thread' && archiveThread(change.id)) {
        navigationGeneration++
        composingNewSession.value = false
    }
    void loadCatalog()
}

/** 已有项目进入管理列表，新增项目打开独立导入弹窗。 */
function openProjectPanel(path = ''): void {
    if (path) void navigateTo({ path: localePath('/bridge/management'), query: { tab: 'projects' } })
    else projectPanel.value = true
}

/** Core 所需的稳定导航上下文。 */
const conversationContext = computed(() => ({ chatId: selectedChatId.value, projectPath: selectedProjectPath.value }))
/** 新会话提交到目录 owner 后退出输入态。 */
function acceptThread(thread: { id: string, title: string }): void {
    acceptCatalogThread(thread)
    composingNewSession.value = false
}
/** 消息、实时事件及发送生命周期统一交给会话 Core。 */
const agentCore = useAgentCore({ threadId: selectedThreadId, context: conversationContext, canCompose, requireRunning, onCreated: acceptThread, onCatalogChanged: () => { void loadCatalog() }, onTitle: updateThreadTitle })
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
                        :size="36"
                        square
                        shape="pill"
                        class="ml-auto"
                        :aria-label="t('bridge.newSession')"
                        @click="createThread"
                    >
                        <Icon name="askx-actions:add" />
                    </Button>
                </header>
                <ScrollArea
                    class="min-h-0 flex-1"
                    viewport-class="px-3 py-4"
                >
                    <div class="space-y-5">
                        <CollapsibleRoot
                            v-for="group in sidebarGroups"
                            :key="group.chatId"
                            v-slot="{ open: groupExpanded }"
                            default-open
                            :unmount-on-hide="false"
                        >
                            <div class="flex items-center gap-1">
                                <CollapsibleTrigger as-child>
                                    <button
                                        type="button"
                                        class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold transition-colors hover:bg-muted"
                                        :class="group.chatId === selectedChatId ? 'text-primary' : ''"
                                        :aria-label="t(groupExpanded ? 'bridge.collapseItem' : 'bridge.expandItem', { name: group.name })"
                                        @click="selectGroup(group.chatId)"
                                    >
                                        <Icon
                                            name="askx-objects:users"
                                            class="size-4 shrink-0"
                                        />
                                        <span class="truncate">{{ group.name }}</span>
                                    </button>
                                </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent class="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up motion-reduce:animate-none">
                                <div class="ml-3 space-y-2 border-l pt-2 pl-3">
                                    <CollapsibleRoot
                                        v-for="entry in group.projects"
                                        :key="entry.project.path"
                                        v-slot="{ open: projectExpanded }"
                                        default-open
                                        :unmount-on-hide="false"
                                    >
                                        <div class="flex items-center gap-1">
                                            <CollapsibleTrigger as-child>
                                                <Button
                                                    variant="ghost"
                                                    :size="36"
                                                    class="min-w-0 flex-1 justify-start gap-2 px-2"
                                                    :class="entry.project.path === selectedProjectPath && group.chatId === selectedChatId ? 'bg-muted text-primary' : ''"
                                                    :aria-label="t(projectExpanded ? 'bridge.collapseItem' : 'bridge.expandItem', { name: entry.project.name })"
                                                    @click="selectGroup(group.chatId); selectProject(entry)"
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
                                                :mutations-disabled="!entry.available"
                                                :item-id="entry.project.path"
                                                :label="entry.project.name"
                                                @settings="openProjectPanel(entry.project.path)"
                                                @changed="catalogChanged"
                                            />
                                        </div>
                                        <CollapsibleContent class="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up motion-reduce:animate-none">
                                            <div class="ml-2 space-y-0.5 border-l border-border/70 pt-1 pl-2">
                                                <div
                                                    v-for="thread in entry.sessions"
                                                    :key="thread.id"
                                                    class="flex items-center gap-1"
                                                >
                                                    <Button
                                                        variant="ghost"
                                                        :size="36"
                                                        class="min-w-0 flex-1 justify-start px-2 text-left"
                                                        :class="thread.id === selectedThreadId ? 'bg-primary/10 text-primary' : ''"
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
                                            </div>
                                        </CollapsibleContent>
                                    </CollapsibleRoot>
                                    <p
                                        v-if="!group.projects.length"
                                        class="px-2 py-2 text-xs text-muted-foreground"
                                    >
                                        {{ t('bridge.noActiveProject') }}
                                    </p>
                                </div>
                            </CollapsibleContent>
                        </CollapsibleRoot>
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
            />
        </section>
        <BusBridgeRelations
            v-model:open="projectPanel"
            import-only
            :projects="projectOptions"
            :threads="{}"
            @added="async () => { await loadCatalog(); projectPanel = false }"
            @saved="async () => { await loadCatalog(); projectPanel = false }"
        />
    </div>
</template>
