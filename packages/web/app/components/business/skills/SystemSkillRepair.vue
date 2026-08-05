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

/** 读取并展示不可变修复计划。 */
async function prepare(): Promise<void> {
  busy.value = true
  try {
    plan.value = await $fetch<SystemSkillRepairPlan>('/api/skills/system-manager/plan', { method: 'POST' })
  } catch {
    toast.error(t('skills.systemRepairFailed'))
  } finally {
    busy.value = false
  }
}

/** 用户确认后应用修复计划。 */
async function repair(): Promise<void> {
  if (!plan.value) return void prepare()
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

onMounted(async () => {
  await prepare()
  await nextTick()
  open.value = true
})
</script>

<template>
  <CsResponsiveOverlayDialogDrawer v-model:open="open" :title="t('skills.systemRepairTitle')" :description="t('skills.systemRepairDescription')" :dismissible="!busy" :close-disabled="busy" :close-label="t('skills.systemRepairLater')">
    <template #trigger><button type="button" class="sr-only">{{ t('skills.systemRepairTitle') }}</button></template>
    <div class="grid gap-4 p-5 sm:p-6"><div class="rounded-2xl border border-warning/30 bg-warning/5 p-5"><div class="flex items-center gap-3"><Icon name="askx-status:warning" class="size-5 text-warning" /><div><strong>{{ t(`skills.systemHealth.${health}`) }}</strong><p class="mt-1 text-sm text-muted-foreground">{{ plan?.preserveRegistry ? t('skills.systemRepairPreserve') : t('skills.systemRepairUsageWarning') }}</p></div></div></div><code v-if="plan" class="break-all rounded-xl bg-muted p-3 text-[10px] text-muted-foreground">{{ plan.hash }}</code></div>
    <template #footer><Button variant="ghost" :disabled="busy" @click="open = false">{{ t('skills.systemRepairLater') }}</Button><Button :disabled="busy" @click="repair"><Icon name="askx-actions:refresh" :class="{ 'animate-spin': busy }" />{{ t('skills.systemRepairAction') }}</Button></template>
  </CsResponsiveOverlayDialogDrawer>
</template>
