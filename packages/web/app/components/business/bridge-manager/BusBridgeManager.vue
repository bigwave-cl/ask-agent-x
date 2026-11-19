<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import BusBridgeRelations from './BusBridgeRelations.vue'
import BusBridgeItemMenu from './BusBridgeItemMenu.vue'
import type { BridgeCatalogChange } from './BusBridgeItemMenu.vue'
import Button from '@/components/ui/button/Button.vue'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue'
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue'
import TooltipProvider from '@/components/ui/tooltip/TooltipProvider.vue'
import { useBridgeServiceControl } from '@/composables/useBridgeServiceControl'

/** 桥接会话摘要。 */
interface BridgeThread {
    /** 会话编号。 */
    id: string
    /** 兼容展示名称。 */
    name?: string
    /** 当前会话标题。 */
    title?: string
    /** 最近更新时间。 */
    updatedAt?: string
    /** 创建时间。 */
    createdAt?: string
}
/** 桥接消息。 */
interface BridgeMessage {
    /** 消息编号。 */
    id: string
    /** 消息来源角色。 */
    role: 'user' | 'assistant' | 'system' | string
    /** Markdown 或纯文本正文。 */
    content: string
    /** 消息时间。 */
    createdAt?: string
}
/** 可绑定的桥接项目。 */
interface BridgeProject {
    /** 服务端项目标识。 */
    projectId: string
    /** 展示名称。 */
    name: string
    /** 项目唯一路径。 */
    path: string
    /** 当前分支。 */
    branch?: string | null
}

/** 页面共享服务状态与唯一在线检查入口。 */
const { ready, requireRunning, openSettings, refreshStatus } = useBridgeServiceControl()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const threads = ref<BridgeThread[]>([])
const threadsByProject = ref<Record<string, BridgeThread[]>>({})
const projects = ref<BridgeProject[]>([])
const selectedProjectId = ref('')
/** 项目与群组面板。 */
const projectPanel = ref(false)
/** 当前关系编辑项目。 */
const relationProject = ref('')
/** 群组管理面板。 */
const groupPanel = ref(false)
const selectedThreadId = ref('')
const messages = ref<BridgeMessage[]>([])
const prompt = ref('')
const promptInput = ref<HTMLTextAreaElement | null>(null)
const loadingMessages = ref(false)
const sending = ref(false)
const errorMessage = ref('')
const composingNewSession = ref(false)
/** 完成目录刷新后再安排下一轮，避免请求积压。 */
let timer: ReturnType<typeof setTimeout> | undefined
/** 当前页面是否有效。 */
let active = false
/** 目录请求单飞入口。 */
let catalogFlight: Promise<void> | null = null
/** 目录请求取消控制器。 */
let catalogController: AbortController | undefined
/** 当前展开项目的请求控制器。 */
let threadController: AbortController | undefined
/** 会话列表请求对应的项目。 */
let threadRequestPath = ''
/** 会话列表请求序号。 */
let threadRequestId = 0
/** 历史读取控制器。 */
let messageController: AbortController | undefined
/** 历史读取对应会话。 */
let messageRequestThread = ''
/** 防止旧的轮询或切换请求覆盖当前项目状态。 */
let loadRequestId = 0
/** 会话切换和卸载失效序号。 */
let sessionGeneration = 0
/** 用户导航意图独立排序，只有最后一次点击可以提交选择。 */
let navigationGeneration = 0

const selectedThread = computed(() => threads.value.find(item => item.id === selectedThreadId.value))
const selectedProject = computed(() => projects.value.find(item => item.path === selectedProjectId.value))
const canSend = computed(() => Boolean(prompt.value.trim() && !sending.value))
const languageIsEnglish = computed(() => locale.value === 'en')

function formatDate(value?: string) {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(languageIsEnglish.value ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
/** 独立刷新目录和状态，不等待慢会话列表，也不重叠请求。 */
async function loadCatalog(): Promise<void> {
    if (catalogFlight) return catalogFlight
    const requestId = ++loadRequestId
    catalogController = new AbortController()
    const signal = catalogController.signal
    catalogFlight = (async () => {
        try {
            const directory = await $fetch<{ projects: BridgeProject[] }>('/api/bridge/projects', { signal, timeout: 10000, retry: 0 })
            if (active && requestId === loadRequestId) projects.value = directory.projects
        }
        catch { if (active && !signal.aborted) errorMessage.value = t('bridge.loadError') }
    })()
    try { await catalogFlight }
    finally { catalogFlight = null }
}
/** 仅刷新展开的项目；切换时取消旧请求，保留其他项目缓存。
 * @param force 关系保存后取消旧读取并重新加载。
 */
async function loadThreads(force = false): Promise<void> {
    const projectPath = selectedProjectId.value
    if (!projectPath || !active) return
    if (!force && threadRequestPath === projectPath && threadController) return
    threadController?.abort()
    const controller = new AbortController()
    threadController = controller
    threadRequestPath = projectPath
    const requestId = ++threadRequestId
    try {
        const result = await $fetch<{ threads: BridgeThread[] }>(`/api/bridge/threads?projectPath=${encodeURIComponent(projectPath)}`, { signal: controller.signal, timeout: 15000, retry: 0 })
        if (!active || requestId !== threadRequestId || projectPath !== selectedProjectId.value) return
        threadsByProject.value[projectPath] = result.threads
        threads.value = result.threads
    }
    catch { if (active && !controller.signal.aborted && requestId === threadRequestId) errorMessage.value = t('bridge.loadError') }
    finally { if (requestId === threadRequestId) { threadController = undefined; threadRequestPath = '' } }
}
/** 关系保存后只刷新当前展开项目，不遍历所有项目。 */
function refreshRelations(): void {
    void loadCatalog()
    void loadThreads(true)
}
/** 菜单成功后更新当前选择与缓存，再从唯一目录入口校准。 */
function catalogChanged(change: BridgeCatalogChange): void {
    if (change.action === 'rename-thread') {
        for (const item of threadsByProject.value[change.projectPath] || []) if (item.id === change.id) item.title = change.name
    }
    if (change.action === 'rename-project') {
        const project = projects.value.find(item => item.path === change.id)
        if (project && change.name) project.name = change.name
    }
    if (change.action === 'remove-project') {
        projects.value = projects.value.filter(item => item.path !== change.id)
        threadsByProject.value = Object.fromEntries(Object.entries(threadsByProject.value).filter(([path]) => path !== change.id))
        if (selectedProjectId.value === change.id) {
            sessionGeneration += 1
            selectedProjectId.value = ''
            selectedThreadId.value = ''
            messages.value = []
            threads.value = []
            composingNewSession.value = true
        }
    }
    if (change.action === 'archive-thread') {
        threadsByProject.value[change.projectPath] = (threadsByProject.value[change.projectPath] || []).filter(item => item.id !== change.id)
        threads.value = threadsByProject.value[selectedProjectId.value] || []
        if (selectedThreadId.value === change.id) { sessionGeneration += 1; selectedThreadId.value = ''; messages.value = []; composingNewSession.value = true }
    }
    refreshRelations()
}
/** 目录轮询完成后安排下一轮，会话与历史使用各自单飞入口。 */
async function poll(): Promise<void> {
    if (ready.value) {
        void loadThreads()
        if (selectedThreadId.value) void loadMessages()
    }
    await loadCatalog()
    if (active) timer = setTimeout(() => void poll(), 5000)
}
/** 读取标准消息结果，并拒绝旧会话或旧页面的响应。 */
async function loadMessages(): Promise<void> {
    const requestedThread = selectedThreadId.value
    const current = sessionGeneration
    if (!requestedThread) { messageController?.abort(); messages.value = []; return }
    if (messageController && messageRequestThread === requestedThread) return
    messageController?.abort()
    const controller = new AbortController()
    messageController = controller
    messageRequestThread = requestedThread
    loadingMessages.value = !messages.value.length
    try {
        const result = await $fetch<{ messages: BridgeMessage[] }>(`/api/bridge/threads/${encodeURIComponent(requestedThread)}/messages`, { signal: controller.signal, timeout: 15000, retry: 0 })
        if (current === sessionGeneration && requestedThread === selectedThreadId.value) messages.value = result.messages
    }
    catch { if (current === sessionGeneration && !controller.signal.aborted) errorMessage.value = t('bridge.loadError') }
    finally { if (messageController === controller) messageController = undefined; if (current === sessionGeneration) loadingMessages.value = false }
}
/** 用户入口检查服务状态，并在等待期间保持当前选择有效。 */
async function guard(action: () => void): Promise<void> {
    const navigation = ++navigationGeneration
    if (await requireRunning() && active && navigation === navigationGeneration) action()
}
/** 写入失败后重新核验服务；不重放已失败的业务操作。 */
async function recoverServiceError(current: number): Promise<void> {
    await refreshStatus(true)
    if (!active || current !== sessionGeneration) return
    if (!ready.value) openSettings()
    else errorMessage.value = t('bridge.loadError')
}
/** 中断事务只允许一个最终请求。 */
let interruptPending = false
/** 防止设置弹层恢复输入焦点时重复打开设置。 */
let suppressFocusGate = false
/** 已聚焦时保留原生光标定位，仅新进入输入框时延后聚焦。 */
function pointerComposer(event: PointerEvent): void {
    if (event.currentTarget === document.activeElement) return
    event.preventDefault()
    void focusComposer(true)
}
/** 仅用户明确聚焦或首次聚焦时检查，不重放输入。 */
async function focusComposer(explicit = false): Promise<void> {
    if (suppressFocusGate && !explicit) return
    const current = sessionGeneration
    if (!await requireRunning()) { suppressFocusGate = true; promptInput.value?.blur(); return }
    if (active && current === sessionGeneration) { suppressFocusGate = false; if (explicit) promptInput.value?.focus() }
}
/** 打开项目添加或关系面板。 */
function openProjectPanel(path = ''): void {
    void guard(() => { relationProject.value = path; projectPanel.value = true })
}
/** 选择会话，不允许离线入口变更选择。 */
function selectThread(id: string): void {
    void guard(() => { sessionGeneration += 1; sending.value = false; messages.value = []; selectedThreadId.value = id })
}
/** 新会话只建立空白输入状态，发送时再创建远端会话。 */
async function createThread(): Promise<void> {
    const navigation = ++navigationGeneration
    if (!await requireRunning() || !active || navigation !== navigationGeneration) return
    sessionGeneration += 1
    messageController?.abort()
    messageController = undefined
    sending.value = false
    selectedThreadId.value = ''
    messages.value = []
    composingNewSession.value = true
    errorMessage.value = ''
    void nextTick(() => { if (active && navigation === navigationGeneration) promptInput.value?.focus() })
}
/** 按用户选择切换项目，在线检查成功后才提交。 */
async function selectProject(projectId: string): Promise<void> {
    const navigation = ++navigationGeneration
    if (!await requireRunning() || !active || navigation !== navigationGeneration) return
    if (selectedProjectId.value === projectId) return
    sessionGeneration += 1
    threadRequestId += 1
    threadController?.abort()
    threadController = undefined
    messageController?.abort()
    messageController = undefined
    sending.value = false
    selectedProjectId.value = projectId
    threads.value = threadsByProject.value[projectId] ?? []
    selectedThreadId.value = ''
    messages.value = []
    composingNewSession.value = false
}
async function sendMessage() {
    if (!prompt.value.trim() || sending.value) return
    const current = sessionGeneration
    if (!await requireRunning() || !active || current !== sessionGeneration || sending.value) return
    if (!selectedProjectId.value) {
        if (projects.value.length) errorMessage.value = t('bridge.selectProjectFirst')
        else projectPanel.value = true
        return
    }
    const projectPath = selectedProjectId.value
    const content = prompt.value.trim(); prompt.value = ''; sending.value = true
    try {
        if (!selectedThreadId.value) {
            const thread = await $fetch<BridgeThread>('/api/bridge/threads', { method: 'POST', body: { projectPath } })
            if (current !== sessionGeneration) return
            threads.value = [thread, ...threads.value.filter(item => item.id !== thread.id)]
            if (selectedProjectId.value) threadsByProject.value[selectedProjectId.value] = threads.value
            selectedThreadId.value = thread.id
            composingNewSession.value = false
        }
        await $fetch(`/api/bridge/threads/${encodeURIComponent(selectedThreadId.value)}/turn`, { method: 'POST', body: { prompt: content } })
        if (current === sessionGeneration) await loadMessages()
    }
    catch { if (current === sessionGeneration) { prompt.value = content; await recoverServiceError(current) } }
    finally { if (current === sessionGeneration) sending.value = false }
}
/** 中断当前会话前检查服务，避免重放过期操作。 */
async function interrupt(): Promise<void> {
    if (interruptPending) return
    const current = sessionGeneration
    if (!await requireRunning() || !active || current !== sessionGeneration || !selectedThreadId.value || interruptPending) return
    interruptPending = true
    try {
        await $fetch(`/api/bridge/threads/${encodeURIComponent(selectedThreadId.value)}/interrupt`, { method: 'POST' })
        if (current === sessionGeneration) sending.value = false
    }
    catch { if (current === sessionGeneration) await recoverServiceError(current) }
    finally { interruptPending = false }
}
watch(selectedThreadId, () => {
    if (selectedThreadId.value) composingNewSession.value = false
    void loadMessages()
})
watch(selectedProjectId, (next, previous) => {
    if (next && next !== previous) {
        selectedThreadId.value = ''
        messages.value = []
        void loadThreads()
    }
})
onMounted(() => { active = true; void poll() })
onUnmounted(() => {
    active = false
    navigationGeneration += 1
    sessionGeneration += 1
    loadRequestId += 1
    threadRequestId += 1
    catalogController?.abort()
    threadController?.abort()
    messageController?.abort()
    if (timer) clearTimeout(timer)
})
</script>

<template>
    <TooltipProvider :delay-duration="150">
        <main
            class="bridge-manager h-svh overflow-hidden bg-background text-foreground"
            @keydown.tab="suppressFocusGate = false"
        >
            <section class="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] lg:grid-cols-[4.25rem_20rem_minmax(0,1fr)] lg:grid-rows-1">
                <nav class="flex items-center gap-2 border-b px-3 py-3 lg:flex-col lg:border-b-0 lg:border-r lg:px-2 lg:py-5">
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Button
                                as-child
                                variant="ghost"
                                :size="40"
                                square
                                :aria-label="t('common.home')"
                            >
                                <NuxtLink :to="localePath('/')"><Icon name="askx-navigation:home" /></NuxtLink>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                            {{ t('common.home') }}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip
                        v-for="entry in [{ key: 'sessions', icon: 'askx-objects:chat', label: t('bridge.sessionsNav') }, { key: 'groups', icon: 'askx-objects:users', label: t('bridge.groups') }]"
                        :key="entry.key"
                    >
                        <TooltipTrigger as-child>
                            <Button
                                variant="ghost"
                                :size="40"
                                square
                                :aria-label="entry.label"
                                :class="entry.key === 'sessions' ? 'text-primary' : ''"
                                @click="entry.key === 'groups' ? guard(() => { groupPanel = true }) : guard(() => { groupPanel = false; projectPanel = false })"
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
                <aside class="flex min-h-0 flex-col border-b bg-muted/30 lg:border-b-0 lg:border-r">
                    <header class="flex items-center gap-2 border-b px-4 py-4">
                        <div class="flex min-w-0 items-center gap-2">
                            <p class="truncate text-base font-semibold">
                                {{ t('common.bridgeNav') }}
                            </p>
                            <Tooltip>
                                <TooltipTrigger as-child>
                                    <span
                                        class="inline-flex size-6 shrink-0 items-center justify-center rounded-full"
                                        :class="ready ? 'text-success' : 'text-destructive'"
                                        role="status"
                                        :aria-label="t(ready ? 'bridge.runtime.running' : 'bridge.runtime.stopped')"
                                        :title="t(ready ? 'bridge.runtime.running' : 'bridge.runtime.stopped')"
                                    >
                                        <Icon
                                            :name="ready ? 'askx-status:check' : 'askx-status:prohibited'"
                                            class="size-4"
                                        />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {{ t(ready ? 'bridge.runtime.running' : 'bridge.runtime.stopped') }}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <Button
                            class="ml-auto shrink-0"
                            :size="36"
                            @click="createThread"
                        >
                            <Icon name="askx-actions:add" />{{ t('bridge.newSession') }}
                        </Button>
                    </header>
                    <p
                        v-if="errorMessage"
                        role="alert"
                        class="mx-3 mt-3 rounded-lg bg-destructive/5 p-3 text-xs text-destructive"
                    >
                        {{ errorMessage }}
                    </p>
                    <div class="flex items-center justify-between px-4 pb-2 pt-4">
                        <span class="text-xs font-medium text-muted-foreground">{{ t('bridge.projectsTitle') }}</span>
                        <Tooltip>
                            <TooltipTrigger as-child>
                                <Button
                                    variant="ghost"
                                    :size="36"
                                    square
                                    :aria-label="t('bridge.addProject')"
                                    @click="openProjectPanel()"
                                >
                                    <Icon name="askx-actions:add" />
                                </Button>
                            </TooltipTrigger><TooltipContent>{{ t('bridge.addProject') }}</TooltipContent>
                        </Tooltip>
                    </div>
                    <div class="max-h-[28svh] min-h-0 overflow-y-auto px-2 pb-5 lg:max-h-none lg:flex-1">
                        <div
                            v-for="project in projects"
                            :key="project.path"
                            class="mb-1"
                        >
                            <div
                                class="flex items-center rounded-lg"
                                :class="selectedProjectId === project.path ? 'bg-muted/70' : ''"
                            >
                                <Button
                                    variant="ghost"
                                    :size="40"
                                    class="min-w-0 flex-1 justify-start"
                                    @click="selectProject(project.path)"
                                >
                                    <Icon
                                        name="askx-objects:folder"
                                        class="shrink-0 text-primary"
                                    /><span class="truncate">{{ project.name }}</span>
                                </Button>
                                <BusBridgeItemMenu
                                    kind="project"
                                    :item-id="project.path"
                                    :label="project.name"
                                    @settings="openProjectPanel(project.path)"
                                    @changed="catalogChanged"
                                />
                            </div>
                            <div
                                v-if="selectedProjectId === project.path"
                                class="ml-5 border-l pl-2"
                            >
                                <div
                                    v-for="thread in threadsByProject[project.path] || []"
                                    :key="thread.id"
                                    class="flex items-center rounded-lg"
                                    :class="thread.id === selectedThreadId ? 'bg-primary/10' : ''"
                                >
                                    <Button
                                        variant="ghost"
                                        :size="40"
                                        class="min-w-0 flex-1 justify-start text-left"
                                        @click="selectThread(thread.id)"
                                    >
                                        <span class="min-w-0"><span class="block truncate text-sm">{{ thread.title || thread.name || thread.id }}</span><span class="block text-[10px] text-muted-foreground">{{ formatDate(thread.updatedAt || thread.createdAt) }}</span></span>
                                    </Button>
                                    <BusBridgeItemMenu
                                        kind="thread"
                                        :item-id="thread.id"
                                        :project-path="project.path"
                                        :label="thread.title || thread.name || thread.id"
                                        @changed="catalogChanged"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>
                <section class="flex min-h-0 flex-col">
                    <header
                        v-if="selectedThreadId || composingNewSession"
                        class="border-b px-6 py-4"
                    >
                        <p class="text-xs text-muted-foreground">
                            {{ selectedProject?.name }}
                        </p><h1 class="truncate text-lg font-semibold">
                            {{ selectedThread?.title || selectedThread?.name || t('bridge.newSession') }}
                        </h1>
                    </header>
                    <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
                        <p
                            v-if="loadingMessages"
                            class="text-sm text-muted-foreground"
                        >
                            {{ t('bridge.loading') }}
                        </p>
                        <article
                            v-for="message in messages"
                            :key="message.id"
                            class="flex"
                            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
                        >
                            <div
                                class="max-w-[min(46rem,92%)] rounded-2xl px-4 py-3 text-sm leading-6"
                                :class="message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-card'"
                            >
                                <BusMdcRender
                                    v-if="message.role !== 'user'"
                                    :value="message.content"
                                    :cache-key="message.id"
                                /><p
                                    v-else
                                    class="whitespace-pre-wrap break-words"
                                >
                                    {{ message.content }}
                                </p>
                            </div>
                        </article>
                    </div>
                    <form
                        class="mx-auto mb-6 w-[calc(100%-2rem)] max-w-[680px] shrink-0 rounded-2xl border bg-card p-3"
                        @submit.prevent="sendMessage"
                    >
                        <textarea
                            ref="promptInput"
                            v-model="prompt"
                            rows="3"
                            class="w-full resize-none border-0 bg-transparent p-3 text-sm outline-none"
                            :placeholder="t('bridge.chatPlaceholder')"
                            :disabled="sending"
                            @pointerdown="pointerComposer"
                            @focus="focusComposer()"
                            @keydown.meta.enter.prevent="sendMessage"
                            @keydown.ctrl.enter.prevent="sendMessage"
                        />
                        <div class="flex items-center justify-between">
                            <span class="text-[11px] text-muted-foreground">{{ selectedThreadId || composingNewSession ? t('bridge.shortcut') : '' }}</span>
                            <div class="flex gap-2">
                                <Button
                                    v-if="sending"
                                    variant="outlined"
                                    :size="36"
                                    @click="interrupt"
                                >
                                    <Icon name="askx-actions:stop" />{{ t('bridge.stop') }}
                                </Button><Button
                                    type="submit"
                                    :size="36"
                                    square
                                    shape="pill"
                                    :aria-label="t('bridge.send')"
                                    :disabled="!canSend"
                                >
                                    <Icon name="askx-navigation:arrow-up" />
                                </Button>
                            </div>
                        </div>
                    </form>
                </section>
            </section>
            <BusBridgeRelations
                v-model:open="projectPanel"
                :project-path="relationProject"
                :projects="projects"
                :threads="threadsByProject"
                @added="async (path: string) => { await loadCatalog(); await selectProject(path) }"
                @saved="refreshRelations"
            />
            <BusBridgeRelations
                v-model:open="groupPanel"
                mode="groups"
                :projects="projects"
                :threads="threadsByProject"
                @saved="refreshRelations"
            />
        </main>
    </TooltipProvider>
</template>
