<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import BusBridgeRelations from './BusBridgeRelations.vue'
import BusBridgeItemMenu from './BusBridgeItemMenu.vue'
import BusBridgeAgent from './agent/BusBridgeAgent.vue'
import { provideAgentCore, useAgentCore } from './agent/core/useAgentCore'
import type { BridgeCatalogChange } from './BusBridgeItemMenu.vue'
import Button from '@/components/ui/button/Button.vue'
import Switch from '@/components/ui/switch/Switch.vue'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue'
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'
import { useBridgeServiceControl } from '@/composables/useBridgeServiceControl'
import { useBridgeCatalog, type BridgeCatalogGroup, type BridgeCatalogProject, type BridgeThread } from '@/composables/useBridgeCatalog'

/** 服务状态与准入控制。 */
const { ready, requireRunning, openSettings, refreshStatus } = useBridgeServiceControl()
/** 国际化文案。 */
const { t } = useI18n()
/** 本地化路由入口。 */
const localePath = useLocalePath()
/** 统一目录与身份选择 owner。 */
const { catalog, projectOptions, selectedChatId, selectedProjectPath, selectedThreadId, selectedGroup, selectedProjectEntry, selectedProject, selectedThread, loadCatalog, selectGroup: selectCatalogGroup, selectProject: selectCatalogProject, selectThread: selectCatalogThread, selectNewThread, updateThreadTitle, acceptThread: acceptCatalogThread } = useBridgeCatalog()
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
/** 正在排队或提交的项目开关，仅限制同一项目重复提交。 */
const pendingProjectActivations = ref(new Set<string>())
/** 侧栏开关按用户操作顺序提交。 */
let activationQueue = Promise.resolve()
/** 失败或卸载后使尚未执行的开关意图失效。 */
let activationGeneration = 0

/** 历史项目与不可用项目只保留查看入口。 */
const readOnly = computed(() => Boolean(selectedProjectEntry.value && (!selectedProjectEntry.value.active || !selectedProjectEntry.value.available)))
/** 当前项目仍有效时才开放发送。 */
const canCompose = computed(() => Boolean(selectedProjectEntry.value?.active && selectedProjectEntry.value.available))
/** 服务状态的可访问说明。 */
const statusLabel = computed(() => t(ready.value ? 'bridge.runtime.running' : 'bridge.runtime.stopped'))

/** 切换群组，只改变导航上下文，不自动打开历史会话。 */
function selectGroup(chatId: string): void {
    navigationGeneration++
    selectCatalogGroup(chatId)
    composingNewSession.value = false
}

/** 选择项目；历史项目可查看，但不会打开可写输入。 */
function selectProject(entry: BridgeCatalogProject): void {
    navigationGeneration++
    selectCatalogProject(entry)
    composingNewSession.value = false
}

/** 选择会话；历史项目保持只读。 */
async function selectThread(group: BridgeCatalogGroup, entry: BridgeCatalogProject, thread: BridgeThread): Promise<void> {
    /** 当前会话选择意图。 */
    const current = ++navigationGeneration
    if (!entry.available) { toast.error(t('bridge.projectUnavailableHint')); return }
    if (!await requireRunning() || !active || current !== navigationGeneration) return
    selectCatalogThread(group, entry, thread)
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

/** 群和项目共同确定一个待处理开关，不影响目录身份解析。 */
function projectActivationKey(chatId: string, projectPath: string): string {
    return JSON.stringify([chatId, projectPath])
}

/** 提交开关意图，界面只消费服务端确认后重新读取的目录。 */
function setProjectActive(group: BridgeCatalogGroup, entry: BridgeCatalogProject, enabled: boolean): void {
    if (enabled && !entry.available) { toast.error(t('bridge.projectUnavailableHint')); return }
    /** 当前开关在提交队列中的身份。 */
    const key = projectActivationKey(group.chatId, entry.project.path)
    if (pendingProjectActivations.value.has(key) || enabled === entry.active) return
    /** 点击时的开关事务生命周期。 */
    const current = activationGeneration
    pendingProjectActivations.value.add(key)
    activationQueue = activationQueue.then(async () => {
        if (!active || current !== activationGeneration) return
        try {
            if (!await requireRunning() || !active || current !== activationGeneration) return
            await loadCatalog()
            if (!active || current !== activationGeneration) return
            await $fetch('/api/bridge/groups/activate', { method: 'POST', body: { chatId: group.chatId, projectPath: entry.project.path, active: enabled, revision: catalog.value.revision }, retry: 0 })
            if (!active || current !== activationGeneration) return
            toast.success(t(enabled ? 'bridge.projectActivated' : 'bridge.projectDeactivated'))
            await loadCatalog()
        }
        catch (cause) {
            if (!active || current !== activationGeneration) return
            activationGeneration += 1
            pendingProjectActivations.value.clear()
            /** 失败后用于校准服务状态的生命周期。 */
            const failedGeneration = activationGeneration
            await refreshStatus(true).catch(() => undefined)
            if (!active || failedGeneration !== activationGeneration) return
            toast.error((cause as { data?: { statusMessage?: string } }).data?.statusMessage || t('bridge.loadError'))
            await loadCatalog()
        }
    }).finally(() => {
        if (active && current === activationGeneration) pendingProjectActivations.value.delete(key)
    })
}

/** 项目/会话菜单操作完成后刷新唯一目录。 */
function catalogChanged(change: BridgeCatalogChange): void {
    if (change.action === 'rename-thread' && change.name !== undefined) updateThreadTitle(change.id, change.name)
    if (selectedThreadId.value === change.id && change.action === 'archive-thread') {
        navigationGeneration++
        selectedThreadId.value = ''
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
onUnmounted(() => { active = false; navigationGeneration++; activationGeneration++; pendingProjectActivations.value.clear() })
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
                                class="ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-full"
                                :class="ready ? 'text-success' : 'text-muted-foreground'"
                                role="status"
                                :aria-label="statusLabel"
                            ><Icon
                                :name="ready ? 'askx-status:check' : 'askx-status:prohibited'"
                                class="size-4"
                            /></span>
                        </TooltipTrigger>
                        <TooltipContent>{{ statusLabel }}</TooltipContent>
                    </Tooltip>
                    <Button
                        :size="36"
                        square
                        shape="pill"
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
                        <div
                            v-for="group in catalog.groups"
                            :key="group.chatId"
                            class="space-y-2"
                        >
                            <button
                                type="button"
                                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold transition-colors hover:bg-muted"
                                :class="group.chatId === selectedChatId ? 'text-primary' : ''"
                                @click="selectGroup(group.chatId)"
                            >
                                <Icon
                                    name="askx-objects:users"
                                    class="size-4 shrink-0"
                                />
                                <span class="truncate">{{ group.name }}</span>
                            </button>
                            <div class="ml-3 space-y-2 border-l pl-3">
                                <div
                                    v-for="entry in group.projects"
                                    :key="entry.project.path"
                                    class="space-y-1"
                                >
                                    <div class="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            :size="36"
                                            class="min-w-0 flex-1 justify-start gap-2 px-2"
                                            :class="entry.project.path === selectedProjectPath && group.chatId === selectedChatId ? 'bg-muted text-primary' : ''"
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
                                        <Tooltip>
                                            <TooltipTrigger as-child>
                                                <span class="inline-flex h-9 shrink-0 items-center px-1">
                                                    <Switch
                                                        :model-value="entry.active"
                                                        :disabled="(!entry.available && !entry.active) || pendingProjectActivations.has(projectActivationKey(group.chatId, entry.project.path))"
                                                        :aria-busy="pendingProjectActivations.has(projectActivationKey(group.chatId, entry.project.path))"
                                                        :aria-label="`${t(entry.active ? 'bridge.deactivateProject' : 'bridge.activateProject')} · ${entry.project.name}`"
                                                        @update:model-value="setProjectActive(group, entry, $event)"
                                                    />
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent>{{ t(entry.active ? 'bridge.deactivateProject' : 'bridge.activateProject') }}</TooltipContent>
                                        </Tooltip>
                                        <div class="flex size-9 shrink-0 items-center justify-center">
                                            <BusBridgeItemMenu
                                                v-if="entry.available && entry.active"
                                                kind="project"
                                                :item-id="entry.project.path"
                                                :label="entry.project.name"
                                                @settings="openProjectPanel(entry.project.path)"
                                                @changed="catalogChanged"
                                            />
                                            <Button
                                                v-if="!entry.available"
                                                variant="ghost"
                                                :size="36"
                                                square
                                                :aria-label="`${t('bridge.projectSettings')} · ${entry.project.name}`"
                                                @click="openProjectPanel(entry.project.path)"
                                            >
                                                <Icon
                                                    name="askx-actions:settings"
                                                    class="size-3.5"
                                                />
                                            </Button>
                                        </div>
                                    </div>
                                    <div class="ml-2 space-y-0.5 border-l border-border/70 pl-2">
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
                                                v-if="entry.available && entry.active"
                                                kind="thread"
                                                :item-id="thread.id"
                                                :project-path="entry.project.path"
                                                :label="thread.title || thread.id"
                                                @changed="catalogChanged"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <p
                                    v-if="!group.projects.length"
                                    class="px-2 py-2 text-xs text-muted-foreground"
                                >
                                    {{ t('bridge.noActiveProject') }}
                                </p>
                            </div>
                        </div>
                        <div
                            v-if="!catalog.groups.length"
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
