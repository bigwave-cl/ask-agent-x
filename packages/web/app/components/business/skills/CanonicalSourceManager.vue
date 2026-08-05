<script setup lang="ts">
import type {
  CanonicalSkillsBackup,
  CanonicalSourceAction,
  CanonicalSourceMutationPlan,
  CanonicalSourceMutationReceipt,
} from '@askx/module-skills/canonical-source-manager'

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
/** 用户可管理的长期备份。 */
const backups = ref<CanonicalSkillsBackup[]>([])
/** 当前等待确认的安全计划。 */
const pendingPlan = ref<CanonicalSourceMutationPlan | null>(null)
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

/** 请求错误使用的固定 Toast 标识。 */
const SOURCE_ACTION_ERROR_TOAST_ID = 'canonical-source-action-error'

/** 将备份时间格式化为当前路由语言。 */
function formatTime(value?: string): string {
  if (!value) return t('skills.invalidCanonicalBackup')
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

/** 加载长期备份列表。 */
async function loadBackups(): Promise<void> {
  loadingBackups.value = true
  try {
    backups.value = await $fetch<CanonicalSkillsBackup[]>('/api/skills/canonical-source/backups')
  } catch {
    toast.error(t('skills.canonicalBackupRequestFailed'), { id: SOURCE_ACTION_ERROR_TOAST_ID })
  } finally {
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
 */
async function prepareAction(action: CanonicalSourceAction, backupVersion?: string): Promise<void> {
  preparing.value = true
  toast.dismiss(SOURCE_ACTION_ERROR_TOAST_ID)
  try {
    pendingPlan.value = await $fetch<CanonicalSourceMutationPlan>('/api/skills/canonical-source/plan', {
      method: 'POST',
      body: { action, ...(backupVersion ? { backupVersion } : {}) },
    })
    managerOpen.value = false
    confirmOpen.value = true
  } catch {
    toast.error(t('skills.canonicalSourceActionFailed'), { id: SOURCE_ACTION_ERROR_TOAST_ID })
  } finally {
    preparing.value = false
  }
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
    else if (receipt.status === 'skipped') toast.info(t('skills.canonicalSourceAlreadyEmpty'))
    else toast.success(t(receipt.createdBackup ? 'skills.canonicalSourceClearedWithBackup' : 'skills.canonicalSourceCleared'))
    if (receipt.action === 'delete-backup') {
      managerOpen.value = true
      await loadBackups()
    }
  } catch {
    toast.error(t('skills.canonicalSourceActionFailed'), { id: SOURCE_ACTION_ERROR_TOAST_ID })
  } finally {
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
    <Button size="40" variant="outline" class="w-full" :disabled="disabled || preparing" @click="openManager">
      <Icon name="askx-objects:folder-open" />
      {{ t('skills.manageCanonicalBackups') }}
    </Button>
    <TooltipProvider :delay-duration="150">
      <Tooltip>
        <TooltipTrigger as-child>
          <Button size="40" variant="destructive" class="w-full" :disabled="disabled || preparing" @click="prepareAction('clear')">
            <Icon name="askx-actions:delete" />
            {{ t('skills.clearCanonicalSource') }}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" :side-offset="8" class="max-w-[300px]">{{ t('skills.clearCanonicalSourceTip') }}</TooltipContent>
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
    <div v-if="loadingBackups" class="grid gap-2">
      <Skeleton v-for="index in 3" :key="index" class="h-20 rounded-xl" />
    </div>
    <div v-else-if="backups.length" class="overflow-hidden rounded-xl border bg-background">
      <div v-for="backup in backups" :key="backup.version" class="flex min-w-0 flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon name="askx-objects:folder" class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <strong class="font-mono text-sm">{{ backup.version }}</strong>
            <Badge :variant="backup.valid ? 'secondary' : 'destructive'">{{ backup.valid ? t('skills.canonicalBackupAvailable') : t('skills.invalidCanonicalBackup') }}</Badge>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">{{ formatTime(backup.createdAt) }}<template v-if="backup.skillCount !== undefined"> · {{ t('skills.canonicalBackupSkills', { count: backup.skillCount }) }}</template></p>
          <code class="mt-1 block truncate font-mono text-[10px] text-muted-foreground" :title="backup.path">{{ backup.path }}</code>
          <p v-if="backup.issue" class="mt-1 text-xs text-destructive">{{ backup.issue }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button size="36" variant="outline" :disabled="preparing || !backup.valid" @click="prepareAction('restore', backup.version)">
            <Icon name="askx-actions:refresh" />{{ t('skills.restoreCanonicalBackup') }}
          </Button>
          <Button size="36" variant="ghost" class="text-destructive hover:text-destructive" :disabled="preparing" @click="prepareAction('delete-backup', backup.version)">
            <Icon name="askx-actions:delete" />{{ t('skills.deleteCanonicalBackup') }}
          </Button>
        </div>
      </div>
    </div>
    <div v-else class="grid min-h-44 place-items-center rounded-2xl border border-dashed bg-muted/15 p-8 text-center">
      <div><Icon name="askx-objects:folder" class="mx-auto size-7 text-primary" /><strong class="mt-3 block text-sm">{{ t('skills.noCanonicalBackups') }}</strong><p class="mt-1 text-xs leading-5 text-muted-foreground">{{ t('skills.noCanonicalBackupsDescription') }}</p></div>
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
    <div v-if="pendingPlan" class="overflow-hidden rounded-2xl border bg-muted/20">
      <div class="flex items-start gap-3 border-b p-4">
        <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"><Icon name="askx-status:warning" class="size-4" /></span>
        <div class="min-w-0"><strong class="block text-sm">{{ t('skills.confirmBeforeContinue') }}</strong><p class="mt-1 text-xs leading-5 text-muted-foreground">{{ t('skills.canonicalSourcePlanRevalidate') }}</p></div>
      </div>
      <dl class="grid gap-3 p-4 text-xs sm:grid-cols-2">
        <div><dt class="text-muted-foreground">{{ t('skills.currentCanonicalSkills') }}</dt><dd class="mt-1 font-semibold">{{ pendingPlan.currentSkillCount }}</dd></div>
        <div><dt class="text-muted-foreground">{{ t('skills.currentCanonicalEntries') }}</dt><dd class="mt-1 font-semibold">{{ pendingPlan.currentEntryCount }}</dd></div>
        <div v-if="pendingPlan.backupVersion" class="sm:col-span-2"><dt class="text-muted-foreground">{{ pendingPlan.action === 'clear' ? t('skills.backupToCreate') : t('skills.targetCanonicalBackup') }}</dt><dd class="mt-1 font-mono font-semibold">{{ pendingPlan.backupVersion }}</dd></div>
      </dl>
    </div>
    <template #footer>
      <Button variant="outline" :disabled="applying" @click="cancelConfirmation">{{ t('skills.cancelCanonicalSourceAction') }}</Button>
      <Button variant="destructive" :disabled="applying" @click="applyAction">
        <Icon :name="confirmIcon" :class="{ 'animate-spin': applying && pendingPlan?.action === 'restore' }" />
        {{ applying ? t('skills.applyingCanonicalSourceAction') : confirmLabel }}
      </Button>
    </template>
  </CsResponsiveOverlayDialogDrawer>
</template>
