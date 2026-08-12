<script setup lang="ts">
import type {
    CanonicalSkillsBackup,
    CanonicalSourceAction,
    CanonicalSourceMutationPlan,
    CanonicalSourceMutationReceipt,
    ClearModule,
} from '@askx/module-skills/canonical-source-manager'
import ResponsiveMultiSelect from '@/components/common/responsive-multi-select/index.vue'

/** 统一源备份管理组件属性。 */
interface Props {
    /** 外部流程是否正在占用 Skills 写操作。 */
    disabled?: boolean
}

withDefaults(defineProps<Props>(), { disabled: false })
const emit = defineEmits<{ /** 统一源或备份发生变化。 */ updated: [] }>()
const { locale, t } = useI18n()
const toast = useToast()

/** 备份管理弹层是否打开。 */
const managerOpen = ref(false)
/** 二次操作确认弹层是否打开。 */
const confirmOpen = ref(false)
/** 清空结果弹层是否打开。 */
const resultOpen = ref(false)
/** 用户可管理的长期备份。 */
const backups = ref<CanonicalSkillsBackup[]>([])
/** 当前等待确认的安全计划。 */
const pendingPlan = ref<CanonicalSourceMutationPlan | null>(null)
/** 最近一次清空操作的结构化回执。 */
const clearReceipt = ref<CanonicalSourceMutationReceipt | null>(null)
/** 用户在清空表单中选择的基础模块。 */
const selectedClearModules = ref<ClearModule[]>(['links', 'skills'])
/** 清空前是否创建长期备份。 */
const backupBeforeClear = ref(true)
/** 用户设置的备份名称。 */
const backupLabel = ref('')
/** 是否正在读取默认备份名称。 */
const loadingBackupLabel = ref(false)
/** 是否正在读取备份。 */
const loadingBackups = ref(false)
/** 是否正在生成计划。 */
const preparing = ref(false)
/** 是否正在应用确认后的操作。 */
const applying = ref(false)

/** 当前确认弹层标题。 */
const confirmTitle = computed(() => {
    if (pendingPlan.value?.action === 'restore') return t('skills.restoreCanonicalBackupTitle')
    if (pendingPlan.value?.action === 'delete-backup') return t('skills.deleteCanonicalBackupTitle')
    return t('skills.clearCanonicalSourceTitle')
})

/** 当前确认弹层说明。 */
const confirmDescription = computed(() => {
    if (pendingPlan.value?.action === 'restore') return t('skills.restoreCanonicalBackupDescription')
    if (pendingPlan.value?.action === 'delete-backup') return t('skills.deleteCanonicalBackupDescription')
    if (pendingPlan.value && !pendingPlan.value.backupRequested) return t('skills.clearCanonicalSourceWithoutBackupDescription')
    return t(pendingPlan.value?.backupRequired ? 'skills.clearCanonicalSourceWithBackupDescription' : 'skills.clearCanonicalSourceEmptyDescription')
})

/** 当前确认按钮文案。 */
const confirmLabel = computed(() => {
    if (pendingPlan.value?.action === 'restore') return t('skills.confirmCanonicalRestore')
    if (pendingPlan.value?.action === 'delete-backup') return t('skills.confirmCanonicalBackupDelete')
    return t('skills.confirmCanonicalClear')
})

/** 当前确认按钮图标。 */
const confirmIcon = computed(() => pendingPlan.value?.action === 'restore' ? 'askx-actions:refresh' : 'askx-actions:delete')

/** 清空配置使用的多选项。 */
const clearModuleOptions = computed(() => [
    { value: 'links', label: t('skills.clearModuleLinks'), description: t('skills.clearModuleLinksDescription') },
    { value: 'skills', label: t('skills.clearModuleSkills'), description: t('skills.clearModuleSkillsDescription') },
])

/** 待确认计划中的清空范围。 */
const pendingClearModuleSummary = computed(() => {
    const modules = pendingPlan.value?.clearModules ?? []
    if (modules.length === 2) return t('skills.clearModuleAll')
    return modules.map(module => t(module === 'links' ? 'skills.clearModuleLinks' : 'skills.clearModuleSkills')).join('、')
})

/** 请求错误使用的固定 Toast 标识。 */
const SOURCE_ACTION_ERROR_TOAST_ID = 'canonical-source-action-error'

/** 将备份时间格式化为当前路由语言。 */
function formatTime(value?: string): string {
    if (!value) return t('skills.invalidCanonicalBackup')
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

/** 将软链摘要格式化为平台或文件夹名称。 */
function formatLinkNames(links: NonNullable<CanonicalSourceMutationReceipt['clearBackupSummary']>['linkSummary']['cleared'] | undefined): string {
    return links?.map(link => link.name).join('、') || t('skills.clearResultNoData')
}

/** 加载长期备份列表。 */
async function loadBackups(): Promise<void> {
    loadingBackups.value = true
    try {
        backups.value = await $fetch<CanonicalSkillsBackup[]>('/api/skills/canonical-source/backups')
    }
    catch {
        toast.error(t('skills.canonicalBackupRequestFailed'), { id: SOURCE_ACTION_ERROR_TOAST_ID })
    }
    finally {
        loadingBackups.value = false
    }
}

/** 打开备份管理并延迟读取备份数据。 */
async function openManager(): Promise<void> {
    managerOpen.value = true
    await loadBackups()
}

/**
 * 生成二次操作计划，再展示用户确认。
 * @param action 清空、恢复或永久删除。
 * @param backupVersion 恢复或删除的目标备份版本。
 * @param clearModules 清空操作指定的模块范围。
 * @param createBackup 是否在清空前创建长期备份。
 * @param selectedBackupLabel 用户设置的备份名称。
 */
async function prepareAction(action: CanonicalSourceAction, backupVersion?: string, clearModules?: ClearModule[], createBackup?: boolean, selectedBackupLabel?: string): Promise<void> {
    preparing.value = true
    toast.dismiss(SOURCE_ACTION_ERROR_TOAST_ID)
    try {
        pendingPlan.value = await $fetch<CanonicalSourceMutationPlan>('/api/skills/canonical-source/plan', {
            method: 'POST',
            body: {
                action,
                ...(backupVersion ? { backupVersion } : {}),
                ...(clearModules ? { clearModules } : {}),
                ...(createBackup === undefined ? {} : { createBackup }),
                ...(selectedBackupLabel ? { backupLabel: selectedBackupLabel } : {}),
            },
        })
        managerOpen.value = false
        confirmOpen.value = true
    }
    catch {
        toast.error(t(action === 'clear' ? 'skills.canonicalClearPlanFailed' : 'skills.canonicalSourceActionFailed'), { id: SOURCE_ACTION_ERROR_TOAST_ID })
    }
    finally {
        preparing.value = false
    }
}

/** 读取当前尚未占用的默认备份名称。 */
async function loadSuggestedBackupLabel(): Promise<void> {
    loadingBackupLabel.value = true
    try {
        const suggestion = await $fetch<{ label: string }>('/api/skills/canonical-source/backup-label')
        backupLabel.value = suggestion.label
    }
    catch {
        backupLabel.value = ''
        toast.error(t('skills.canonicalBackupRequestFailed'), { id: SOURCE_ACTION_ERROR_TOAST_ID })
    }
    finally {
        loadingBackupLabel.value = false
    }
}

/** 打开基础清空模块选择表单。 */
async function openClearConfiguration(): Promise<void> {
    selectedClearModules.value = ['links', 'skills']
    backupBeforeClear.value = true
    backupLabel.value = ''
    pendingPlan.value = null
    confirmOpen.value = true
    await loadSuggestedBackupLabel()
}

/** 更新清空前的备份选择。 */
async function updateBackupBeforeClear(value: boolean | 'indeterminate'): Promise<void> {
    if (typeof value !== 'boolean') return
    backupBeforeClear.value = value
    if (value && !backupLabel.value) await loadSuggestedBackupLabel()
}

/** 应用当前用户已经查看并确认的计划。 */
async function applyAction(): Promise<void> {
    if (!pendingPlan.value) return
    applying.value = true
    toast.dismiss(SOURCE_ACTION_ERROR_TOAST_ID)
    const plan = pendingPlan.value
    try {
        const receipt = await $fetch<CanonicalSourceMutationReceipt>('/api/skills/canonical-source/apply', {
            method: 'POST',
            body: {
                plan,
                consent: { planHash: plan.hash, confirmedAt: new Date().toISOString() },
            },
        })
        confirmOpen.value = false
        pendingPlan.value = null
        emit('updated')
        if (receipt.action === 'restore') toast.success(t('skills.canonicalBackupRestored'))
        else if (receipt.action === 'delete-backup') toast.success(t('skills.canonicalBackupDeleted'))
        else {
            clearReceipt.value = receipt
            resultOpen.value = true
        }
        if (receipt.action === 'delete-backup') {
            managerOpen.value = true
            await loadBackups()
        }
    }
    catch {
        if (plan.action === 'clear') pendingPlan.value = null
        toast.error(t(plan.action === 'clear' ? 'skills.canonicalClearPlanExpired' : 'skills.canonicalSourceActionFailed'), { id: SOURCE_ACTION_ERROR_TOAST_ID })
    }
    finally {
        applying.value = false
    }
}

/** 取消二次确认并按来源返回备份列表。 */
function cancelConfirmation(): void {
    const returnToManager = pendingPlan.value?.action === 'restore' || pendingPlan.value?.action === 'delete-backup'
    confirmOpen.value = false
    pendingPlan.value = null
    if (returnToManager) managerOpen.value = true
}
</script>

<template>
    <div class="contents">
        <Button
            :size="40"
            variant="outline"
            class="w-full"
            :disabled="disabled || preparing"
            @click="openManager"
        >
            <Icon name="askx-objects:folder-open" />
            {{ t('skills.manageCanonicalBackups') }}
        </Button>
        <TooltipProvider :delay-duration="150">
            <Tooltip>
                <TooltipTrigger as-child>
                    <Button
                        :size="40"
                        variant="destructive"
                        class="w-full"
                        :disabled="disabled || preparing"
                        @click="openClearConfiguration"
                    >
                        <Icon name="askx-actions:delete" />
                        {{ t('skills.clearCanonicalSource') }}
                    </Button>
                </TooltipTrigger>
                <TooltipContent
                    side="top"
                    :side-offset="8"
                    class="max-w-[300px]"
                >
                    {{ t('skills.clearCanonicalSourceTip') }}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    </div>

    <CsResponsiveOverlayDialogDrawer
        v-model:open="managerOpen"
        :title="t('skills.canonicalBackupManagerTitle')"
        :description="t('skills.canonicalBackupManagerDescription')"
        :dismissible="!preparing"
        :close-disabled="preparing"
        :close-label="t('skills.closeCanonicalBackups')"
        :dialog="{ content: { class: 'sm:max-w-[44rem]' } }"
    >
        <div
            v-if="loadingBackups"
            class="grid gap-2"
        >
            <Skeleton
                v-for="index in 3"
                :key="index"
                class="h-20 rounded-xl"
            />
        </div>
        <div
            v-else-if="backups.length"
            class="overflow-hidden rounded-xl border bg-background"
        >
            <div
                v-for="backup in backups"
                :key="backup.version"
                class="flex min-w-0 flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center"
            >
                <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon
                        name="askx-objects:folder"
                        class="size-4"
                    />
                </span>
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <strong class="text-sm">{{ backup.label }}</strong>
                        <Badge :variant="backup.valid ? 'secondary' : 'destructive'">
                            {{ backup.valid ? t('skills.canonicalBackupAvailable') : t('skills.invalidCanonicalBackup') }}
                        </Badge>
                    </div>
                    <p class="mt-1 font-mono text-[11px] text-muted-foreground">
                        {{ backup.version }}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        {{ formatTime(backup.createdAt) }}<template v-if="backup.skillCount !== undefined">
                            · {{ t('skills.canonicalBackupSkills', { count: backup.skillCount }) }}
                        </template>
                    </p>
                    <code
                        class="mt-1 block truncate font-mono text-[10px] text-muted-foreground"
                        :title="backup.path"
                    >{{ backup.path }}</code>
                    <p
                        v-if="backup.issue"
                        class="mt-1 text-xs text-destructive"
                    >
                        {{ backup.issue }}
                    </p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                    <Button
                        :size="36"
                        variant="outline"
                        :disabled="preparing || !backup.valid"
                        @click="prepareAction('restore', backup.version)"
                    >
                        <Icon name="askx-actions:refresh" />{{ t('skills.restoreCanonicalBackup') }}
                    </Button>
                    <Button
                        :size="36"
                        variant="ghost"
                        class="text-destructive hover:text-destructive"
                        :disabled="preparing"
                        @click="prepareAction('delete-backup', backup.version)"
                    >
                        <Icon name="askx-actions:delete" />{{ t('skills.deleteCanonicalBackup') }}
                    </Button>
                </div>
            </div>
        </div>
        <div
            v-else
            class="grid min-h-44 place-items-center rounded-2xl border border-dashed bg-muted/15 p-8 text-center"
        >
            <div>
                <Icon
                    name="askx-objects:folder"
                    class="mx-auto size-7 text-primary"
                /><strong class="mt-3 block text-sm">{{ t('skills.noCanonicalBackups') }}</strong><p class="mt-1 text-xs leading-5 text-muted-foreground">
                    {{ t('skills.noCanonicalBackupsDescription') }}
                </p>
            </div>
        </div>
    </CsResponsiveOverlayDialogDrawer>

    <CsResponsiveOverlayDialogDrawer
        v-model:open="confirmOpen"
        :title="confirmTitle"
        :description="confirmDescription"
        :dismissible="!applying"
        :close-disabled="applying"
        :close-label="t('skills.cancelCanonicalSourceAction')"
        :dialog="{ content: { class: 'sm:max-w-[36rem]' } }"
    >
        <div
            v-if="!pendingPlan"
            class="grid gap-3"
        >
            <label class="text-sm font-medium">{{ t('skills.clearModuleLabel') }}</label>
            <ResponsiveMultiSelect
                :model-value="selectedClearModules"
                :options="clearModuleOptions"
                :title="t('skills.clearModuleLabel')"
                :placeholder="t('skills.clearModuleRequired')"
                :close-label="t('skills.cancelCanonicalSourceAction')"
                :empty-text="t('skills.clearModuleRequired')"
                size="40"
                @update:model-value="selectedClearModules = $event as ClearModule[]"
            />
            <p
                v-if="!selectedClearModules.length"
                class="text-xs text-destructive"
            >
                {{ t('skills.clearModuleRequired') }}
            </p>
            <label class="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/20 p-3">
                <Checkbox
                    :model-value="backupBeforeClear"
                    class="mt-0.5"
                    @update:model-value="updateBackupBeforeClear"
                />
                <span class="min-w-0">
                    <strong class="block text-sm font-medium">{{ t('skills.clearCreateBackup') }}</strong>
                    <span class="mt-1 block text-xs leading-5 text-muted-foreground">{{ t('skills.clearCreateBackupDescription') }}</span>
                </span>
            </label>
            <div
                v-if="backupBeforeClear"
                class="grid gap-2"
            >
                <label
                    for="canonical-backup-label"
                    class="text-sm font-medium"
                >{{ t('skills.clearBackupName') }}</label>
                <Input
                    id="canonical-backup-label"
                    v-model="backupLabel"
                    maxlength="80"
                    :disabled="loadingBackupLabel"
                    :placeholder="loadingBackupLabel ? t('skills.loadingBackupName') : t('skills.clearBackupNamePlaceholder')"
                    autocomplete="off"
                />
                <p class="text-xs text-muted-foreground">
                    {{ t('skills.clearBackupNameDescription') }}
                </p>
            </div>
        </div>
        <div
            v-if="pendingPlan"
            class="overflow-hidden rounded-2xl border bg-muted/20"
        >
            <div class="flex items-start gap-3 border-b p-4">
                <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"><Icon
                    name="askx-status:warning"
                    class="size-4"
                /></span>
                <div class="min-w-0">
                    <strong class="block text-sm">{{ t('skills.confirmBeforeContinue') }}</strong><p class="mt-1 text-xs leading-5 text-muted-foreground">
                        {{ t('skills.canonicalSourcePlanRevalidate') }}
                    </p>
                </div>
            </div>
            <dl class="grid gap-3 p-4 text-xs sm:grid-cols-2">
                <div
                    v-if="pendingPlan.action === 'clear'"
                    class="sm:col-span-2"
                >
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearPlanModules') }}
                    </dt><dd class="mt-1 font-semibold">
                        {{ pendingClearModuleSummary }}
                    </dd>
                </div>
                <div
                    v-if="pendingPlan.backupLabel"
                    class="sm:col-span-2"
                >
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearBackupName') }}
                    </dt><dd class="mt-1 font-semibold">
                        {{ pendingPlan.backupLabel }}
                    </dd>
                </div>
                <div>
                    <dt class="text-muted-foreground">
                        {{ t('skills.currentCanonicalSkills') }}
                    </dt><dd class="mt-1 font-semibold">
                        {{ pendingPlan.currentSkillCount }}
                    </dd>
                </div>
                <div>
                    <dt class="text-muted-foreground">
                        {{ t('skills.currentCanonicalEntries') }}
                    </dt><dd class="mt-1 font-semibold">
                        {{ pendingPlan.currentEntryCount }}
                    </dd>
                </div>
                <div
                    v-if="pendingPlan.backupVersion"
                    class="sm:col-span-2"
                >
                    <dt class="text-muted-foreground">
                        {{ pendingPlan.action === 'clear' ? t('skills.backupToCreate') : t('skills.targetCanonicalBackup') }}
                    </dt><dd class="mt-1 font-mono font-semibold">
                        {{ pendingPlan.backupVersion }}
                    </dd>
                </div>
                <div
                    v-if="pendingPlan.action === 'clear' && pendingPlan.backupPath"
                    class="sm:col-span-2"
                >
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearResultBackupPath') }}
                    </dt><dd class="mt-1 break-all font-mono font-semibold">
                        {{ pendingPlan.backupPath }}
                    </dd>
                </div>
            </dl>
        </div>
        <template #footer>
            <Button
                variant="outline"
                :size="40"
                :disabled="applying"
                @click="cancelConfirmation"
            >
                {{ t('skills.cancelCanonicalSourceAction') }}
            </Button>
            <Button
                v-if="!pendingPlan"
                variant="destructive"
                :size="40"
                :disabled="preparing || loadingBackupLabel || !selectedClearModules.length || (backupBeforeClear && !backupLabel.trim())"
                @click="prepareAction('clear', undefined, selectedClearModules, backupBeforeClear, backupLabel.trim())"
            >
                <Icon name="askx-actions:delete" />{{ preparing ? t('skills.applyingCanonicalSourceAction') : t('skills.createCanonicalClearPlan') }}
            </Button>
            <Button
                v-else
                variant="destructive"
                :size="40"
                :disabled="applying"
                @click="applyAction"
            >
                <Icon
                    :name="confirmIcon"
                    :class="{ 'animate-spin': applying && pendingPlan?.action === 'restore' }"
                />
                {{ applying ? t('skills.applyingCanonicalSourceAction') : confirmLabel }}
            </Button>
        </template>
    </CsResponsiveOverlayDialogDrawer>

    <CsResponsiveOverlayDialogDrawer
        v-model:open="resultOpen"
        :title="t('skills.clearCanonicalResultTitle')"
        :description="t('skills.clearCanonicalResultDescription')"
        :close-label="t('skills.closeCanonicalResult')"
        :dialog="{ content: { class: 'sm:max-w-[36rem]' } }"
    >
        <div class="overflow-hidden rounded-2xl border bg-muted/20 text-sm">
            <section class="border-b p-4">
                <strong>{{ t('skills.clearResultLinks') }}</strong>
                <dl class="mt-3 grid gap-2 text-xs sm:grid-cols-[auto_1fr]">
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearResultCleared') }}
                    </dt><dd class="font-medium">
                        {{ formatLinkNames(clearReceipt?.clearBackupSummary?.linkSummary.cleared) }}
                    </dd>
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearResultNotCleared') }}
                    </dt><dd class="font-medium">
                        {{ formatLinkNames(clearReceipt?.clearBackupSummary?.linkSummary.notCleared) }}
                    </dd>
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearResultBackedUp') }}
                    </dt><dd class="font-medium">
                        {{ formatLinkNames(clearReceipt?.clearBackupSummary?.linkSummary.backedUp) }}
                    </dd>
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearResultNotBackedUp') }}
                    </dt><dd class="font-medium">
                        {{ formatLinkNames(clearReceipt?.clearBackupSummary?.linkSummary.notBackedUp) }}
                    </dd>
                </dl>
            </section>
            <section class="grid gap-2 p-4">
                <strong>{{ t('skills.clearResultSkills') }}</strong>
                <dl
                    v-if="clearReceipt?.clearBackupSummary"
                    class="grid gap-2 text-xs sm:grid-cols-[auto_1fr]"
                >
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearResultCleared') }}
                    </dt><dd class="font-medium">
                        {{ clearReceipt.clearBackupSummary.skills.cleared }} {{ t('skills.clearResultSkillUnit') }}
                    </dd>
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearResultNotCleared') }}
                    </dt><dd class="font-medium">
                        {{ clearReceipt.clearBackupSummary.skills.notCleared }} {{ t('skills.clearResultSkillUnit') }}
                    </dd>
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearResultBackedUp') }}
                    </dt><dd class="font-medium">
                        {{ clearReceipt.clearBackupSummary.skills.backedUp }} {{ t('skills.clearResultSkillUnit') }}
                    </dd>
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearResultNotBackedUp') }}
                    </dt><dd class="font-medium">
                        {{ clearReceipt.clearBackupSummary.skills.notBackedUp }} {{ t('skills.clearResultSkillUnit') }}
                    </dd>
                </dl>
                <dl
                    v-if="clearReceipt?.clearBackupSummary?.backupVersion"
                    class="mt-2 grid gap-2 border-t pt-3 text-xs sm:grid-cols-[auto_1fr]"
                >
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearResultBackupIdentifier') }}
                    </dt><dd class="font-mono font-semibold">
                        {{ clearReceipt.clearBackupSummary.backupVersion }}
                    </dd>
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearBackupName') }}
                    </dt><dd class="font-semibold">
                        {{ clearReceipt.clearBackupSummary.backupLabel }}
                    </dd>
                    <dt class="text-muted-foreground">
                        {{ t('skills.clearResultBackupPath') }}
                    </dt><dd class="min-w-0">
                        <CsLocalPathOpener
                            v-if="clearReceipt.clearBackupSummary.backupPath"
                            :path="clearReceipt.clearBackupSummary.backupPath"
                            display="path"
                        />
                    </dd>
                </dl>
            </section>
        </div>
        <template #footer>
            <Button @click="resultOpen = false">
                {{ t('skills.closeCanonicalResult') }}
            </Button>
        </template>
    </CsResponsiveOverlayDialogDrawer>
</template>
