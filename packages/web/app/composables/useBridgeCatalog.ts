import { computed, onMounted, onUnmounted, ref } from 'vue'

/** 桥接会话摘要。 */
export interface BridgeThread {
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
export interface BridgeProject {
    /** 项目标识。 */
    projectId: string
    /** 项目名称。 */
    name: string
    /** 项目路径。 */
    path: string
    /** 当前分支。 */
    branch?: string | null
    /** Codex 项目资料最近更新时间。 */
    updatedAt?: string | null
    /** 管理列表中的项目可用性，由服务端目录提供。 */
    available?: boolean
}
/** 群组下的项目及会话目录。 */
export interface BridgeCatalogProject {
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
export interface BridgeCatalogGroup {
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
export interface BridgeCatalog {
    /** 关系版本。 */
    revision: number
    /** 群组列表。 */
    groups: BridgeCatalogGroup[]
}

/** 页面级桥接目录 owner，统一读取、身份选择和历史项目合并。 */
export function useBridgeCatalog() {
    /** 本地化反馈。 */
    const { t } = useI18n()
    /** 目录错误反馈。 */
    const toast = useToast()
    /** 服务端确认的目录。 */
    const catalog = ref<BridgeCatalog>({ revision: 0, groups: [] })
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
        const projects = new Map<string, BridgeProject>()
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
    /** 根据目录记录切换项目。 */
    function selectProject(entry: BridgeCatalogProject): void {
        selectedProjectPath.value = entry.project.path
        selectedThreadId.value = ''
    }
    /** 提交已经过业务准入检查的会话选择。 */
    function selectThread(group: BridgeCatalogGroup, entry: BridgeCatalogProject, thread: BridgeThread): void {
        selectedChatId.value = group.chatId
        selectedProjectPath.value = entry.project.path
        selectedThreadId.value = thread.id
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
    function acceptThread(thread: { id: string, title: string }): void {
        if (selectedProjectEntry.value && !selectedProjectEntry.value.sessions.some(item => item.id === thread.id)) selectedProjectEntry.value.sessions.unshift(thread)
        selectedThreadId.value = thread.id
    }
    onMounted(() => { active = true; void loadCatalog() })
    onUnmounted(() => { active = false; generation++; catalogDirty = false; catalogLoading.value = false })
    return { catalog, catalogLoading, projectOptions, selectedChatId, selectedProjectPath, selectedThreadId, selectedGroup, selectedProjectEntry, selectedProject, selectedThread, loadCatalog, selectGroup, selectProject, selectThread, selectNewThread, updateThreadTitle, acceptThread }
}
