<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import { useBridgeServiceControl } from '@/composables/useBridgeServiceControl'

/** 编辑器只修改现有目录名称，不迁移目录身份。 */
const props = defineProps<{
    /** 缺省时登记新项目。 */
    project?: { /** 项目目录身份。 */ path: string, /** 显示名称。 */ name: string }
}>()
/** 弹层由调用方控制。 */
const open = defineModel<boolean>('open', { default: false })
/** 保存后通知调用方刷新目录。 */
const emit = defineEmits<{ saved: [path: string] }>()
/** 翻译入口。 */
const { t } = useI18n()
/** 路径输入框与标签的唯一关联标识。 */
const pathInputId = useId()
/** 失败与成功反馈。 */
const toast = useToast()
/** 共享的服务准入入口。 */
const { requireRunning } = useBridgeServiceControl()
/** 路径草稿，失败后保留。 */
const pathDraft = ref('')
/** 名称草稿，失败后保留。 */
const nameDraft = ref('')
/** 提交状态。 */
const busy = ref(false)
/** 文件夹选择状态。 */
const selecting = ref(false)
/** 当前编辑身份，用于避免覆盖相同项目草稿。 */
let draftIdentity: string | undefined
/** 弹层与组件生命周期序号。 */
let generation = 0
/** 组件是否仍有效。 */
let active = true
/** 解析边界错误，已知路径错误使用本地化说明。 */
function errorText(cause: unknown): string {
    /** HTTP 错误可读字段。 */
    const error = cause as { data?: { code?: string, statusMessage?: string, message?: string }, statusMessage?: string, message?: string }
    return error.data?.code === 'project_path_invalid' ? t('bridge.projectPathInvalid') : error.data?.statusMessage || error.data?.message || error.statusMessage || error.message || t('bridge.loadError')
}
/** 选择本机现有目录；取消选择不清空草稿。 */
async function chooseFolder(): Promise<void> {
    if (selecting.value || busy.value) return
    /** 选择器打开时的生命周期。 */
    const current = generation
    selecting.value = true
    try {
        if (!await requireRunning() || !active || current !== generation) return
        /** 服务端目录选择结果，兼容当前目录数组响应。 */
        const result = await $fetch<{ path?: string | null, directories?: { name: string, path: string }[] }>('/api/bridge/projects/select', { method: 'POST' })
        if (!active || current !== generation) return
        /** 取消时没有候选路径。 */
        const path = result.path ?? result.directories?.[0]?.path
        if (path) pathDraft.value = path
    }
    catch (cause) { if (active && current === generation) toast.error(errorText(cause)) }
    finally { if (active && current === generation) selecting.value = false }
}
/** 提交现有目录登记或名称编辑，服务端验证目录可达性。 */
async function save(): Promise<void> {
    if (busy.value || selecting.value) return
    /** 本次明确提交的路径和名称。 */
    const path = pathDraft.value.trim()
    /** 提交时名称快照。 */
    const name = nameDraft.value.trim()
    if (!path) { toast.error(t('bridge.pathRequired')); return }
    if ((props.project && !name) || name.length > 256) { toast.error(t('bridge.nameRequired')); return }
    /** 本次弹层生命周期。 */
    const current = generation
    busy.value = true
    try {
        if (!await requireRunning() || !active || current !== generation) return
        if (props.project) await $fetch('/api/bridge/catalog-action', { method: 'POST', body: { action: 'rename-project', projectPath: props.project.path, name, confirmation: true } })
        else await $fetch('/api/bridge/projects', { method: 'POST', body: { path, ...(name ? { name } : {}) } })
        if (!active || current !== generation) return
        toast.success(t('bridge.projectSaved'))
        emit('saved', path)
        open.value = false
        pathDraft.value = ''
        nameDraft.value = ''
        draftIdentity = undefined
    }
    catch (cause) { if (active && current === generation) toast.error(errorText(cause)) }
    finally { if (active && current === generation) busy.value = false }
}
watch([open, () => props.project?.path], () => {
    generation += 1
    busy.value = false
    selecting.value = false
    if (!open.value) return
    /** 当前需要展示的编辑身份。 */
    const identity = props.project?.path ?? ''
    if (draftIdentity !== identity) {
        pathDraft.value = props.project?.path ?? ''
        nameDraft.value = props.project?.name ?? ''
        draftIdentity = identity
    }
}, { immediate: true, flush: 'sync' })
onUnmounted(() => { active = false; generation += 1 })
</script>

<template>
    <CsResponsiveOverlayDialogDrawer
        v-model:open="open"
        :title="t(project ? 'bridge.projectSettings' : 'bridge.importProject')"
        :close-label="t('common.close')"
        :dialog="{ content: { class: 'sm:max-w-lg' } }"
        body-class="p-5"
        footer-class="border-t p-4"
    >
        <form
            class="space-y-4"
            @submit.prevent="save"
        >
            <div class="space-y-2 text-sm">
                <label
                    :for="pathInputId"
                    class="block"
                >{{ t('bridge.projectPath') }}</label>
                <div class="flex items-center gap-3">
                    <Input
                        :id="pathInputId"
                        v-model="pathDraft"
                        class="h-10 min-w-0 flex-1"
                        :readonly="!!project"
                        :disabled="busy || selecting"
                        :placeholder="t('bridge.absolutePathPlaceholder')"
                    />
                    <Button
                        v-if="!project"
                        type="button"
                        variant="outlined"
                        :size="40"
                        class="shrink-0"
                        :disabled="busy || selecting"
                        @click="chooseFolder"
                    >
                        <Icon name="askx-objects:folder" />{{ t('bridge.chooseProjectFolder') }}
                    </Button>
                </div>
                <p class="text-xs leading-5 text-muted-foreground">
                    {{ t(project ? 'bridge.projectIdentityHint' : 'bridge.importProjectHint') }}
                </p>
            </div>
            <label class="block space-y-2 text-sm"><span>{{ t(project ? 'bridge.displayName' : 'bridge.optionalName') }}</span><Input
                v-model="nameDraft"
                class="h-10"
                :disabled="busy"
                :maxlength="256"
            /></label>
            <button
                type="submit"
                class="sr-only"
                tabindex="-1"
            >
                {{ t('bridge.saveName') }}
            </button>
        </form>
        <template #footer>
            <Button
                variant="outlined"
                :size="36"
                @click="open = false"
            >
                {{ t('common.cancel') }}
            </Button>
            <Button
                :size="36"
                :disabled="busy || selecting"
                @click="save"
            >
                {{ t(project ? 'bridge.saveName' : 'bridge.importProject') }}
            </Button>
        </template>
    </CsResponsiveOverlayDialogDrawer>
</template>
