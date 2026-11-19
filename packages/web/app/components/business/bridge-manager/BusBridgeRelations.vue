<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import Checkbox from '@/components/ui/checkbox/Checkbox.vue'
import { useBridgeServiceControl } from '@/composables/useBridgeServiceControl'
/** 项目摘要。 */
interface Project {
    /** 唯一路径。 */
    path: string
    /** 显示名称。 */
    name: string
}
/** 群关系注册表，所有编辑只更新此来源。 */
interface Registry {
    /** 格式版本。 */
    version: number
    /** 并发版本。 */
    revision: number
    /** 已同步群。 */
    groups: { chatId: string, name: string }[]
    /** 项目群关联。 */
    projectGroups: { chatId: string, projectPath: string }[]
    /** 会话群关联。 */
    threadGroups: { chatId: string, threadId: string, projectPath: string }[]
}
/** 面板参数。 */
const props = withDefaults(defineProps<{ mode?: 'projects' | 'groups', projectPath?: string, projects: Project[], threads: Record<string, { id: string, title?: string }[]> }>(), { mode: 'projects', projectPath: '' })
/** 面板开关。 */
const open = defineModel<boolean>('open', { default: false })
/** 新增项目通知。 */
const emit = defineEmits<{ added: [path: string], saved: [] }>()
/** 翻译入口。 */
const { t } = useI18n()
/** 页面唯一的操作准入检查。 */
const { requireRunning, refreshStatus, ready, openSettings } = useBridgeServiceControl()
/** 写入失败后区分服务已停止与真实 API 错误，始终保留草稿。 */
async function recoverWrite(cause: unknown, current: number): Promise<void> {
    await refreshStatus(true)
    if (current !== generation || !open.value) return
    if (!ready.value) { openSettings(); return }
    const candidate = cause as { data?: { statusMessage?: string }, statusMessage?: string }
    error.value = candidate.data?.statusMessage || candidate.statusMessage || t('bridge.loadError')
}
/** 群选择器受控开关。 */
const groupSelectOpen = ref(false)
/** 等待服务检查后确认面板生命周期仍有效。 */
async function allow(): Promise<boolean> {
    const current = generation
    return await requireRunning() && current === generation && open.value
}
/** 选择器只在检查通过后展开。 */
async function setGroupSelectOpen(value: boolean): Promise<void> {
    if (!value) { groupSelectOpen.value = false; return }
    if (await allow()) groupSelectOpen.value = true
}
/** 切换群前检查服务，不重放旧选择。 */
async function selectGroup(value: string | undefined): Promise<void> {
    if (await allow()) chatId.value = value || ''
}
/** 表单明确点击时才恢复焦点，避免设置关闭后的自动恢复循环。 */
async function focusField(event: PointerEvent): Promise<void> {
    const target = event.currentTarget as HTMLInputElement
    if (target === document.activeElement) return
    event.preventDefault()
    if (await allow()) target.focus()
}
/** 添加项目路径。 */
const path = ref('')
/** 可选项目名称。 */
const name = ref('')
/** 唯一关系草稿。 */
const registry = ref<Registry | null>(null)
/** 最近确认的关系快照，用于识别同步和保存期间的新编辑。 */
const savedRelations = ref('')
/** 关系语义快照，不包含服务端版本和只读群列表。 */
function relationSnapshot(value: Registry): string {
    return JSON.stringify({ projectGroups: value.projectGroups, threadGroups: value.threadGroups })
}
/** 关系面板按需读取的会话缓存。 */
const relationThreads = ref<Record<string, { id: string, title?: string }[]>>({})
/** 防止相同项目重复读取。 */
const threadFlights = new Map<string, AbortController>()
/** 点击加载指定项目的历史会话，不遍历所有项目。 */
async function loadProjectThreads(projectPath: string): Promise<void> {
    if (!await allow() || threadFlights.has(projectPath)) return
    const current = generation
    const controller = new AbortController()
    threadFlights.set(projectPath, controller)
    try {
        const result = await $fetch<{ threads: { id: string, title?: string }[] }>(`/api/bridge/threads?projectPath=${encodeURIComponent(projectPath)}`, { signal: controller.signal, timeout: 15000, retry: 0 })
        if (current === generation) relationThreads.value[projectPath] = result.threads
    }
    catch { if (current === generation && !controller.signal.aborted) error.value = t('bridge.loadError') }
    finally { if (threadFlights.get(projectPath) === controller) threadFlights.delete(projectPath) }
}
/** 释放关系面板会话读取。 */
function cancelThreadReads(): void {
    for (const controller of threadFlights.values()) controller.abort()
    threadFlights.clear()
}
/** 当前群。 */
const chatId = ref('')
/** 操作状态。 */
const busy = ref(false)
/** 错误提示。 */
const error = ref('')
/** 异步生命周期。 */
let generation = 0
/** 加载关系。 */
async function load(): Promise<void> {
    if (!await allow()) return
    const current = ++generation
    try {
        const result = await $fetch<Registry>('/api/bridge/groups')
        if (current === generation) { registry.value = result; savedRelations.value = relationSnapshot(result); chatId.value = result.groups[0]?.chatId || '' }
    }
    catch { if (current === generation) error.value = t('bridge.loadError') }
}
/** 同步飞书群列表。 */
async function sync(): Promise<void> {
    if (!await allow() || busy.value) return
    if (registry.value && relationSnapshot(registry.value) !== savedRelations.value) { error.value = t('bridge.saveBeforeSync'); return }
    busy.value = true
    const current = generation
    const baseline = savedRelations.value
    try {
        const result = await $fetch<Registry>('/api/bridge/groups/sync', { method: 'POST' })
        if (current !== generation) return
        const edited = registry.value && relationSnapshot(registry.value) !== baseline
        if (edited && relationSnapshot(result) !== baseline) { error.value = t('bridge.draftConflict'); return }
        if (edited && registry.value) { registry.value.groups = result.groups; registry.value.revision = result.revision }
        else { registry.value = result; savedRelations.value = relationSnapshot(result) }
        chatId.value = result.groups.some(group => group.chatId === chatId.value) ? chatId.value : result.groups[0]?.chatId || ''
    }
    catch (cause) { if (current === generation) await recoverWrite(cause, current) }
    finally { if (current === generation) busy.value = false }
}
/** 切换项目群关系，解除时清理从属会话关系。 */
async function toggle(projectPath: string, groupId: string): Promise<void> {
    if (!await allow() || !registry.value) return
    const index = registry.value.projectGroups.findIndex(item => item.projectPath === projectPath && item.chatId === groupId)
    if (index < 0) registry.value.projectGroups.push({ projectPath, chatId: groupId })
    else {
        registry.value.projectGroups.splice(index, 1)
        registry.value.threadGroups = registry.value.threadGroups.filter(item => item.projectPath !== projectPath || item.chatId !== groupId)
    }
}
/** 独立切换一条会话群关系，保留同群同项目的其他会话。 */
async function toggleThread(projectPath: string, groupId: string, threadId: string): Promise<void> {
    if (!await allow() || !registry.value) return
    const index = registry.value.threadGroups.findIndex(item => item.projectPath === projectPath && item.chatId === groupId && item.threadId === threadId)
    if (index < 0) registry.value.threadGroups.push({ projectPath, chatId: groupId, threadId })
    else registry.value.threadGroups.splice(index, 1)
}
/** 包含尚未在当前页加载的已关联会话，避免隐藏历史关系。 */
function availableThreads(projectPath: string, groupId: string): { id: string, title?: string }[] {
    const result = [...(relationThreads.value[projectPath] || props.threads[projectPath] || [])]
    for (const item of registry.value?.threadGroups || []) {
        if (item.projectPath === projectPath && item.chatId === groupId && !result.some(thread => thread.id === item.threadId)) result.push({ id: item.threadId })
    }
    return result
}
/** 保存新增项目或关系草稿。 */
async function save(): Promise<void> {
    if (!await allow() || busy.value) return
    busy.value = true
    const current = generation
    const submittedPath = path.value.trim()
    const submittedName = name.value
    const submittedRegistry = registry.value ? JSON.parse(JSON.stringify(registry.value)) as Registry : null
    try {
        if (props.mode === 'projects' && !props.projectPath) {
            if (!path.value.trim()) { error.value = t('bridge.pathRequired'); return }
            await $fetch('/api/bridge/projects', { method: 'POST', body: { path: submittedPath, name: submittedName.trim() || undefined } })
            if (current !== generation) return
            emit('added', submittedPath)
            if (path.value.trim() !== submittedPath || name.value !== submittedName) return
        }
        else if (submittedRegistry) {
            const result = await $fetch<Registry>('/api/bridge/groups', { method: 'PUT', body: submittedRegistry })
            if (current !== generation) return
            emit('saved')
            savedRelations.value = relationSnapshot(submittedRegistry)
            if (registry.value && relationSnapshot(registry.value) !== savedRelations.value) {
                registry.value.revision = result.revision
                error.value = t('bridge.savedMoreEdits')
                return
            }
        }
        if (current === generation) open.value = false
    }
    catch (cause) {
        if (current !== generation) return
        if ((cause as { statusCode?: number }).statusCode === 409) error.value = t('bridge.draftConflict')
        else await recoverWrite(cause, current)
    }
    finally { if (current === generation) busy.value = false }
}
watch(open, value => {
    generation += 1
    groupSelectOpen.value = false
    cancelThreadReads()
    relationThreads.value = {}
    error.value = ''; path.value = ''; name.value = ''; busy.value = false
    if (value && (props.mode === 'groups' || props.projectPath)) void load()
    else { generation += 1; registry.value = null }
})
onUnmounted(() => { generation += 1; cancelThreadReads() })
</script>

<template>
    <CsResponsiveOverlayDialogDrawer
        v-model:open="open"
        :title="t(mode === 'groups' ? 'bridge.groups' : projectPath ? 'bridge.projectSettings' : 'bridge.addProject')"
        :description="projectPath || undefined"
        :dialog="{ content: { class: 'h-[min(38rem,90dvh)] sm:max-w-xl' } }"
        :drawer="{ content: { class: 'h-[90dvh]' } }"
        shell-class="h-full min-h-0"
        body-class="min-h-0 overflow-y-auto p-6"
        footer-class="shrink-0 border-t p-4"
        :close-label="t('common.close')"
    >
        <p
            v-if="error"
            role="alert"
            class="mb-4 text-sm text-destructive"
        >
            {{ error }}
        </p>
        <div
            v-if="mode === 'projects' && !projectPath"
            class="space-y-5"
        >
            <label class="block space-y-2 text-sm"><span>{{ t('bridge.projectPath') }}</span><Input
                v-model="path"
                placeholder="/Users/…"
                @pointerdown="focusField"
            /></label>
            <label class="block space-y-2 text-sm"><span>{{ t('bridge.optionalName') }}</span><Input
                v-model="name"
                @pointerdown="focusField"
            /></label>
        </div>
        <template v-else-if="registry">
            <div class="mb-5 flex items-center gap-3">
                <CsResponsiveSelect
                    v-if="mode === 'groups'"
                    :model-value="chatId"
                    :open="groupSelectOpen"
                    :title="t('bridge.groups')"
                    :placeholder="t('bridge.groups')"
                    :close-label="t('common.close')"
                    :clear-label="t('common.close')"
                    :empty-text="t('bridge.noGroups')"
                    :options="registry.groups.map(group => ({ value: group.chatId, label: group.name }))"
                    @update:open="setGroupSelectOpen"
                    @update:model-value="selectGroup"
                />
                <Button
                    variant="outlined"
                    :size="36"
                    class="ml-auto shrink-0"
                    :disabled="busy"
                    @click="sync"
                >
                    <Icon name="askx-actions:refresh" />{{ t('bridge.syncGroups') }}
                </Button>
            </div>
            <p class="mb-5 text-xs text-muted-foreground">
                {{ t('bridge.relationHint') }}
            </p>
            <template v-if="mode === 'groups' && chatId">
                <div
                    v-for="project in projects"
                    :key="project.path"
                    class="mb-3 space-y-3 rounded-xl border p-4"
                >
                    <label class="flex items-center gap-3 text-sm"><Checkbox
                        :model-value="registry.projectGroups.some(item => item.projectPath === project.path && item.chatId === chatId)"
                        @update:model-value="toggle(project.path, chatId)"
                    />{{ project.name }}</label>
                    <div
                        v-if="registry.projectGroups.some(item => item.projectPath === project.path && item.chatId === chatId)"
                        class="space-y-3 border-t pt-3"
                    >
                        <Button
                            variant="ghost"
                            :size="36"
                            @click="loadProjectThreads(project.path)"
                        >
                            <Icon name="askx-objects:history" />{{ t('bridge.loadSessions') }}
                        </Button>
                        <label
                            v-for="thread in availableThreads(project.path, chatId)"
                            :key="thread.id"
                            class="flex items-center gap-3 text-xs"
                        ><Checkbox
                            :model-value="registry.threadGroups.some(item => item.projectPath === project.path && item.chatId === chatId && item.threadId === thread.id)"
                            @update:model-value="toggleThread(project.path, chatId, thread.id)"
                        />{{ thread.title || thread.id }}</label>
                    </div>
                </div>
            </template>
            <template v-else-if="mode === 'projects'">
                <div
                    v-for="group in registry.groups"
                    :key="group.chatId"
                    class="mb-3 space-y-3 rounded-xl border p-4"
                >
                    <label class="flex items-center gap-3 text-sm"><Checkbox
                        :model-value="registry.projectGroups.some(item => item.projectPath === projectPath && item.chatId === group.chatId)"
                        @update:model-value="toggle(projectPath, group.chatId)"
                    />{{ group.name }}</label>
                    <div
                        v-if="registry.projectGroups.some(item => item.projectPath === projectPath && item.chatId === group.chatId)"
                        class="space-y-3 border-t pt-3"
                    >
                        <Button
                            variant="ghost"
                            :size="36"
                            @click="loadProjectThreads(projectPath)"
                        >
                            <Icon name="askx-objects:history" />{{ t('bridge.loadSessions') }}
                        </Button>
                        <label
                            v-for="thread in availableThreads(projectPath, group.chatId)"
                            :key="thread.id"
                            class="flex items-center gap-3 text-xs"
                        ><Checkbox
                            :model-value="registry.threadGroups.some(item => item.projectPath === projectPath && item.chatId === group.chatId && item.threadId === thread.id)"
                            @update:model-value="toggleThread(projectPath, group.chatId, thread.id)"
                        />{{ thread.title || thread.id }}</label>
                    </div>
                </div>
            </template>
            <p class="text-xs text-muted-foreground">
                {{ t('bridge.sharedContext') }}
            </p>
        </template>
        <template #footer>
            <Button
                v-if="error"
                variant="outlined"
                :size="36"
                :disabled="busy"
                @click="load(); error = ''"
            >
                {{ t('bridge.discardReload') }}
            </Button>
            <Button
                :size="36"
                class="ml-auto"
                :disabled="busy"
                @click="save"
            >
                {{ t('bridge.save') }}
            </Button>
        </template>
    </CsResponsiveOverlayDialogDrawer>
</template>
