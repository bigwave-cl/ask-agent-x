<script setup lang="ts">
import type { SkillsBatchReceipt } from '@askx/module-skills/skill-types'

/** Skills 事务历史属性。 */
interface Props {
  /** 按时间倒序排列的批次回执。 */
  receipts: SkillsBatchReceipt[]
  /** 当前是否正在恢复。 */
  busy: boolean
}

defineProps<Props>()
const emit = defineEmits<{ /** 请求恢复指定批次。 */ rollback: [receiptId: string] }>()
const { locale, t } = useI18n()
const confirmOpen = ref(false)
const selectedReceipt = ref<SkillsBatchReceipt | null>(null)

/** 打开恢复确认面板。 */
function requestRollback(receipt: SkillsBatchReceipt): void {
  selectedReceipt.value = receipt
  confirmOpen.value = true
}

/** 提交恢复请求并关闭确认面板。 */
function confirmRollback(close: () => void): void {
  if (!selectedReceipt.value) return
  emit('rollback', selectedReceipt.value.id)
  close()
}

/**
 * 格式化本机事务时间。
 * @param value ISO 时间。
 */
function formatTime(value: string): string {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
</script>

<template>
  <section v-if="receipts.length" class="overflow-hidden rounded-[28px] border bg-card shadow-sm">
    <header class="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
      <div>
        <span class="text-xs font-medium uppercase tracking-[0.18em] text-primary">{{ t('skills.transactionEyebrow') }}</span>
        <h2 class="mt-2 text-xl font-semibold tracking-[-0.03em]">{{ t('skills.transactionTitle') }}</h2>
        <p class="mt-1 text-sm text-muted-foreground">{{ t('skills.transactionDescription') }}</p>
      </div>
      <Badge variant="outline">{{ t('skills.transactionCount', { count: receipts.length }) }}</Badge>
    </header>

    <div class="grid divide-y">
      <article v-for="(receipt, index) in receipts" :key="receipt.id" class="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <strong class="text-sm">{{ formatTime(receipt.appliedAt) }}</strong>
            <Badge v-if="index === 0" variant="secondary">{{ t('skills.latestTransaction') }}</Badge>
          </div>
          <p class="mt-2 truncate font-mono text-[10px] text-muted-foreground">{{ receipt.id }}</p>
          <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{{ t('skills.transactionSkills', { count: receipt.results.length }) }}</span>
            <span>{{ t('skills.transactionApplied', { count: receipt.results.filter((result) => result.status === 'applied').length }) }}</span>
            <span>{{ t('skills.transactionBackups', { count: receipt.results.reduce((count, result) => count + result.backups.length, 0) + (receipt.platformResults ?? []).filter((result) => result.backup).length }) }}</span>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2">
          <Button v-if="index === 0" variant="outline" size="40" :disabled="busy" @click="requestRollback(receipt)">
            <Icon name="askx-actions:refresh" />{{ t('skills.restoreTransaction') }}
          </Button>
          <span v-else class="text-xs text-muted-foreground">{{ t('skills.restoreLatestOnly') }}</span>
        </div>
      </article>
    </div>

    <CsResponsiveOverlayDialogDrawer
      v-model:open="confirmOpen"
      :title="t('skills.restoreConfirmTitle')"
      :description="t('skills.restoreConfirmDescription')"
      :dismissible="!busy"
      :close-disabled="busy"
      :close-label="t('skills.back')"
    >
      <div v-if="selectedReceipt" class="rounded-2xl border bg-muted/20 p-4">
        <strong class="block text-sm">{{ formatTime(selectedReceipt.appliedAt) }}</strong>
        <p class="mt-2 font-mono text-[10px] text-muted-foreground">{{ selectedReceipt.id }}</p>
        <p class="mt-3 text-xs leading-5 text-muted-foreground">{{ t('skills.restoreBackupHint') }}</p>
      </div>
      <template #footer="{ close }">
        <Button variant="outline" :disabled="busy" @click="close">{{ t('skills.back') }}</Button>
        <Button variant="destructive" :disabled="busy" @click="confirmRollback(close)">
          <Icon name="askx-actions:refresh" />{{ busy ? t('skills.restoring') : t('skills.confirmRestore') }}
        </Button>
      </template>
    </CsResponsiveOverlayDialogDrawer>
  </section>
</template>
