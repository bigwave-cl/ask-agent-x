<script setup lang="ts">
import BusBridgeRelationsContent from './BusBridgeRelationsContent.vue'
import BusBridgeRelationsShell from './BusBridgeRelationsShell.vue'
import BusBridgeProjectList from './BusBridgeProjectList.vue'
import BusBridgeProjectEditor from './BusBridgeProjectEditor.vue'
import BusBridgeItemMenu from './BusBridgeItemMenu.vue'
import { useBridgeServiceControl } from '@/composables/useBridgeServiceControl'
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
/** 兼容管理页与独立导入入口。 */
const props = withDefaults(defineProps<{ page?: boolean, projectPath?: string, projects: Project[], threads: Record<string, { id: string, title?: string }[]>, showModeTabs?: boolean, importOnly?: boolean }>(), { page: false, projectPath: '', showModeTabs: false, importOnly: false })
/** 外层入口开关。 */
const open = defineModel<boolean>('open', { default: false })
/** 页级管理分类。 */
const mode = defineModel<'projects' | 'groups'>('mode', { default: 'projects' })
/** 通知父级刷新目录。 */
const emit = defineEmits<{ added: [path: string], saved: [] }>()
/** 翻译入口。 */
const { t } = useI18n()
/** 统一操作反馈。 */
const toast = useToast()
/** 服务准入检查。 */
const { requireRunning } = useBridgeServiceControl()
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
    const result = props.projects.map(item => ({ ...item, available: item.available !== false && !failedProjects.value.includes(item.path) }))
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
        const result = await $fetch<Registry>('/api/bridge/groups')
        if (valid(current)) registry.value = result
    }
    catch (cause) { if (valid(current)) report(cause) }
}
/** 将每次点击依次提交，失败后使排队旧请求失效并重新读取。 */
function enqueue(project: Project, chatId: string, action: 'link' | 'unlink' | 'activate' | 'deactivate'): void {
    /** 点击时的生命周期。 */
    const current = generation
    if (pendingPaths.value.includes(project.path)) return
    pendingPaths.value.push(project.path)
    queue = queue.then(async () => {
        if (!valid(current) || !await requireRunning() || !valid(current) || !registry.value) return
        if ((action === 'link' || action === 'activate') && projects.value.find(item => item.path === project.path)?.available === false) return
        try {
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
/** 打开群项目列表。 */
function settings(chatId: string): void { groupId.value = chatId; groupOpen.value = true; queue = queue.then(() => load()) }
/** 导入或编辑项目。 */
function edit(project?: Project): void { editingProject.value = project; editorOpen.value = true }
/** 项目变化后交由父级刷新目录，同时重新读取关系。 */
function changed(): void { emit('saved'); queue = queue.then(() => load()) }
/** 导入完成通知目录 owner。 */
function projectSaved(path: string): void { emit('added', path); queue = queue.then(() => load()); if (props.importOnly) open.value = false }
/** 切换入口使旧异步操作失效。 */
function invalidate(): void { generation += 1; pendingPaths.value = []; syncing.value = false; confirmation?.destroy(); groupOpen.value = false }
watch(() => props.projects, () => { failedProjects.value = [] }, { deep: true })
watch(groupOpen, value => { confirmation?.destroy(); if (!value) { generation += 1; pendingPaths.value = []; syncing.value = false } })
watch(mode, () => { invalidate(); if (props.page || open.value) queue = queue.then(() => load()) })
watch(open, value => {
    invalidate(); if (value) { if (props.importOnly) edit(); else queue = queue.then(() => load()) }
    else editorOpen.value = false
})
watch(editorOpen, value => { if (!value && props.importOnly) open.value = false })
onMounted(() => { if (props.page || open.value) { if (props.importOnly) edit(); else queue = queue.then(() => load()) } })
onUnmounted(() => { active = false; invalidate() })
</script>

<template>
    <BusBridgeRelationsShell
        v-if="!importOnly"
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
        v-model:open="groupOpen"
        :title="t('bridge.projectSettings')"
        :description="registry?.groups.find(item => item.chatId === groupId)?.name"
        :close-label="t('common.close')"
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
            @activation-change="(project, enabled) => enqueue(project, groupId, enabled ? 'activate' : 'deactivate')"
        />
    </BusBridgeRelationsShell>
    <BusBridgeProjectEditor
        v-model:open="editorOpen"
        :project="editingProject"
        @saved="projectSaved"
    />
</template>
