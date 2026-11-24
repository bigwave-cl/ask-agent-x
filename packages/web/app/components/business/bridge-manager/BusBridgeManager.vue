<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import BusBridgeRelations from './BusBridgeRelations.vue'
import BusBridgeItemMenu from './BusBridgeItemMenu.vue'
import BusBridgeConversation from './BusBridgeConversation.vue'
import type { BridgeCatalogChange } from './BusBridgeItemMenu.vue'
import Button from '@/components/ui/button/Button.vue'
import Switch from '@/components/ui/switch/Switch.vue'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue'
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue'
import TooltipProvider from '@/components/ui/tooltip/TooltipProvider.vue'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'
import { useBridgeServiceControl } from '@/composables/useBridgeServiceControl'

/** 桥接会话摘要。 */
interface BridgeThread {
    /** 会话编号。 */
    id: string
    /** 当前会话标题。 */
    title?: string
    /** 最近更新时间。 */
    updatedAt?: string | null
    /** 创建时间。 */
    createdAt?: string | null
}
/** Codex 项目。 */
interface BridgeProject {
    /** 项目标识。 */
    projectId: string
    /** 项目名称。 */
    name: string
    /** 项目路径。 */
    path: string
    /** 当前分支。 */
    branch?: string | null
    /** 管理列表中的项目可用性，由服务端目录提供。 */
    available?: boolean
}
/** 群组下的项目及会话目录。 */
interface BridgeCatalogProject {
    /** 项目详情。 */
    project: BridgeProject
    /** 是否是当前可写项目。 */
    active: boolean
    /** 项目是否在当前 Codex Home 中有效。 */
    available: boolean
    /** 该群组下的历史会话。 */
    sessions: BridgeThread[]
}
/** 群组目录项。 */
interface BridgeCatalogGroup {
    /** 群标识。 */
    chatId: string
    /** 群名称。 */
    name: string
    /** 当前项目。 */
    activeProject: BridgeProject | null
    /** 当前和历史项目。 */
    projects: BridgeCatalogProject[]
}
/** 会话目录响应。 */
interface BridgeCatalog {
    /** 关系版本。 */
    revision: number
    /** 群组列表。 */
    groups: BridgeCatalogGroup[]
}

const { ready, requireRunning, openSettings, refreshStatus } = useBridgeServiceControl()
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const catalog = ref<BridgeCatalog>({ revision: 0, groups: [] })
const registeredProjects = ref<BridgeProject[]>([])
const selectedChatId = ref('')
const selectedProjectPath = ref('')
const selectedThreadId = ref('')
const composingNewSession = ref(false)
/** 右侧聊天外壳的焦点入口。 */
const conversationPanel = ref<{ focus: () => void } | null>(null)
const projectPanel = ref(false)
const activeView = ref<'sessions' | 'management'>('sessions')
const managementMode = ref<'groups' | 'projects'>('groups')
const catalogLoading = ref(false)
let active = false
let generation = 0
/** 目录读取期间到达的失效事件，在当前读取完成后统一校准。 */
let catalogDirty = false
/** 可等待的目录读取链，确保开关请求使用已确认的最新版本。 */
let catalogRequest: Promise<void> | undefined
/** 正在排队或提交的项目开关，仅限制同一项目重复提交。 */
const pendingProjectActivations = ref(new Set<string>())
/** 侧栏开关按用户操作顺序提交。 */
let activationQueue = Promise.resolve()
/** 失败或卸载后使尚未执行的开关意图失效。 */
let activationGeneration = 0

const selectedGroup = computed(() => catalog.value.groups.find(group => group.chatId === selectedChatId.value) ?? null)
const selectedProjectEntry = computed(() => selectedGroup.value?.projects.find(entry => entry.project.path === selectedProjectPath.value) ?? null)
const selectedProject = computed(() => selectedProjectEntry.value?.project ?? null)
const selectedThread = computed(() => selectedProjectEntry.value?.sessions.find(thread => thread.id === selectedThreadId.value) ?? null)
/** 项目面板使用的 Codex 项目全集，补入历史关系中的失效项目。 */
const projectOptions = computed(() => {
    const projects = new Map<string, BridgeProject>()
    for (const project of registeredProjects.value) projects.set(project.path, { ...project, available: true })
    for (const group of catalog.value.groups) {
        for (const entry of group.projects) if (!projects.has(entry.project.path)) projects.set(entry.project.path, { ...entry.project, available: entry.available })
    }
    return [...projects.values()]
})
/** 历史项目与不可用项目只保留查看入口。 */
const readOnly = computed(() => Boolean(selectedProjectEntry.value && (!selectedProjectEntry.value.active || !selectedProjectEntry.value.available)))
/** 当前项目仍有效时才开放发送。 */
const canCompose = computed(() => Boolean(selectedProjectEntry.value?.active && selectedProjectEntry.value.available))
const statusLabel = computed(() => t(ready.value ? 'bridge.runtime.running' : 'bridge.runtime.stopped'))

/** 统一服务前置检查；未运行时由设置面板负责后续操作。 */
async function requireBridge(): Promise<boolean> {
    const allowed = await requireRunning()
    if (!allowed) openSettings()
    return allowed
}

/** 保留当前选择，避免目录轮询导致页面跳转。 */
function reconcileSelection(): void {
    const group = catalog.value.groups.find(item => item.chatId === selectedChatId.value) ?? catalog.value.groups[0]
    if (!group) {
        selectedChatId.value = ''
        selectedProjectPath.value = ''
        selectedThreadId.value = ''
        return
    }
    selectedChatId.value = group.chatId
    const project = group.projects.find(item => item.project.path === selectedProjectPath.value) ?? group.projects.find(item => item.active) ?? group.projects[0]
    selectedProjectPath.value = project?.project.path ?? ''
    if (!project?.sessions.some(thread => thread.id === selectedThreadId.value)) selectedThreadId.value = ''
}

/** 读取群组目录；调用方等待期间到达的刷新也一并完成。 */
function loadCatalog(): Promise<void> {
    catalogDirty = true
    if (catalogRequest) return catalogRequest
    catalogLoading.value = true
    catalogRequest = (async () => {
        do {
            catalogDirty = false
            /** 本次目录读取的有效序号。 */
            const current = ++generation
            try {
                /** 同一目录读取窗口内的群目录与项目全集。 */
                const [result, projectResult] = await Promise.all([
                    $fetch<BridgeCatalog>('/api/bridge/catalog', { timeout: 15000, retry: 0 }),
                    $fetch<{ projects: BridgeProject[] }>('/api/bridge/projects', { timeout: 15000, retry: 0 }),
                ])
                if (active && current === generation) {
                    catalog.value = result
                    registeredProjects.value = projectResult.projects
                    reconcileSelection()
                    toast.dismiss('bridge-catalog-load')
                }
            }
            catch (cause) {
                if (active && current === generation) toast.error((cause as { data?: { statusMessage?: string } }).data?.statusMessage || t('bridge.loadError'), { id: 'bridge-catalog-load' })
            }
        }
        while (active && catalogDirty)
    })().finally(() => {
        catalogLoading.value = false
        catalogRequest = undefined
        if (active && catalogDirty) return loadCatalog()
    })
    return catalogRequest
}

/** 切换群组，只改变导航上下文，不自动打开历史会话。 */
function selectGroup(chatId: string): void {
    selectedChatId.value = chatId
    selectedProjectPath.value = catalog.value.groups.find(group => group.chatId === chatId)?.activeProject?.path || ''
    selectedThreadId.value = ''
    composingNewSession.value = false
}

/** 选择项目；历史项目可查看，但不会打开可写输入。 */
function selectProject(entry: BridgeCatalogProject): void {
    selectedProjectPath.value = entry.project.path
    selectedThreadId.value = ''
    composingNewSession.value = false
}

/** 选择会话；历史项目保持只读。 */
async function selectThread(group: BridgeCatalogGroup, entry: BridgeCatalogProject, thread: BridgeThread): Promise<void> {
    if (!entry.available) { toast.error(t('bridge.projectUnavailableHint')); return }
    if (!await requireBridge()) return
    activeView.value = 'sessions'
    selectedChatId.value = group.chatId
    selectedProjectPath.value = entry.project.path
    selectedThreadId.value = thread.id
    composingNewSession.value = false
}

/** 新会话只打开输入态，真正发送时才创建 Codex thread。 */
async function createThread(): Promise<void> {
    if (!await requireBridge()) return
    activeView.value = 'sessions'
    const group = selectedGroup.value
    selectedProjectPath.value = group?.activeProject?.path || ''
    selectedThreadId.value = ''
    composingNewSession.value = true
    await nextTick()
    conversationPanel.value?.focus()
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
            if (!await requireBridge() || !active || current !== activationGeneration) return
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
    if (change.action === 'rename-thread' && selectedThread.value?.id === change.id) selectedThread.value.title = change.name
    if (selectedThreadId.value === change.id && change.action === 'archive-thread') {
        selectedThreadId.value = ''
        composingNewSession.value = false
    }
    void loadCatalog()
}

/** 已有项目进入管理列表，新增项目打开独立导入弹窗。 */
function openProjectPanel(path = ''): void {
    if (path) {
        managementMode.value = 'projects'
        activeView.value = 'management'
    }
    else projectPanel.value = true
}

/** 打开合并后的群组与项目管理页面。 */
function openManagementPage(): void {
    managementMode.value = 'groups'
    activeView.value = 'management'
}

/** Core 所需的稳定导航上下文。 */
const conversationContext = computed(() => ({ chatId: selectedChatId.value, projectPath: selectedProjectPath.value }))
/** 标题最终只提交到当前目录 owner，所有入口共享同一份显示值。 */
function updateThreadTitle(threadId: string, title: string): void {
    for (const group of catalog.value.groups) for (const entry of group.projects) {
        const thread = entry.sessions.find(thread => thread.id === threadId)
        if (thread) thread.title = title
    }
}
/** 新建会话先加入本地目录，下一次目录读取会校准同一记录。 */
function acceptThread(thread: { id: string, title: string }): void {
    if (selectedProjectEntry.value && !selectedProjectEntry.value.sessions.some(item => item.id === thread.id)) selectedProjectEntry.value.sessions.unshift(thread)
    composingNewSession.value = false
    selectedThreadId.value = thread.id
}
/** 消息、实时事件及发送生命周期统一交给会话 Core。 */
const conversation = useBridgeConversation({ threadId: selectedThreadId, context: conversationContext, canCompose, requireRunning: requireBridge, onCreated: acceptThread, onCatalogChanged: () => { void loadCatalog() }, onTitle: updateThreadTitle })
/** 模板自动解包顶层 Ref，组件间不传递可变 owner。 */
const { messages, draft, loading, loadingMore, submitting, running, canStop, connection, nextCursor } = conversation
/** 标题行内编辑复用既有目录写入 API 与授权链路。 */
async function renameConversation(name: string): Promise<boolean> {
    const threadId = selectedThreadId.value
    const projectPath = selectedProjectPath.value
    if (!threadId || !await requireBridge()) return false
    try {
        await $fetch('/api/bridge/catalog-action', { method: 'POST', body: { action: 'rename-thread', threadId, projectPath, name, confirmation: true }, retry: 0 })
        if (active) updateThreadTitle(threadId, name)
        return true
    }
    catch (cause) {
        if (active) toast.error((cause as { data?: { statusMessage?: string } }).data?.statusMessage || t('bridge.loadError'))
        return false
    }
}
onMounted(() => { active = true; void loadCatalog() })
onUnmounted(() => { active = false; generation++; activationGeneration++; pendingProjectActivations.value.clear() })
</script>

<template>
    <TooltipProvider :delay-duration="150">
        <main class="bridge-manager h-svh overflow-hidden bg-background text-foreground">
            <section
                class="grid h-full min-h-0 lg:grid-rows-1"
                :class="activeView === 'management' ? 'grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[4rem_minmax(0,1fr)]' : 'grid-rows-[auto_12rem_minmax(0,1fr)] lg:grid-cols-[4rem_20rem_minmax(0,1fr)]'"
            >
                <nav class="flex items-center gap-1 border-b px-2 py-2 lg:flex-col lg:border-b-0 lg:border-r lg:px-1.5 lg:py-4">
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Button
                                as-child
                                variant="ghost"
                                :size="40"
                                square
                                :aria-label="t('common.home')"
                            >
                                <NuxtLink :to="localePath('/')"><Icon name="askx-navigation:home-alt" /></NuxtLink>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                            {{ t('common.home') }}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip
                        v-for="entry in [
                            { key: 'sessions', icon: 'askx-objects:chat', label: t('bridge.sessionsNav') },
                            { key: 'management', icon: 'askx-objects:project-management', label: t('bridge.managementTitle') },
                        ]"
                        :key="entry.key"
                    >
                        <TooltipTrigger as-child>
                            <Button
                                variant="ghost"
                                :size="40"
                                square
                                :aria-label="entry.label"
                                :class="entry.key === 'sessions' ? 'bg-muted text-primary' : ''"
                                @click="entry.key === 'management' ? openManagementPage() : (activeView = 'sessions')"
                            >
                                <Icon :name="entry.icon" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                            {{ entry.label }}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Button
                                variant="ghost"
                                :size="40"
                                square
                                class="ml-auto lg:ml-0 lg:mt-auto"
                                :aria-label="t('bridge.serviceSettings')"
                                @click="openSettings"
                            >
                                <Icon name="askx-actions:settings" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                            {{ t('bridge.serviceSettings') }}
                        </TooltipContent>
                    </Tooltip>
                </nav>

                <aside
                    v-if="activeView === 'sessions'"
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

                <BusBridgeRelations
                    v-if="activeView === 'management'"
                    v-model:mode="managementMode"
                    page
                    :show-mode-tabs="true"
                    :projects="projectOptions"
                    :threads="{}"
                    @added="loadCatalog"
                    @saved="loadCatalog"
                />
                <BusBridgeConversation
                    v-else
                    ref="conversationPanel"
                    v-model="draft"
                    :thread-id="selectedThreadId"
                    :title="selectedThread?.title || t('bridge.newSession')"
                    :group-name="selectedGroup?.name"
                    :project-name="selectedProject?.name"
                    :messages="messages"
                    :loading="loading"
                    :loading-more="loadingMore"
                    :has-more="Boolean(nextCursor)"
                    :submitting="submitting"
                    :running="running"
                    :can-stop="canStop"
                    :can-compose="canCompose"
                    :read-only="readOnly"
                    :connection="connection"
                    :rename="renameConversation"
                    @send="conversation.send"
                    @stop="conversation.interrupt"
                    @settings="openSettings"
                    @more="conversation.loadHistory(true)"
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
        </main>
    </TooltipProvider>
</template>
