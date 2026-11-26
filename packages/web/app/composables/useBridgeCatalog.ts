import { computed, onMounted, onUnmounted, readonly, ref } from 'vue'

import type { BridgeSessionCatalog, BridgeSessionCatalogGroup, BridgeSessionCatalogProject } from '@askx/module-feishu-bridge/session-catalog'
import type { BridgeProject } from '@askx/module-feishu-bridge/project-service'
import type { BridgeThreadSummary } from '@askx/module-feishu-bridge/thread-service'

/** 目录展示使用轻量摘要，兼容尚未读取更新时间的新会话。 */
export type BridgeCatalogThreadView = Pick<BridgeThreadSummary, 'id' | 'title'> & Partial<Pick<BridgeThreadSummary, 'updatedAt'>>
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
/** 新会话群选项直接使用服务端标准激活项目。 */
export type BridgeNewSessionGroupOption = Pick<BridgeSessionCatalogGroup, 'chatId' | 'name' | 'activeProject'>

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
    /** 群、项目与会话身份统一原子提交，模式决定刷新校准策略。 */
    const selection = ref({ chatId: '', projectPath: '', threadId: '', mode: 'new-draft' as 'new-draft' | 'existing-browse' })
    /** 当前群身份。 */
    const selectedChatId = computed(() => selection.value.chatId)
    /** 当前项目身份。 */
    const selectedProjectPath = computed(() => selection.value.projectPath)
    /** 当前会话身份。 */
    const selectedThreadId = computed(() => selection.value.threadId)
    /** 新会话选项包括尚未绑定项目的群。 */
    const newSessionGroups = computed<BridgeNewSessionGroupOption[]>(() => catalog.value.groups.map(({ chatId, name, activeProject }) => ({ chatId, name, activeProject })))
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
    /** 侧栏仅按各项目首条会话更新时间排序，保留原始目录与身份选择顺序。 */
    const sidebarGroups = computed(() => catalog.value.groups.map(group => ({
        ...group,
        projects: group.projects.map((entry, index) => {
            /** 首条会话的有效时间；无有效时间的项目统一放在末尾。 */
            const timestamp = Date.parse(entry.sessions[0]?.updatedAt ?? '')
            return { entry, index, timestamp: Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY }
        }).sort((left, right) => {
            if (left.timestamp === right.timestamp) return left.index - right.index
            return left.timestamp > right.timestamp ? -1 : 1
        }).map(item => item.entry),
    })))
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
    /** 仅接受服务端激活项目与可用关系一致的项目身份。 */
    function resolveActiveProject(group: BridgeCatalogGroupView): BridgeProject | null {
        return group.projects.find(entry => entry.active && entry.available && entry.project.path === group.activeProject?.path && entry.project.projectId === group.activeProject.projectId)?.project ?? null
    }
    /** 草稿跟随激活项目，历史浏览保留原项目并校验会话存续。 */
    function reconcileSelection(): void {
        /** 当前选择对应的最新群记录。 */
        const group = catalog.value.groups.find(item => item.chatId === selectedChatId.value)
        if (!group) {
            selection.value = { chatId: '', projectPath: '', threadId: '', mode: 'new-draft' }
            return
        }
        if (selection.value.mode === 'new-draft') {
            selection.value = { chatId: group.chatId, projectPath: resolveActiveProject(group)?.path ?? '', threadId: '', mode: 'new-draft' }
            return
        }
        /** 历史项目只按已选路径恢复，不回退到群激活项目。 */
        const entry = group.projects.find(item => item.project.path === selectedProjectPath.value)
        selection.value = { ...selection.value, projectPath: entry?.project.path ?? '', threadId: entry?.sessions.some(thread => thread.id === selectedThreadId.value) ? selectedThreadId.value : '' }
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
        if (!selectNewThread(chatId)) selection.value = { chatId, projectPath: '', threadId: '', mode: 'new-draft' }
    }
    /** 根据项目路径身份切换项目，兼容历史项目浏览。 */
    function selectProject(projectPath: string): void {
        selection.value = { ...selection.value, projectPath, threadId: '', mode: 'existing-browse' }
    }
    /**
     * 从最新目录解析身份后提交选择，拒绝已删除或失效的项目与会话。
     * @returns 是否在最新目录中找到可查看的会话并提交选择。
     */
    function selectThread(chatId: string, projectPath: string, threadId: string): boolean {
        /** 最新目录中的目标项目。 */
        const entry = catalog.value.groups.find(group => group.chatId === chatId)?.projects.find(item => item.project.path === projectPath)
        if (!entry?.available || !entry.sessions.some(thread => thread.id === threadId)) return false
        selection.value = { chatId, projectPath, threadId, mode: 'existing-browse' }
        return true
    }
    /**
     * 已确认归档后仅清理对应会话选择。
     * @returns 是否因归档目标为当前会话而清理了选择。
     */
    function archiveThread(threadId: string): boolean {
        if (selectedThreadId.value !== threadId) return false
        selection.value = { ...selection.value, threadId: '' }
        return true
    }
    /**
     * 提交空草稿，或从最新目录选择指定群的有效激活项目。
     * @returns 指定群可新建或成功清空选择时返回 true；无效身份不改变选择。
     */
    function selectNewThread(chatId?: string): boolean {
        if (chatId === undefined) {
            selection.value = { chatId: '', projectPath: '', threadId: '', mode: 'new-draft' }
            return true
        }
        /** 最新目录中指定群的有效激活项目。 */
        const group = catalog.value.groups.find(item => item.chatId === chatId)
        /** 新会话可写的项目关系。 */
        const project = group ? resolveActiveProject(group) : null
        if (!project) return false
        selection.value = { chatId, projectPath: project.path, threadId: '', mode: 'new-draft' }
        return true
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
        if (selectedProjectEntry.value && !selectedProjectEntry.value.sessions.some(item => item.id === thread.id)) selectedProjectEntry.value.sessions.unshift({ ...thread, updatedAt: thread.updatedAt ?? new Date().toISOString() })
        selection.value = { ...selection.value, threadId: thread.id, mode: 'existing-browse' }
    }
    onMounted(() => { active = true; void loadCatalog() })
    onUnmounted(() => { active = false; generation++; catalogDirty = false; catalogLoading.value = false })
    return {
        catalog: readonly(catalog), newSessionGroups: readonly(newSessionGroups), sidebarGroups: readonly(sidebarGroups), catalogLoading: readonly(catalogLoading), projectOptions: readonly(projectOptions),
        selectedChatId: readonly(selectedChatId), selectedProjectPath: readonly(selectedProjectPath), selectedThreadId: readonly(selectedThreadId),
        selectedGroup: readonly(selectedGroup), selectedProjectEntry: readonly(selectedProjectEntry), selectedProject: readonly(selectedProject), selectedThread: readonly(selectedThread),
        loadCatalog, selectGroup, selectProject, selectThread, selectNewThread, archiveThread, updateThreadTitle, acceptThread,
    }
}
