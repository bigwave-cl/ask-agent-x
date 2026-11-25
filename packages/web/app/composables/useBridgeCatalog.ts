import { computed, onMounted, onUnmounted, readonly, ref } from 'vue'

import type { BridgeSessionCatalog, BridgeSessionCatalogGroup, BridgeSessionCatalogProject } from '@askx/module-feishu-bridge/session-catalog'
import type { BridgeProject } from '@askx/module-feishu-bridge/project-service'
import type { BridgeThreadSummary } from '@askx/module-feishu-bridge/thread-service'

/** 目录展示仅依赖会话身份和标题，兼容尚未读取完整摘要的新会话。 */
export type BridgeCatalogThreadView = Pick<BridgeThreadSummary, 'id' | 'title'>
/** 项目视图沿用服务端关系字段，会话允许使用轻量展示摘要。 */
export interface BridgeCatalogProjectView extends Pick<BridgeSessionCatalogProject, 'project' | 'active' | 'available'> {
    /** 当前及刚创建的会话展示列表。 */
    sessions: BridgeCatalogThreadView[]
}
/** 群视图沿用服务端身份字段，并包含页面会话视图。 */
export interface BridgeCatalogGroupView extends Pick<BridgeSessionCatalogGroup, 'chatId' | 'name' | 'activeProject'> {
    /** 当前及历史项目展示列表。 */
    projects: BridgeCatalogProjectView[]
}
/** 项目管理展示额外标记当前目录可用性。 */
type BridgeProjectOption = BridgeProject & {
    /** 项目在当前目录中的可用性。 */
    available: boolean
}

/** 页面级桥接目录 owner，统一读取、身份选择和历史项目合并。 */
export function useBridgeCatalog() {
    /** 本地化反馈。 */
    const { t } = useI18n()
    /** 目录错误反馈。 */
    const toast = useToast()
    /** 服务端目录及即时新建会话的页面展示状态。 */
    const catalog = ref<{ revision: BridgeSessionCatalog['revision'], groups: BridgeCatalogGroupView[] }>({ revision: 0, groups: [] })
    /** 当前可用的 Codex 项目。 */
    const registeredProjects = ref<BridgeProject[]>([])
    /** 当前群身份。 */
    const selectedChatId = ref('')
    /** 当前项目身份。 */
    const selectedProjectPath = ref('')
    /** 当前会话身份。 */
    const selectedThreadId = ref('')
    /** 目录读取状态。 */
    const catalogLoading = ref(false)
    /** 当前页面是否有效。 */
    let active = false
    /** 读取生命周期。 */
    let generation = 0
    /** 读取期间是否收到刷新意图。 */
    let catalogDirty = false
    /** 当前可等待的读取链。 */
    let catalogRequest: Promise<void> | undefined
    /** 当前群目录。 */
    const selectedGroup = computed(() => catalog.value.groups.find(group => group.chatId === selectedChatId.value) ?? null)
    /** 当前项目关系记录。 */
    const selectedProjectEntry = computed(() => selectedGroup.value?.projects.find(entry => entry.project.path === selectedProjectPath.value) ?? null)
    /** 当前项目详情。 */
    const selectedProject = computed(() => selectedProjectEntry.value?.project ?? null)
    /** 当前会话摘要。 */
    const selectedThread = computed(() => selectedProjectEntry.value?.sessions.find(thread => thread.id === selectedThreadId.value) ?? null)
    /** 项目面板使用的 Codex 项目全集，补入历史关系中的失效项目。 */
    const projectOptions = computed(() => {
        /** 按项目路径合并当前目录与历史项目的展示索引。 */
        const projects = new Map<string, BridgeProjectOption>()
        for (const project of registeredProjects.value) projects.set(project.path, { ...project, available: true })
        for (const group of catalog.value.groups) {
            for (const entry of group.projects) if (!projects.has(entry.project.path)) projects.set(entry.project.path, { ...entry.project, available: entry.available })
        }
        return [...projects.values()]
    })
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
        if (!active) return Promise.resolve()
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
                        $fetch<BridgeSessionCatalog>('/api/bridge/catalog', { timeout: 15000, retry: 0 }),
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
            if (!active) return
            catalogLoading.value = false
            catalogRequest = undefined
            if (active && catalogDirty) return loadCatalog()
        })
        return catalogRequest
    }

    /** 根据群身份切换目录上下文。 */
    function selectGroup(chatId: string): void {
        selectedChatId.value = chatId
        selectedProjectPath.value = catalog.value.groups.find(group => group.chatId === chatId)?.activeProject?.path || ''
        selectedThreadId.value = ''
    }
    /** 根据项目路径身份切换项目。 */
    function selectProject(projectPath: string): void {
        selectedProjectPath.value = projectPath
        selectedThreadId.value = ''
    }
    /**
     * 从最新目录解析身份后提交选择，拒绝已删除或失效的项目与会话。
     * @returns 是否在最新目录中找到可查看的会话并提交选择。
     */
    function selectThread(chatId: string, projectPath: string, threadId: string): boolean {
        /** 最新目录中的目标项目。 */
        const entry = catalog.value.groups.find(group => group.chatId === chatId)?.projects.find(item => item.project.path === projectPath)
        if (!entry?.available || !entry.sessions.some(thread => thread.id === threadId)) return false
        selectedChatId.value = chatId
        selectedProjectPath.value = projectPath
        selectedThreadId.value = threadId
        return true
    }
    /**
     * 已确认归档后仅清理对应会话选择。
     * @returns 是否因归档目标为当前会话而清理了选择。
     */
    function archiveThread(threadId: string): boolean {
        if (selectedThreadId.value !== threadId) return false
        selectedThreadId.value = ''
        return true
    }
    /** 回到当前群可写项目的新会话上下文。 */
    function selectNewThread(): void {
        selectedProjectPath.value = selectedGroup.value?.activeProject?.path || ''
        selectedThreadId.value = ''
    }
    /** 标题最终只提交到当前目录 owner，所有入口共享同一份显示值。 */
    function updateThreadTitle(threadId: string, title: string): void {
        for (const group of catalog.value.groups) for (const entry of group.projects) {
            const thread = entry.sessions.find(thread => thread.id === threadId)
            if (thread) thread.title = title
        }
    }
    /** 新建会话先加入本地目录，下一次目录读取会校准同一记录。 */
    function acceptThread(thread: BridgeCatalogThreadView): void {
        if (selectedProjectEntry.value && !selectedProjectEntry.value.sessions.some(item => item.id === thread.id)) selectedProjectEntry.value.sessions.unshift(thread)
        selectedThreadId.value = thread.id
    }
    onMounted(() => { active = true; void loadCatalog() })
    onUnmounted(() => { active = false; generation++; catalogDirty = false; catalogLoading.value = false })
    return {
        catalog: readonly(catalog), catalogLoading: readonly(catalogLoading), projectOptions: readonly(projectOptions),
        selectedChatId: readonly(selectedChatId), selectedProjectPath: readonly(selectedProjectPath), selectedThreadId: readonly(selectedThreadId),
        selectedGroup: readonly(selectedGroup), selectedProjectEntry: readonly(selectedProjectEntry), selectedProject: readonly(selectedProject), selectedThread: readonly(selectedThread),
        loadCatalog, selectGroup, selectProject, selectThread, selectNewThread, archiveThread, updateThreadTitle, acceptThread,
    }
}
