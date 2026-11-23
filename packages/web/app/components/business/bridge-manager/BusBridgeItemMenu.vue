<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue'
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue'
import { useBridgeServiceControl } from '@/composables/useBridgeServiceControl'
import { useConfirm } from '@/composables/useConfirm'
import type { ConfirmController } from '@/composables/useConfirm'

/** 列表菜单对应的项目或会话。 */
const props = withDefaults(defineProps<{
    /** 记录类型。 */
    kind: 'project' | 'thread'
    /** 项目路径或会话编号。 */
    itemId: string
    /** 会话所属项目路径。 */
    projectPath?: string
    /** 当前显示名称。 */
    label: string
    /** 隐藏项目设置入口。 */
    hideSettings?: boolean
    /** 当前目录不可操作时禁用菜单。 */
    disabled?: boolean
}>(), { projectPath: '', hideSettings: false, disabled: false })
/** 成功操作的最小变更通知。 */
export interface BridgeCatalogChange {
    /** 成功的操作。 */
    action: 'rename-project' | 'remove-project' | 'rename-thread' | 'archive-thread'
    /** 对应项目或会话。 */
    id: string
    /** 所属目录。 */
    projectPath: string
    /** 重命名后的显示文本。 */
    name?: string
}
/** 菜单只通知上层刷新，不维护第二份目录。 */
const emit = defineEmits<{ settings: [], changed: [change: BridgeCatalogChange] }>()
/** 翻译入口。 */
const { t } = useI18n()
/** 动作失败在当前可见层给出可读原因。 */
const toast = useToast()
/** 页面唯一服务检查入口。 */
const { requireRunning, refreshStatus, ready, openSettings } = useBridgeServiceControl()
/** 菜单受控开关。 */
const menuOpen = ref(false)
/** 重命名面板开关。 */
const renameOpen = ref(false)
/** 重命名草稿，失败与受阻时保留。 */
const renameDraft = ref('')
/** 操作提交状态。 */
const busy = ref(false)
/** 生命周期序号。 */
let generation = 0
/** 组件是否仍有效。 */
let active = true
/** 动态确认框资源。 */
let confirmation: ConfirmController | undefined
/** 只有同一个菜单记录仍有效才允许完成入口操作。 */
async function allow(): Promise<boolean> {
    if (props.disabled) return false
    const current = generation
    return await requireRunning() && active && current === generation
}
/** 受控展开，禁止触发器先行打开菜单。 */
async function updateOpen(value: boolean): Promise<void> {
    if (!value) { menuOpen.value = false; return }
    if (await allow()) { menuOpen.value = true }
}
/** 从项目菜单进入群关联设置。 */
async function settings(): Promise<void> {
    if (!await allow()) { menuOpen.value = false; return }
    menuOpen.value = false
    emit('settings')
}
/** 打开命名表单，保留已输入的草稿。 */
async function rename(): Promise<void> {
    if (!await allow()) { menuOpen.value = false; return }
    if (!renameDraft.value) renameDraft.value = props.label
    menuOpen.value = false
    renameOpen.value = true
}
/** 命名输入由明确点击进入，不因设置自动恢复焦点重开。 */
async function focusName(event: PointerEvent): Promise<void> {
    const target = event.currentTarget as HTMLInputElement
    if (target === document.activeElement) return
    event.preventDefault()
    if (await allow()) target.focus()
    else renameOpen.value = false
}
/** 提取服务端的可读错误，群关联阻塞提供明确处理建议。 */
function errorText(cause: unknown): string {
    const candidate = cause as { data?: { statusMessage?: string, message?: string }, statusMessage?: string, message?: string }
    const detail = candidate.data?.statusMessage || candidate.data?.message || candidate.statusMessage || candidate.message || t('bridge.loadError')
    return /group|association|关联/i.test(detail) ? t('bridge.unlinkBeforeRemove') : detail
}
/** 已确认的目录操作；发送前再次核验实时服务状态。 */
async function apply(action: BridgeCatalogChange['action'], name?: string): Promise<boolean> {
    if (busy.value) return false
    if (!await allow()) { menuOpen.value = false; renameOpen.value = false; return false }
    if (busy.value) return false
    if (name !== undefined && (!name || name.length > 256)) { toast.error(t('bridge.nameRequired')); return false }
    busy.value = true
    const current = generation
    const projectPath = props.kind === 'project' ? props.itemId : props.projectPath
    try {
        await $fetch('/api/bridge/catalog-action', { method: 'POST', body: { action, projectPath, threadId: props.kind === 'thread' ? props.itemId : undefined, name, confirmation: true } })
        if (!active || current !== generation) return false
        emit('changed', { action, id: props.itemId, projectPath, name })
        return true
    }
    catch (cause) {
        await refreshStatus(true)
        if (!active || current !== generation) return false
        toast.error(errorText(cause))
        if (!ready.value) { menuOpen.value = false; renameOpen.value = false; openSettings() }
        return false
    }
    finally { if (active && current === generation) busy.value = false }
}
/** 验证命名长度，成功后仅关闭本次提交的草稿。 */
async function saveName(): Promise<void> {
    const name = renameDraft.value.trim()
    if (await apply(props.kind === 'project' ? 'rename-project' : 'rename-thread', name)) {
        if (renameDraft.value.trim() === name) { renameOpen.value = false; renameDraft.value = '' }
    }
}
/** 使用 Demo 的统一确认入口，解释保留磁盘与历史的语义。 */
async function remove(): Promise<void> {
    if (!await allow()) { menuOpen.value = false; return }
    menuOpen.value = false
    const current = generation
    confirmation = useConfirm({
        title: t(props.kind === 'project' ? 'bridge.removeProject' : 'bridge.archiveThread'),
        desc: `${props.label}\n${t(props.kind === 'project' ? 'bridge.removeProjectHint' : 'bridge.archiveThreadHint')}`,
        cancelText: t('common.cancel'),
        okText: t(props.kind === 'project' ? 'bridge.removeProject' : 'bridge.archiveThread'),
        okVariant: 'destructive',
        onOk: async done => {
            if (!active || current !== generation) { done(); return }
            await apply(props.kind === 'project' ? 'remove-project' : 'archive-thread')
            done()
        },
    })
}
watch(() => props.itemId, () => { generation += 1; menuOpen.value = false; renameOpen.value = false; renameDraft.value = ''; confirmation?.destroy() })
onUnmounted(() => { active = false; generation += 1; confirmation?.destroy() })
</script>

<template>
    <Tooltip>
        <TooltipTrigger as-child>
            <span class="inline-flex shrink-0">
                <CsResponsiveOverlayPopoverDrawer
                    :open="menuOpen"
                    :title="label"
                    :show-header="false"
                    :show-close="{ desktop: false, mobile: true }"
                    :close-label="t('common.close')"
                    :popover="{ content: { side: 'bottom', align: 'end', sideOffset: 6, class: 'w-48' } }"
                    body-class="p-1.5"
                    @update:open="updateOpen"
                >
                    <template #trigger><Button
                        variant="ghost"
                        :size="36"
                        square
                        :aria-label="`${t('bridge.itemMenu')} · ${label}`"
                        :disabled="disabled"
                    ><Icon name="askx-actions:more" /></Button></template>
                    <div class="grid gap-1">
                        <Button
                            v-if="kind === 'project' && !hideSettings"
                            variant="ghost"
                            :size="36"
                            class="justify-start"
                            @click="settings"
                        ><Icon name="askx-actions:settings" />{{ t('bridge.projectSettings') }}</Button>
                        <Button
                            variant="ghost"
                            :size="36"
                            class="justify-start"
                            @click="rename"
                        ><Icon name="askx-actions:edit" />{{ t('bridge.rename') }}</Button>
                        <Button
                            variant="ghost"
                            :size="36"
                            class="justify-start text-destructive"
                            @click="remove"
                        ><Icon name="askx-actions:delete" />{{ t(kind === 'project' ? 'bridge.removeProject' : 'bridge.archiveThread') }}</Button>
                    </div>
                </CsResponsiveOverlayPopoverDrawer>
            </span>
        </TooltipTrigger>
        <TooltipContent>{{ t('bridge.itemMenu') }} · {{ label }}</TooltipContent>
    </Tooltip>
    <CsResponsiveOverlayDialogDrawer
        v-model:open="renameOpen"
        :title="t('bridge.rename')"
        :description="label"
        :close-label="t('common.close')"
        :dialog="{ content: { class: 'sm:max-w-md' } }"
        body-class="p-5"
        footer-class="border-t p-4"
    >
        <form
            class="space-y-3"
            @submit.prevent="saveName"
        >
            <label class="block space-y-2 text-sm"><span>{{ t('bridge.displayName') }}</span><Input
                v-model="renameDraft"
                :maxlength="256"
                @pointerdown="focusName"
            /></label>
        </form>
        <template #footer>
            <Button
                variant="outlined"
                :size="36"
                :disabled="busy"
                @click="renameOpen = false"
            >
                {{ t('common.cancel') }}
            </Button><Button
                :size="36"
                :disabled="busy"
                @click="saveName"
            >
                {{ t('bridge.saveName') }}
            </Button>
        </template>
    </CsResponsiveOverlayDialogDrawer>
</template>
