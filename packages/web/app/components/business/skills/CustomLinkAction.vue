<script setup lang="ts">
import type { CustomLinkPlan } from '@askx/module-skills/skill-types'

/** 自定义目录软链确认弹层属性。 */
interface Props {
  /** 是否打开确认弹层。 */
  open: boolean
  /** 后端生成的可授权计划。 */
  plan: CustomLinkPlan | null
  /** 是否正在应用计划。 */
  busy?: boolean
}

const props = withDefaults(defineProps<Props>(), { busy: false })
const emit = defineEmits<{
  /** 同步弹层打开状态。 */
  'update:open': [value: boolean]
  /** 确认应用当前计划。 */
  confirm: []
}>()
const { t } = useI18n()

/** 当前操作标题。 */
const title = computed(() => {
  if (props.plan?.action === 'resume') return t('skills.resumeCustomLinkTitle', { name: props.plan.name })
  if (props.plan?.action === 'delete') return t('skills.deleteCustomLinkTitle', { name: props.plan.name })
  return t('skills.suspendCustomLinkTitle', { name: props.plan?.name ?? '' })
})

/** 当前操作说明。 */
const description = computed(() => {
  if (props.plan?.action === 'resume') return t('skills.resumeCustomLinkDescription')
  if (props.plan?.action === 'delete') return t('skills.deleteCustomLinkDescription')
  return t('skills.suspendCustomLinkDescription')
})

/** 当前操作提示。 */
const hint = computed(() => {
  if (props.plan?.action === 'resume') return t('skills.resumeCustomLinkHint')
  if (props.plan?.action === 'delete') return t('skills.deleteCustomLinkHint')
  return t('skills.suspendCustomLinkHint')
})

/** 当前确认按钮文案。 */
const actionLabel = computed(() => {
  if (props.busy) return t('skills.savingCustomLinkAction')
  if (props.plan?.action === 'resume') return t('skills.resumeCustomLink')
  if (props.plan?.action === 'delete') return t('skills.deleteCustomLink')
  return t('skills.suspendCustomLink')
})

/** 当前确认按钮图标。 */
const actionIcon = computed(() => {
  if (props.plan?.action === 'resume') return 'askx-actions:refresh'
  if (props.plan?.action === 'delete') return 'askx-actions:delete'
  return 'askx-status:prohibited'
})
</script>

<template>
  <CsResponsiveOverlayDialogDrawer
    :open="open"
    :title="title"
    :description="description"
    :dismissible="!busy"
    :close-disabled="busy"
    :close-label="t('skills.cancelCustomLinkAction')"
    :dialog="{ content: { class: 'sm:max-w-lg' } }"
    :drawer="{ root: { handleOnly: true }, content: { class: '[&>div:first-child]:hidden' } }"
    @update:open="emit('update:open', $event)"
  >
    <template #trigger>
      <button type="button" tabindex="-1" aria-hidden="true" class="sr-only">{{ title }}</button>
    </template>

    <div v-if="plan" class="grid gap-4">
      <div class="flex items-center gap-3 rounded-2xl border bg-muted/25 p-4">
        <span class="grid size-11 shrink-0 place-items-center rounded-xl border bg-card text-primary shadow-sm">
          <Icon name="askx-objects:folder" class="size-5" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <strong class="block truncate text-sm">{{ plan.name }}</strong>
          <span class="mt-1 block text-xs leading-5 text-muted-foreground">{{ hint }}</span>
        </div>
      </div>
      <dl class="grid gap-3 rounded-2xl border p-4 text-xs">
        <div class="grid gap-1">
          <dt class="text-muted-foreground">{{ t('skills.customLinkPath') }}</dt>
          <dd><code class="break-all font-mono">{{ plan.path }}</code></dd>
        </div>
        <div class="grid gap-1">
          <dt class="text-muted-foreground">{{ t('skills.canonicalSourcePath') }}</dt>
          <dd><code class="break-all font-mono">{{ plan.target }}</code></dd>
        </div>
        <div v-if="plan.originalRootBackup" class="grid gap-1">
          <dt class="text-muted-foreground">{{ t('skills.originalRootBackupPath') }}</dt>
          <dd><code class="break-all font-mono">{{ plan.originalRootBackup.backupPath }}</code></dd>
        </div>
      </dl>
    </div>

    <template #footer>
      <Button variant="ghost" :disabled="busy" @click="emit('update:open', false)">{{ t('skills.cancelCustomLinkAction') }}</Button>
      <Button :variant="plan?.action === 'delete' ? 'destructive' : 'primary'" :disabled="busy || !plan" @click="emit('confirm')">
        <Icon :name="actionIcon" :class="['size-4', { 'animate-spin': busy && plan?.action === 'resume' }]" aria-hidden="true" />
        {{ actionLabel }}
      </Button>
    </template>
  </CsResponsiveOverlayDialogDrawer>
</template>
