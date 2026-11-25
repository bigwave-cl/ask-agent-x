<script setup lang="ts">
import BusBridgeRelationsContent from './BusBridgeRelationsContent.vue'
import BusBridgeRelationsShell from './BusBridgeRelationsShell.vue'
import BusBridgeProjectList from './BusBridgeProjectList.vue'
import BusBridgeProjectEditor from './BusBridgeProjectEditor.vue'
import BusBridgeItemMenu from './BusBridgeItemMenu.vue'
import { useBridgeProjectSettings, type BridgeProjectSettingsTarget } from '@/composables/useBridgeProjectSettings'
import { useBridgeServiceControl } from '@/composables/useBridgeServiceControl'
import { useBridgeProjectDeactivationConfirm } from '@/composables/useBridgeProjectDeactivationConfirm'
import { useConfirm } from '@/composables/useConfirm'
import type { ConfirmController } from '@/composables/useConfirm'
/** 项目目录摘要。 */
interface Project {
    /** 项目身份。 */
    path: string
    /** 显示名称。 */
    name: string
    /** 当前目录可用性。 */
    available?: boolean
    /** Codex 项目最近更新时间。 */
    updatedAt?: string | null
}
/** 服务端关系快照，保留全部历史会话。 */
interface Registry {
    /** 格式版本。 */
    version: number
    /** 并发版本。 */
    revision: number
    /** 群目录。 */
    groups: { chatId: string, name: string, updatedAt?: string | null }[]
    /** 项目关系。 */
    projectGroups: { chatId: string, projectPath: string, active?: boolean }[]
    /** 会话关系。 */
    threadGroups: { chatId: string, threadId: string, projectPath: string }[]
    /** 待处理迁移冲突。 */
    migrationConflicts?: { chatId: string, projectPaths: string[] }[]
}
/** 页面消费上层目录，动态目标独立读取必要数据。 */
const props = withDefaults(defineProps<{
    /** 内嵌关系管理页面。 */
    page?: boolean
    /** 动态打开的群、项目或导入目标。 */
    target?: BridgeProjectSettingsTarget
    /** 已发出的请求成功后通知原调用方，不依赖弹窗仍挂载。 */
    committed?: () => void | Promise<void>
    /** 页面目录 owner 提供的只读项目集合。 */
    projects?: readonly Project[]
    /** 是否展示管理分类。 */
    showModeTabs?: boolean
}>(), { page: false, target: undefined, projects: () => [], showModeTabs: false })
/** 外层入口开关。 */
const open = defineModel<boolean>('open', { default: false })
/** 页级管理分类。 */
const mode = defineModel<'projects' | 'groups'>('mode', { default: 'projects' })
/** 通知父级刷新目录。 */
const emit = defineEmits<{ saved: [], afterClose: [] }>()
/** 翻译入口。 */
const { t } = useI18n()
/** 统一操作反馈。 */
const toast = useToast()
/** 服务准入检查。 */
const { requireRunning } = useBridgeServiceControl()
/** 关闭项目授权与取消入口。 */
const deactivationConfirm = useBridgeProjectDeactivationConfirm()
/** 管理页打开设置时统一交给动态挂载入口。 */
const { openProjectSettings } = useBridgeProjectSettings()
/** 动态目标读取的项目全集。 */
const targetProjects = ref<Project[]>([])
/** 唯一持久化关系快照。 */
const registry = ref<Registry | null>(null)
/** 当前群项目弹窗身份。 */
const groupId = ref('')
/** 项目弹窗开关。 */
const groupOpen = ref(false)
/** 项目编辑器开关。 */
const editorOpen = ref(false)
/** 待编辑项目，缺省表示导入。 */
const editingProject = ref<Project>()
/** 已排队的项目路径，允许其他项目继续排队。 */
const pendingPaths = ref<string[]>([])
/** 群同步状态。 */
const syncing = ref(false)
/** 本轮服务端确认失效的项目。 */
const failedProjects = ref<string[]>([])
/** 生命周期序号。 */
let generation = 0
/** 组件有效标记。 */
let active = true
/** 关系写入串行链。 */
let queue = Promise.resolve()
/** 动态确认框。 */
let confirmation: ConfirmController | undefined
/** 当前界面是否仍有效。 */
function valid(current: number): boolean { return active && current === generation && (props.page || open.value) }
/** 可见项目包含目录中已失效的历史关联。 */
const projects = computed<Project[]>(() => {
    /** 合并目录可用性与本轮校验结果。 */
    const result = (props.page ? props.projects : targetProjects.value).map(item => ({ ...item, available: item.available !== false && !failedProjects.value.includes(item.path) }))
    for (const item of registry.value?.projectGroups || []) {
        if (!result.some(project => project.path === item.projectPath)) result.push({ path: item.projectPath, name: item.projectPath.split('/').pop() || item.projectPath, available: false, updatedAt: null })
    }
    return result
})
/** 当前群关联的项目路径。 */
const linkedPaths = computed(() => registry.value?.projectGroups.filter(item => item.chatId === groupId.value).map(item => item.projectPath) || [])
/** 当前群激活的项目。 */
const activePath = computed(() => registry.value?.projectGroups.find(item => item.chatId === groupId.value && item.active)?.projectPath || '')
/** 已知校验错误使用本地化反馈。 */
function report(cause: unknown): void {
    /** Nitro 错误信封。 */
    const error = cause as { statusCode?: number, data?: { statusCode?: number, statusMessage?: string, data?: { code?: string, projectPath?: string, threadId?: string } } }
    /** 结构化业务校验详情。 */
    const detail = error.data?.data
    /** 业务错误与双语文案映射。 */
    const keys: Record<string, string> = { project_unavailable: 'projectUnavailableError', project_path_mismatch: 'projectPathMismatchError', thread_unavailable: 'threadUnavailableError', thread_project_mismatch: 'threadProjectMismatchError' }
    if (detail?.code && keys[detail.code]) {
        if (detail.projectPath && ['project_unavailable', 'project_path_mismatch'].includes(detail.code)) failedProjects.value = [...new Set([...failedProjects.value, detail.projectPath])]
        toast.error(t(`bridge.${keys[detail.code]}`, { path: detail.projectPath || '', id: detail.threadId || '' }))
    }
    else toast.error(t(error.statusCode === 409 || error.data?.statusCode === 409 ? 'bridge.relationsConflictReloaded' : 'bridge.loadError'))
}
/** 只读取关系，不修改项目和会话历史。 */
async function load(current = generation): Promise<void> {
    try {
        /** 服务端确认的唯一关系快照。 */
        const [result, projectResult] = await Promise.all([
            $fetch<Registry>('/api/bridge/groups'),
            props.page ? Promise.resolve(null) : $fetch<{ projects: Project[] }>('/api/bridge/projects'),
        ])
        if (valid(current)) {
            registry.value = result
            if (projectResult) targetProjects.value = projectResult.projects
        }
    }
    catch (cause) { if (valid(current)) report(cause) }
}
/** 将每次点击依次提交，失败后使排队旧请求失效并重新读取。 */
function enqueue(project: Project, chatId: string, action: 'link' | 'unlink' | 'activate' | 'deactivate', approvedRevision?: number): void {
    /** 点击时的生命周期。 */
    const current = generation
    if (pendingPaths.value.includes(project.path)) return
    pendingPaths.value.push(project.path)
    queue = queue.then(async () => {
        if (!valid(current) || !await requireRunning() || !valid(current) || !registry.value) return
        if (action === 'deactivate' && (!groupOpen.value || groupId.value !== chatId || registry.value.revision !== approvedRevision || activePath.value !== project.path)) return
        if ((action === 'link' || action === 'activate') && projects.value.find(item => item.path === project.path)?.available === false) return
        try {
            /** 已发送事务绑定原调用方，关窗或切换目标不能吞掉提交通知。 */
            const committed = props.committed
            /** 服务端确认的唯一关系快照。 */
            let result: Registry
            if (action === 'activate' || action === 'deactivate') {
                result = await $fetch<Registry>('/api/bridge/groups/activate', { method: 'POST', body: { chatId, projectPath: project.path, active: action === 'activate', revision: registry.value.revision }, retry: 0 })
            }
            else {
                /** 关联修改只从最近确认快照准备，激活规则交由服务层处理。 */
                const draft = JSON.parse(JSON.stringify(registry.value)) as Registry
                /** 执行时重新确认关联是否存在。 */
                const linked = draft.projectGroups.some(item => item.chatId === chatId && item.projectPath === project.path)
                if (action === 'link' && !linked) draft.projectGroups.push({ chatId, projectPath: project.path, active: !draft.projectGroups.some(item => item.chatId === chatId && item.active) })
                if (action === 'unlink') {
                    draft.projectGroups = draft.projectGroups.filter(item => item.chatId !== chatId || item.projectPath !== project.path)
                    draft.threadGroups = draft.threadGroups.filter(item => item.chatId !== chatId || item.projectPath !== project.path)
                    draft.migrationConflicts = draft.migrationConflicts?.map(item => item.chatId === chatId ? { ...item, projectPaths: item.projectPaths.filter(path => path !== project.path) } : item).filter(item => item.chatId !== chatId || item.projectPaths.length > 1)
                }
                result = await $fetch<Registry>('/api/bridge/groups', { method: 'PUT', body: draft })
            }
            void committed?.()
            if (!valid(current)) return
            registry.value = result
            toast.success(t(action === 'activate' ? 'bridge.projectActivated' : action === 'deactivate' ? 'bridge.projectDeactivated' : action === 'link' ? 'bridge.projectLinked' : 'bridge.projectUnlinked'))
            emit('saved')
        }
        catch (cause) {
            if (!valid(current)) return
            report(cause)
            generation += 1
            pendingPaths.value = []
            confirmation?.destroy()
            await load()
        }
    }).finally(() => { if (valid(current)) pendingPaths.value = pendingPaths.value.filter(path => path !== project.path) })
}
/** 关闭需要确认，切换项目继续直接进入原串行入口。 */
function activationChange(project: Project, enabled: boolean): void {
    deactivationConfirm.cancel()
    if (enabled) { enqueue(project, groupId.value, 'activate'); return }
    if (!registry.value || !groupOpen.value || activePath.value !== project.path) return
    /** 授权绑定当时的群、生命周期和服务端版本。 */
    const chatId = groupId.value
    /** 授权时的生命周期。 */
    const current = generation
    /** 授权时的关系版本。 */
    const revision = registry.value.revision
    deactivationConfirm.requestDeactivation(project.name, () => {
        if (!valid(current) || !groupOpen.value || groupId.value !== chatId || registry.value?.revision !== revision || activePath.value !== project.path) return
        enqueue(project, chatId, 'deactivate', revision)
    })
}
/** 取消关联须确认，仅删除指定群关系。 */
function toggle(project: Project): void {
    if (!linkedPaths.value.includes(project.path)) { enqueue(project, groupId.value, 'link'); return }
    /** 确认框绑定的群身份。 */
    const chatId = groupId.value
    /** 点击时的生命周期。 */
    const current = generation
    confirmation?.destroy()
    confirmation = useConfirm({ title: t('bridge.unlinkProject'), desc: `${project.path}\n${t('bridge.unlinkProjectHint')}`, okText: t('bridge.unlinkProject'), cancelText: t('common.cancel'), onOk: done => { if (valid(current)) enqueue(project, chatId, 'unlink'); done() } })
}
/** 同步群列表也进入同一串行链，防止覆盖关联写入。 */
function sync(): void {
    if (syncing.value) return
    /** 点击时的生命周期。 */
    const current = generation
    syncing.value = true
    queue = queue.then(async () => {
        if (!valid(current) || !await requireRunning() || !valid(current)) return
        try {
            /** 服务端确认的唯一关系快照。 */
            const result = await $fetch<Registry>('/api/bridge/groups/sync', { method: 'POST' })
            if (valid(current)) { registry.value = result; emit('saved'); toast.success(t('bridge.groupsRefreshed')) }
        }
        catch (cause) { if (valid(current)) report(cause) }
    }).finally(() => { if (valid(current)) syncing.value = false })
}
/** 管理页群设置统一动态打开，保存后校准关系与目录。 */
function settings(chatId: string): void { openProjectSettings({ kind: 'group', chatId, onSaved: changed }) }
/** 页面编辑走动态入口，群绑定内部保留局部导入或编辑子表单。 */
function edit(project?: Project): void {
    if (props.page) {
        openProjectSettings(project ? { kind: 'project', projectPath: project.path, onSaved: changed } : { kind: 'import', onSaved: changed })
        return
    }
    editingProject.value = project
    editorOpen.value = true
}
/** 成功写入后通知上层目录 owner，同时串行重读关系。 */
function changed(): void { emit('saved'); queue = queue.then(() => load()) }
/** 为编辑请求捕获原调用方，并只校准仍有效的群弹窗。 */
function editorCommitted(): () => void {
    /** 当前目标的调用方通知。 */
    const committed = props.committed
    /** 子表单打开时的群生命周期。 */
    const current = generation
    return () => {
        void committed?.()
        if (valid(current) && props.target?.kind === 'group') queue = queue.then(() => load())
    }
}
/** 动态目标准备只读数据，提交前仍走既有服务准入和队列。 */
async function initialize(): Promise<void> {
    if (props.page) { await load(); return }
    /** 本次目标打开生命周期。 */
    const current = generation
    if (!open.value || !props.target) return
    if (props.target.kind === 'import') { edit(); return }
    if (props.target.kind === 'group') { groupId.value = props.target.chatId; groupOpen.value = true }
    await load(current)
    if (!valid(current) || !props.target || props.target.kind !== 'project') return
    /** 只从本次加载的项目全集解析编辑目标。 */
    const project = targetProjects.value.find(project => props.target?.kind === 'project' && project.path === props.target.projectPath)
    if (project) edit(project)
    else { toast.error(t('bridge.loadError')); open.value = false; emit('afterClose') }
}
/** 切换入口使旧异步操作失效。 */
function invalidate(): void { deactivationConfirm.cancel(); generation += 1; pendingPaths.value = []; syncing.value = false; confirmation?.destroy(); groupOpen.value = false }
watch(() => props.projects, () => { failedProjects.value = [] }, { deep: true })
watch([groupOpen, groupId, activePath, () => registry.value?.revision], () => deactivationConfirm.cancel(), { flush: 'sync' })
watch(groupOpen, value => {
    confirmation?.destroy()
    if (!value) { generation += 1; pendingPaths.value = []; syncing.value = false }
    if (!props.page && props.target?.kind === 'group') open.value = value
})
watch(mode, () => { invalidate(); if (props.page) queue = queue.then(() => load()) })
watch(open, value => {
    invalidate()
    if (value) queue = queue.then(() => initialize())
    else editorOpen.value = false
}, { flush: 'sync' })
watch(editorOpen, value => { if (!props.page && props.target?.kind !== 'group') open.value = value })
onMounted(() => { if (props.page || open.value) queue = queue.then(() => initialize()) })
onUnmounted(() => { active = false; invalidate() })
</script>

<template>
    <BusBridgeRelationsShell
        v-if="page"
        v-model:open="open"
        :page="page"
        :title="t('common.bridgeNav')"
        :page-eyebrow="t('bridge.managementTitle')"
        :close-label="t('common.close')"
    >
        <BusBridgeRelationsContent
            :mode="mode"
            :show-mode-tabs="showModeTabs"
            :groups="registry?.groups || []"
            :syncing="syncing"
            @update:mode="mode = $event"
            @settings="settings"
            @sync="sync"
        >
            <BusBridgeProjectList
                :projects="projects"
                @import="edit()"
                @edit="edit"
                @changed="changed"
            >
                <template #operations="{ project }">
                    <BusBridgeItemMenu
                        kind="project"
                        :item-id="project.path"
                        :label="project.name"
                        :disabled="project.available === false"
                        @settings="edit(project)"
                        @changed="changed"
                    />
                </template>
            </BusBridgeProjectList>
        </BusBridgeRelationsContent>
    </BusBridgeRelationsShell>
    <BusBridgeRelationsShell
        v-if="!page && target?.kind === 'group'"
        v-model:open="groupOpen"
        :title="t('bridge.projectSettings')"
        :description="registry?.groups.find(item => item.chatId === groupId)?.name"
        :close-label="t('common.close')"
        @after-close="emit('afterClose')"
    >
        <p class="mb-4 shrink-0 text-xs leading-5 text-muted-foreground">
            {{ t('bridge.currentProjectHint') }}
        </p>
        <BusBridgeProjectList
            :projects="projects"
            relation-mode
            :linked-paths="linkedPaths"
            :active-path="activePath"
            :pending-paths="pendingPaths"
            @import="edit()"
            @edit="edit"
            @changed="changed"
            @toggle="toggle"
            @activation-change="activationChange"
        />
    </BusBridgeRelationsShell>
    <BusBridgeProjectEditor
        v-if="!page"
        v-model:open="editorOpen"
        :project="editingProject"
        :committed="editorCommitted()"
        @after-close="target?.kind !== 'group' && emit('afterClose')"
    />
</template>
