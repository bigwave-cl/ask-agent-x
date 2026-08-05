<script setup lang="ts">
import type { ManagedLocalSkillRecord } from '@askx/module-skills/skill-types'
import type { LocalSkillMigrationPlan } from '@askx/module-skills/local-skill-manager'

/** 本地专属 Skill 列表属性。 */
interface Props { /** 本地专属 Skill。 */ skills: ManagedLocalSkillRecord[]; /** 是否存在其他写操作。 */ busy: boolean }

defineProps<Props>()
const emit = defineEmits<{ /** 迁移完成。 */ updated: [] }>()
const { t } = useI18n()
const toast = useToast()
/** 当前等待确认的迁移计划。 */
const pendingPlan = ref<LocalSkillMigrationPlan | null>(null)
/** 是否正在生成或应用计划。 */
const applying = ref(false)

/** 生成迁移到共享源的确认计划。 */
async function prepareMigration(skillId: string): Promise<void> {
  applying.value = true
  try {
    pendingPlan.value = await $fetch<LocalSkillMigrationPlan>('/api/skills/local/migrate-plan', { method: 'POST', body: { skillId } })
  } catch {
    toast.error(t('skills.localMigrationFailed'))
  } finally {
    applying.value = false
  }
}

/** 应用当前已展示的迁移计划。 */
async function applyMigration(): Promise<void> {
  if (!pendingPlan.value) return
  applying.value = true
  try {
    const plan = pendingPlan.value
    await $fetch('/api/skills/local/migrate-apply', { method: 'POST', body: { plan, consent: { planHash: plan.hash, confirmedAt: new Date().toISOString() } } })
    pendingPlan.value = null
    toast.success(t('skills.localMigrationCompleted'))
    emit('updated')
  } catch {
    toast.error(t('skills.localMigrationFailed'))
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <section class="overflow-hidden rounded-[24px] border bg-card shadow-sm">
    <header class="border-b bg-gradient-to-r from-primary/10 via-transparent to-transparent px-5 py-6 sm:px-7"><h2 class="text-2xl font-semibold">{{ t('skills.localSkillsTitle') }}</h2><p class="mt-2 text-sm text-muted-foreground">{{ t('skills.localSkillsDescription') }}</p></header>
    <div v-if="skills.length" class="divide-y">
      <div v-for="skill in skills" :key="skill.id" class="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7">
        <div class="min-w-0"><div class="flex items-center gap-2"><strong class="truncate">{{ skill.name }}</strong><Badge variant="secondary">{{ skill.manager?.version ?? t('skills.unmanagedVersion') }}</Badge></div><code class="mt-1 block truncate text-[10px] text-muted-foreground">{{ skill.localPath }}</code></div>
        <Button variant="outline" size="40" :disabled="busy || applying" @click="prepareMigration(skill.id)"><Icon name="askx-actions:upload" />{{ t('skills.migrateToShared') }}</Button>
      </div>
    </div>
    <p v-else class="p-12 text-center text-sm text-muted-foreground">{{ t('skills.localSkillsEmpty') }}</p>

    <Dialog :open="Boolean(pendingPlan)" @update:open="value => { if (!value && !applying) pendingPlan = null }">
      <DialogContent><DialogHeader><DialogTitle>{{ t('skills.localMigrationConfirmTitle') }}</DialogTitle><DialogDescription>{{ t('skills.localMigrationConfirmDescription') }}</DialogDescription></DialogHeader><div v-if="pendingPlan" class="rounded-xl border bg-muted/30 p-4"><strong>{{ pendingPlan.skillName }}</strong><code class="mt-2 block break-all text-[10px] text-muted-foreground">{{ pendingPlan.sourcePath }} → {{ pendingPlan.destinationPath }}</code></div><DialogFooter><Button variant="outline" :disabled="applying" @click="pendingPlan = null">{{ t('common.cancel') }}</Button><Button :disabled="applying" @click="applyMigration"><Icon name="askx-actions:upload" />{{ t('skills.migrateToShared') }}</Button></DialogFooter></DialogContent>
    </Dialog>
  </section>
</template>
