<script setup lang="ts">
import type { AskXConfig, RollbackResult } from '@askx/core'
import type {
  SkillDecision,
  SkillGroup,
  PlatformLinkAction,
  PlatformLinkPlan,
  PlatformLinkReceipt,
  SkillPlatformId,
  SkillsBatchMode,
  SkillsBatchPlan,
  SkillsBatchReceipt,
  SkillsBootstrap,
  SkillsScanReport,
} from '@askx/module-skills/skill-types'

/** Skills 首次接入组件属性。 */
interface Props {
  /** 当前 CLI/Web 共享设置。 */
  settings: AskXConfig | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ /** 平台选择保存后的新设置。 */ 'settings-updated': [value: AskXConfig] }>()
const { t } = useI18n()
const toast = useToast()

/** Skills 引导流程请求错误使用的固定 Toast 标识。 */
const SKILLS_REQUEST_ERROR_TOAST_ID = 'skills-request-error'

/** 首次接入和管理页面状态。 */
type SkillsViewState = 'loading' | 'platforms' | 'scan' | 'confirm' | 'result' | 'dashboard'

const state = ref<SkillsViewState>('loading')
/** 当前引导是接入平台还是只同步单个平台内容。 */
const flowMode = ref<SkillsBatchMode>('connect')
const bootstrap = ref<SkillsBootstrap | null>(null)
const selectedPlatforms = ref<SkillPlatformId[]>(['codex', 'claude', 'cursor'])
/** 用户通过系统窗口额外选择的扫描目录。 */
const selectedDirectories = ref<Array<{ name: string; path: string }>>([])
const report = ref<SkillsScanReport | null>(null)
const decisions = ref<SkillDecision[]>([])
const plan = ref<SkillsBatchPlan | null>(null)
const receipt = ref<SkillsBatchReceipt | null>(null)
const history = ref<SkillsBatchReceipt[]>([])
const busy = ref(false)
/** 系统原生目录窗口是否正在等待用户选择。 */
const pickingDirectories = ref(false)
const setupOpen = ref(false)
/** 当前等待用户确认的平台软链计划。 */
const platformLinkPlan = ref<PlatformLinkPlan | null>(null)
/** 平台软链确认弹层是否打开。 */
const platformLinkActionOpen = ref(false)

/** 当前三步位置。 */
const activeStep = computed(() => state.value === 'platforms' ? 0 : state.value === 'scan' ? 1 : 2)
/** 顶部步骤文案。 */
const stepLabels = computed(() => [t('skills.stepPlatform'), t('skills.stepScan'), t('skills.stepConfirm')])
/** 当前引导弹层标题。 */
const setupTitle = computed(() => {
  if (state.value === 'result') return t(flowMode.value === 'sync' ? 'skills.syncResultTitle' : 'skills.resultTitle')
  return t(flowMode.value === 'sync' ? 'skills.syncDialogTitle' : 'skills.setupDialogTitle')
})

/** 将服务端错误收口为当前路由语言的文案。 */
function localizedRequestError(error: unknown, fallback = 'requestFailed'): string {
  const candidate = error as { statusCode?: number; response?: { status?: number } }
  return t(`skills.${candidate.statusCode === 409 || candidate.response?.status === 409 ? 'settingsConflict' : fallback}`)
}

/** 清除上一条 Skills 请求错误提示。 */
function clearRequestError(): void {
  toast.dismiss(SKILLS_REQUEST_ERROR_TOAST_ID)
}

/**
 * 使用全局 Toast 展示 Skills 请求错误，避免反馈与触发位置脱节。
 * @param error 原始请求错误。
 * @param fallback 无明确错误类型时使用的文案键。
 */
function notifyRequestError(error: unknown, fallback = 'requestFailed'): void {
  toast.error(localizedRequestError(error, fallback), { id: SKILLS_REQUEST_ERROR_TOAST_ID })
}

/** 为分组创建安全的默认决策。 */
function defaultDecision(group: SkillGroup): SkillDecision {
  const source = group.locations.find((location) => location.metadata.valid && !location.broken)
  if (group.recommendedAction === 'adopt' && source) return { kind: 'adopt', sourceLocationId: source.id }
  if (group.recommendedAction === 'merge' && source) return { kind: 'merge', sourceLocationId: source.id }
  return { kind: 'keep', groupId: group.id }
}

/** 加载初始化状态和平台预检测。 */
async function loadBootstrap(): Promise<void> {
  state.value = 'loading'
  clearRequestError()
  try {
    bootstrap.value = await $fetch<SkillsBootstrap>('/api/skills/bootstrap')
    selectedDirectories.value = []
    selectedPlatforms.value = [...(props.settings?.skills.platforms ?? ['codex', 'claude', 'cursor'])]
    if (bootstrap.value.initialized) {
      await Promise.all([scan(false), loadHistory()])
      state.value = 'dashboard'
      setupOpen.value = false
    } else {
      report.value = null
      history.value = []
      state.value = 'platforms'
      await nextTick()
      setupOpen.value = true
    }
  } catch (error) {
    notifyRequestError(error, 'loadFailed')
    state.value = 'platforms'
  }
}

/** 调起本机目录多选窗口并合并用户选择。 */
async function selectDirectories(): Promise<void> {
  pickingDirectories.value = true
  clearRequestError()
  try {
    const result = await $fetch<{ directories: Array<{ name: string; path: string }> }>('/api/skills/folders/select', { method: 'POST' })
    const merged = new Map(selectedDirectories.value.map((directory) => [directory.path, directory]))
    for (const directory of result.directories) merged.set(directory.path, directory)
    selectedDirectories.value = [...merged.values()].sort((left, right) => left.path.localeCompare(right.path))
  } catch (error) {
    notifyRequestError(error, 'folderSelectionFailed')
  } finally {
    pickingDirectories.value = false
  }
}

/**
 * 移除一个额外扫描目录。
 * @param path 要移除的绝对路径。
 */
function removeDirectory(path: string): void {
  selectedDirectories.value = selectedDirectories.value.filter((directory) => directory.path !== path)
}

/** 加载本机已完成的事务回执。 */
async function loadHistory(): Promise<void> {
  history.value = await $fetch<SkillsBatchReceipt[]>('/api/skills/history')
}

/** 文件更新后刷新 manifest 和只读扫描状态，不离开管理页面。 */
async function refreshManagedResources(): Promise<void> {
  try {
    bootstrap.value = await $fetch<SkillsBootstrap>('/api/skills/bootstrap')
    await scan(false)
  } catch (error) {
    notifyRequestError(error, 'loadFailed')
  }
}

/** 保存平台范围并执行扫描。 */
async function startFirstScan(): Promise<void> {
  if (!props.settings || !selectedPlatforms.value.length) return
  busy.value = true
  clearRequestError()
  try {
    flowMode.value = 'connect'
    let current = props.settings
    const changed = current.skills.platforms.join(',') !== selectedPlatforms.value.join(',')
    if (changed) {
      current = await $fetch<AskXConfig>('/api/settings', {
        method: 'PUT',
        body: {
          revision: current.revision,
          patch: {
            locale: current.locale,
            themeColor: current.themeColor,
            skills: { backupBeforeLink: current.skills.backupBeforeLink, platforms: selectedPlatforms.value },
          },
        },
      })
      emit('settings-updated', current)
    }
    await scan(true)
  } catch (error) {
    notifyRequestError(error)
  } finally {
    busy.value = false
  }
}

/**
 * 执行只读扫描。
 * @param enterDecision 是否进入首次决策页。
 */
async function scan(enterDecision = true): Promise<void> {
  report.value = await $fetch<SkillsScanReport>('/api/skills/scan', {
    method: 'POST',
    body: { platforms: selectedPlatforms.value, customRoots: selectedDirectories.value.map((directory) => directory.path) },
  })
  decisions.value = report.value.groups.map(defaultDecision)
  if (enterDecision) state.value = 'scan'
}

/** 更新一个分组的用户决策。 */
function updateDecision(groupId: string, decision: SkillDecision): void {
  const group = report.value?.groups.find((entry) => entry.id === groupId)
  if (!group) return
  decisions.value = report.value!.groups.map((entry) => entry.id === groupId ? decision : decisions.value.find((candidate) => {
    if (candidate.kind === 'keep') return candidate.groupId === entry.id
    if (candidate.kind === 'archive') return candidate.locationIds.some((id) => entry.locations.some((location) => location.id === id))
    return entry.locations.some((location) => location.id === candidate.sourceLocationId)
  }) ?? defaultDecision(entry))
}

/** 基于最新 revision 生成后端计划。 */
async function preparePlan(): Promise<void> {
  if (!props.settings || !report.value) return
  busy.value = true
  clearRequestError()
  try {
    /** 后端基于最新扫描生成的目录级接管计划。 */
    const nextPlan = await $fetch<SkillsBatchPlan>('/api/skills/plan', {
      method: 'POST',
      body: {
        platforms: selectedPlatforms.value,
        customRoots: selectedDirectories.value.map((directory) => directory.path),
        detectionFingerprint: report.value.fingerprint,
        settingsRevision: props.settings.revision,
        decisions: decisions.value,
        mode: flowMode.value,
      },
    })
    if (!Array.isArray(nextPlan.platformOperations)) throw new Error('Skills 服务仍在使用旧版逐 Skill 链接计划，请重启本地开发服务。')
    plan.value = nextPlan
    state.value = 'confirm'
  } catch (error) {
    notifyRequestError(error)
  } finally {
    busy.value = false
  }
}

/** 应用经过展示和确认的计划。 */
async function applyPlan(): Promise<void> {
  if (!plan.value) return
  busy.value = true
  clearRequestError()
  try {
    receipt.value = await $fetch<SkillsBatchReceipt>('/api/skills/apply', {
      method: 'POST',
      body: { plan: plan.value, consent: { planHash: plan.value.hash, confirmedAt: new Date().toISOString() } },
    })
    bootstrap.value = await $fetch<SkillsBootstrap>('/api/skills/bootstrap')
    selectedDirectories.value = []
    await Promise.all([scan(false), loadHistory()])
    state.value = 'result'
  } catch (error) {
    notifyRequestError(error)
  } finally {
    busy.value = false
  }
}

/** 结束向导并进入正常管理页。 */
async function complete(): Promise<void> {
  setupOpen.value = false
  state.value = 'dashboard'
}

/**
 * 恢复最近一次可回滚批次。
 * @param receiptId 批次回执标识。
 */
async function rollbackTransaction(receiptId: string): Promise<void> {
  busy.value = true
  clearRequestError()
  try {
    const result = await $fetch<RollbackResult>('/api/skills/rollback', { method: 'POST', body: { receiptId } })
    if (!result.rolledBack) throw new Error(result.warnings.join('\n'))
    await loadBootstrap()
  } catch (error) {
    notifyRequestError(error, 'restoreFailed')
  } finally {
    busy.value = false
  }
}

/** 从管理页重新打开扫描决策。 */
async function rescanForManagement(): Promise<void> {
  busy.value = true
  clearRequestError()
  try {
    await scan(true)
    setupOpen.value = true
  } catch (error) {
    notifyRequestError(error)
  } finally {
    busy.value = false
  }
}

/** 从列表页打开初始化或重新扫描流程。 */
function openSetup(): void {
  flowMode.value = 'connect'
  selectedPlatforms.value = [...(props.settings?.skills.platforms ?? ['codex', 'claude', 'cursor'])]
  selectedDirectories.value = []
  report.value = null
  decisions.value = []
  plan.value = null
  receipt.value = null
  state.value = 'platforms'
  setupOpen.value = true
}

/**
 * 只扫描并导入一个平台，其他平台保持当前状态。
 * @param platform 要重试或首次导入的平台。
 */
async function openPlatformImport(platform: SkillPlatformId): Promise<void> {
  busy.value = true
  clearRequestError()
  selectedPlatforms.value = [platform]
  selectedDirectories.value = []
  flowMode.value = 'connect'
  try {
    await scan(true)
    setupOpen.value = true
  } catch (error) {
    notifyRequestError(error)
  } finally {
    busy.value = false
  }
}

/**
 * 扫描一个平台并进入只更新统一源的同步流程。
 * @param platform 要同步到 AskX 统一源的平台。
 */
async function openPlatformSync(platform: SkillPlatformId): Promise<void> {
  busy.value = true
  clearRequestError()
  selectedPlatforms.value = [platform]
  selectedDirectories.value = []
  flowMode.value = 'sync'
  plan.value = null
  receipt.value = null
  try {
    await scan(true)
    setupOpen.value = true
  } catch (error) {
    notifyRequestError(error)
  } finally {
    busy.value = false
  }
}

/** 从决策页返回平台选择，并切换回平台接入流程。 */
function backToPlatformSelection(): void {
  flowMode.value = 'connect'
  selectedPlatforms.value = [...(props.settings?.skills.platforms ?? ['codex', 'claude', 'cursor'])]
  selectedDirectories.value = []
  state.value = 'platforms'
}

/**
 * 生成一个平台软链停用或恢复计划并展示确认弹层。
 * @param platform 目标平台。
 * @param action 停用或恢复操作。
 */
async function preparePlatformLinkAction(platform: SkillPlatformId, action: PlatformLinkAction): Promise<void> {
  busy.value = true
  clearRequestError()
  try {
    platformLinkPlan.value = await $fetch<PlatformLinkPlan>('/api/skills/platform-link/plan', {
      method: 'POST',
      body: { platform, action },
    })
    platformLinkActionOpen.value = true
  } catch (error) {
    notifyRequestError(error, 'platformLinkActionFailed')
  } finally {
    busy.value = false
  }
}

/** 应用当前已展示并确认的平台软链计划。 */
async function applyPlatformLinkAction(): Promise<void> {
  if (!platformLinkPlan.value) return
  busy.value = true
  clearRequestError()
  const currentPlan = platformLinkPlan.value
  try {
    const result = await $fetch<PlatformLinkReceipt>('/api/skills/platform-link/apply', {
      method: 'POST',
      body: {
        plan: currentPlan,
        consent: { planHash: currentPlan.hash, confirmedAt: new Date().toISOString() },
      },
    })
    bootstrap.value = await $fetch<SkillsBootstrap>('/api/skills/bootstrap')
    platformLinkActionOpen.value = false
    platformLinkPlan.value = null
    toast.success(t(result.action === 'resume' ? 'skills.platformLinkResumed' : 'skills.platformLinkSuspended'))
  } catch (error) {
    notifyRequestError(error, 'platformLinkActionFailed')
  } finally {
    busy.value = false
  }
}

/** 关闭引导后回到稳定的列表页状态。 */
function handleSetupClose(): void {
  setupOpen.value = false
  if (bootstrap.value?.initialized) state.value = 'dashboard'
}

watch(() => props.settings?.skills.platforms, (platforms) => {
  if (platforms?.length && state.value !== 'scan' && state.value !== 'confirm') selectedPlatforms.value = [...platforms]
}, { deep: true })

onMounted(loadBootstrap)
</script>

<template>
  <div class="grid gap-7">
    <header class="min-w-0">
      <div class="min-w-0 w-full">
        <CsWorkspacePageNav icon="askx-objects:skills" :label="t('skills.eyebrow')" />
        <h1 class="text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">{{ t('skills.managerTitle') }}</h1>
        <p class="mt-4 w-full text-sm leading-6 text-muted-foreground sm:text-base">{{ t('skills.managerDescription') }}</p>
      </div>
    </header>

    <div v-if="state === 'loading' || !bootstrap" class="grid gap-4"><Skeleton class="h-72 rounded-[28px]" /><div class="grid gap-4 sm:grid-cols-3"><Skeleton v-for="index in 3" :key="index" class="h-32 rounded-2xl" /></div></div>
    <template v-else>
      <BusSkillsOverview
        :bootstrap="bootstrap"
        :configured-platforms="props.settings?.skills.platforms ?? selectedPlatforms"
        :busy="busy"
        @action="openSetup"
        @platform-action="openPlatformImport"
        @platform-sync="openPlatformSync"
        @platform-link-action="preparePlatformLinkAction"
      />

      <template v-if="bootstrap.initialized && report">
        <BusSkillsSkillList :managed-skills="bootstrap.managedSkills" :health="bootstrap.managedHealth" :platform-health="bootstrap.platformHealth ?? []" :report="report" :busy="busy" @scan="openSetup" @updated="refreshManagedResources" />
        <BusSkillsTransactionHistory :receipts="history" :busy="busy" @rollback="rollbackTransaction" />
      </template>
      <BusSkillsEmptyState v-else :initialized="false" @action="openSetup" />

      <CsResponsiveOverlayDialogDrawer
        v-model:open="setupOpen"
        :title="setupTitle"
        :description="t(flowMode === 'sync' ? 'skills.syncDialogDescription' : 'skills.setupDialogDescription')"
        :dismissible="!busy"
        :show-header="state !== 'result'"
        :close-disabled="busy"
        :close-label="t('skills.closeSetup')"
        :dialog="{ content: { class: 'max-w-[calc(100vw-2rem)] sm:max-w-[min(72rem,calc(100vw-2rem))]' } }"
        :drawer="{ root: { handleOnly: true }, content: { class: '[&>div:first-child]:hidden' } }"
        header-class="px-4 py-4 sm:px-6 sm:py-4"
        body-class="p-4 pb-28 sm:p-6 sm:pb-28"
        footer-class="absolute inset-x-4 bottom-4 z-20 flex-row items-center justify-between gap-3 rounded-[28px] border bg-background/70 p-3 shadow-xl backdrop-blur-md sm:inset-x-6 sm:bottom-6 sm:justify-between"
        @close="handleSetupClose"
      >
        <template #trigger><button type="button" tabindex="-1" aria-hidden="true" class="sr-only">{{ t('skills.startSetup') }}</button></template>

        <template #header>
          <div class="flex w-full min-w-0 justify-start pr-7 sm:pr-10">
            <div class="flex max-w-full items-center rounded-full border bg-card p-1.5 shadow-sm">
              <div v-for="(label, index) in stepLabels" :key="label" class="flex min-w-0 items-center">
                <span class="flex min-w-0 items-center gap-2 rounded-full px-3 py-2 text-xs transition" :class="index === activeStep ? 'bg-primary text-ds-text-white' : index < activeStep ? 'text-primary' : 'text-muted-foreground'"><span class="grid size-5 shrink-0 place-items-center rounded-full border border-current/30 font-mono text-[9px]">{{ index < activeStep ? '✓' : index + 1 }}</span><span class="truncate">{{ label }}</span></span>
                <Icon v-if="index < stepLabels.length - 1" name="askx-navigation:chevron-right" class="mx-1 size-3 shrink-0 text-muted-foreground/40" />
              </div>
            </div>
          </div>
        </template>

        <BusSkillsPlatformSelection
          v-if="state === 'platforms'"
          v-model:selected="selectedPlatforms"
          :platforms="bootstrap.platforms"
          :directories="selectedDirectories"
          :busy="busy"
          :picking-directories="pickingDirectories"
          @select-directories="selectDirectories"
          @remove-directory="removeDirectory"
        />
        <BusSkillsScanResult v-else-if="state === 'scan' && report" :report="report" :decisions="decisions" :mode="flowMode" @update-decision="updateDecision" @rescan="rescanForManagement" />
        <BusSkillsActionConfirmation v-else-if="state === 'confirm' && plan" :plan="plan" />
        <BusSkillsExecutionResult v-else-if="state === 'result' && receipt" :receipt="receipt" :mode="flowMode" />

        <template #footer>
          <template v-if="state === 'platforms'">
            <p v-if="!selectedPlatforms.length" class="text-sm text-destructive">{{ t('skills.mustSelectPlatform') }}</p>
            <p v-else class="flex items-center gap-2 text-xs text-muted-foreground"><Icon name="askx-status:lock" class="size-3.5 text-primary" />{{ t('skills.transactional') }}</p>
            <Button size="48" :disabled="!selectedPlatforms.length || busy || pickingDirectories" @click="startFirstScan">
              <Icon name="askx-actions:refresh" :class="['size-4', { 'animate-spin': busy }]" />
              {{ busy ? t('skills.scanning') : t('skills.startScan') }}
            </Button>
          </template>

          <template v-else-if="state === 'scan'">
            <Button variant="ghost" size="40" @click="backToPlatformSelection"><Icon name="askx-navigation:arrow-left" />{{ t('skills.back') }}</Button>
            <Button size="40" :disabled="busy" @click="preparePlan"><Icon name="askx-navigation:arrow-right" />{{ busy ? t('skills.preparing') : t('skills.preparePlan') }}</Button>
          </template>

          <template v-else-if="state === 'confirm'">
            <Button variant="ghost" size="40" :disabled="busy" @click="state = 'scan'"><Icon name="askx-navigation:arrow-left" />{{ t('skills.back') }}</Button>
            <Button size="48" :disabled="busy" @click="applyPlan"><Icon name="askx-status:loading" :class="{ 'animate-spin': busy }" />{{ busy ? t(flowMode === 'sync' ? 'skills.syncApplying' : 'skills.applying') : t(flowMode === 'sync' ? 'skills.saveSyncResult' : 'skills.apply') }}</Button>
          </template>

          <template v-else-if="state === 'result'">
            <span />
            <Button size="48" @click="complete">{{ t('skills.openManager') }}<Icon name="askx-navigation:arrow-right" /></Button>
          </template>
        </template>
      </CsResponsiveOverlayDialogDrawer>

      <BusSkillsPlatformLinkAction
        v-model:open="platformLinkActionOpen"
        :plan="platformLinkPlan"
        :busy="busy"
        @confirm="applyPlatformLinkAction"
      />
    </template>
  </div>
</template>
