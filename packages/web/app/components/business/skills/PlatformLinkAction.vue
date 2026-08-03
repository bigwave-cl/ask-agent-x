<script setup lang="ts">
import type { PlatformLinkPlan } from '@askx/module-skills/skill-types'
import { skillPlatformPresentations } from '@/lib/skillPlatformPresentation'

/** 平台软链确认弹层属性。 */
interface Props {
  /** 是否打开确认弹层。 */
  open: boolean
  /** 后端生成的可授权计划。 */
  plan: PlatformLinkPlan | null
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

/** 当前平台展示名称。 */
const platformName = computed(() => props.plan ? skillPlatformPresentations[props.plan.platform].name : '')
/** 当前确认标题。 */
const title = computed(() => props.plan?.action === 'resume'
  ? t('skills.resumePlatformLinkTitle', { platform: platformName.value })
  : t('skills.suspendPlatformLinkTitle', { platform: platformName.value }))
/** 当前操作说明。 */
const description = computed(() => props.plan?.action === 'resume'
  ? t('skills.resumePlatformLinkDescription')
  : t('skills.suspendPlatformLinkDescription'))
</script>

<template>
  <CsResponsiveOverlayDialogDrawer
    :open="open"
    :title="title"
    :description="description"
    :dismissible="!busy"
    :close-disabled="busy"
    :close-label="t('skills.cancelPlatformLinkAction')"
    :dialog="{ content: { class: 'sm:max-w-lg' } }"
    :drawer="{ root: { handleOnly: true }, content: { class: '[&>div:first-child]:hidden' } }"
    @update:open="emit('update:open', $event)"
  >
    <template #trigger>
      <button type="button" tabindex="-1" aria-hidden="true" class="sr-only">{{ title }}</button>
    </template>

    <div v-if="plan" class="grid gap-4">
      <div class="flex items-center gap-3 rounded-2xl border bg-muted/25 p-4">
        <span class="grid size-11 shrink-0 place-items-center rounded-xl border bg-card shadow-sm">
          <Icon :name="skillPlatformPresentations[plan.platform].icon" class="size-5" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <strong class="block text-sm">{{ platformName }}</strong>
          <span class="mt-1 block text-xs text-muted-foreground">{{ plan.action === 'resume' ? t('skills.resumePlatformLinkHint') : t('skills.suspendPlatformLinkHint') }}</span>
        </div>
      </div>
      <dl class="grid gap-3 rounded-2xl border p-4 text-xs">
        <div class="grid gap-1">
          <dt class="text-muted-foreground">{{ t('skills.platformSkillsPath') }}</dt>
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
      <Button variant="ghost" :disabled="busy" @click="emit('update:open', false)">{{ t('skills.cancelPlatformLinkAction') }}</Button>
      <Button :disabled="busy || !plan" @click="emit('confirm')">
        <Icon :name="plan?.action === 'resume' ? 'askx-actions:refresh' : 'askx-status:prohibited'" :class="['size-4', { 'animate-spin': busy && plan?.action === 'resume' }]" aria-hidden="true" />
        {{ busy ? t('skills.savingPlatformLinkAction') : plan?.action === 'resume' ? t('skills.resumePlatformLink') : t('skills.suspendPlatformLink') }}
      </Button>
    </template>
  </CsResponsiveOverlayDialogDrawer>
</template>
