<script setup lang="ts">
import type { SystemSkillHealth } from '@askx/module-skills/skill-types'
import type { SystemSkillRepairPlan } from '@askx/module-skills/builtin-skill-manager'

/** 系统 Skill 修复属性。 */
interface Props { /** 当前检测状态。 */ health: Exclude<SystemSkillHealth, 'ready'> }

defineProps<Props>()
const emit = defineEmits<{ /** 修复完成。 */ repaired: [] }>()
const { t } = useI18n()
const toast = useToast()
/** 修复弹层是否打开；等待响应式容器挂载完成后再显式开启。 */
const open = ref(false)
/** 当前服务端修复计划。 */
const plan = ref<SystemSkillRepairPlan | null>(null)
/** 请求状态。 */
const busy = ref(false)
/** 修复计划是否读取失败。 */
const loadFailed = ref(false)

/** 弹层打开后按需读取修复计划，避免页面加载时主动弹出或重复请求。 */
async function prepareOnOpen(): Promise<void> {
  if (plan.value || busy.value) return
  await prepare()
}

/** 读取并展示不可变修复计划。 */
async function prepare(): Promise<boolean> {
  busy.value = true
  loadFailed.value = false
  plan.value = null
  try {
    plan.value = await $fetch<SystemSkillRepairPlan>('/api/skills/system-manager/plan', { method: 'POST' })
    return true
  } catch {
    loadFailed.value = true
    toast.error(t('skills.systemRepairFailed'))
    return false
  } finally {
    busy.value = false
  }
}

/** 用户确认后应用修复计划。 */
async function repair(): Promise<void> {
  if (!plan.value) return
  busy.value = true
  try {
    const current = plan.value
    await $fetch('/api/skills/system-manager/apply', { method: 'POST', body: { plan: current, consent: { planHash: current.hash, confirmedAt: new Date().toISOString() } } })
    open.value = false
    toast.success(t('skills.systemRepairCompleted'))
    emit('repaired')
  } catch {
    toast.error(t('skills.systemRepairFailed'))
  } finally {
    busy.value = false
  }
}

</script>

<template>
  <div class="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
    <div class="flex min-w-0 items-center gap-3">
      <span class="grid size-9 shrink-0 place-items-center rounded-xl border border-warning/20 bg-background/75 text-warning shadow-sm">
        <Icon name="askx-status:warning" class="size-4" />
      </span>
      <div class="min-w-0">
        <strong class="block text-sm text-foreground">{{ t('skills.statsUnavailableTitle') }}</strong>
        <p class="mt-0.5 text-xs leading-5 text-muted-foreground">{{ t('skills.systemRepairDescription') }}</p>
      </div>
    </div>

    <CsResponsiveOverlayDialogDrawer v-model:open="open" :title="t('skills.systemRepairTitle')" :description="t('skills.systemRepairDescription')" :dismissible="!busy" :close-disabled="busy" :close-label="t('skills.systemRepairLater')" @show="prepareOnOpen">
      <template #trigger>
        <Button variant="outline" size="36" class="shrink-0 border-warning/30 bg-background/80 text-warning shadow-sm hover:bg-warning/10 hover:text-warning">
          <Icon name="askx-actions:refresh" />{{ t('skills.systemRepairQuickAction') }}
        </Button>
      </template>
      <div class="grid gap-4 p-5 sm:p-6">
        <div class="rounded-2xl border border-warning/30 bg-warning/5 p-5">
          <div class="flex items-center gap-3">
            <Icon name="askx-status:warning" class="size-5 text-warning" />
            <div>
              <strong>{{ loadFailed ? t('skills.systemRepairLoadFailedTitle') : t(`skills.systemHealth.${health}`) }}</strong>
              <p class="mt-1 text-sm text-muted-foreground">{{ loadFailed ? t('skills.systemRepairLoadFailedDescription') : plan?.preserveRegistry ? t('skills.systemRepairPreserve') : t('skills.systemRepairUsageWarning') }}</p>
            </div>
          </div>
        </div>
        <Skeleton v-if="busy && !plan" class="h-12 rounded-xl" />
        <code v-else-if="plan" class="break-all rounded-xl bg-muted p-3 text-[10px] text-muted-foreground">{{ plan.hash }}</code>
      </div>
      <template #footer>
        <Button variant="ghost" :disabled="busy" @click="open = false">{{ t('skills.systemRepairLater') }}</Button>
        <Button v-if="loadFailed" :disabled="busy" @click="prepare"><Icon name="askx-actions:refresh" :class="{ 'animate-spin': busy }" />{{ t('common.retry') }}</Button>
        <Button v-else :disabled="busy || !plan" @click="repair"><Icon name="askx-actions:refresh" :class="{ 'animate-spin': busy }" />{{ t('skills.systemRepairAction') }}</Button>
      </template>
    </CsResponsiveOverlayDialogDrawer>
  </div>
</template>
