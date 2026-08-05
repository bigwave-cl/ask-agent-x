<script setup lang="ts">
import type { ManagedPlatformHealth, ManagedSkillHealth, ManagedSkillRecord, SkillPlatformStatus, SkillsScanReport, ManagedLocalSkillRecord } from '@askx/module-skills/skill-types'
import Tabs from '@/components/ui/tabs/Tabs.vue'
import TabsList from '@/components/ui/tabs/TabsList.vue'
import TabsTrigger from '@/components/ui/tabs/TabsTrigger.vue'

/** Skill 资源管理分栏属性。 */
interface Props {
  /** 统一源中的全部 Skill。 */
  managedSkills: ManagedSkillRecord[]
  /** 本地专属 Skill。 */
  localSkills: ManagedLocalSkillRecord[]
  /** Skill 健康状态。 */
  health: ManagedSkillHealth[]
  /** 平台预检测结果。 */
  platforms: SkillPlatformStatus[]
  /** 平台软链健康状态。 */
  platformHealth: ManagedPlatformHealth[]
  /** 最新扫描报告。 */
  report: SkillsScanReport
  /** 是否存在其他写操作。 */
  busy: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ /** 打开添加 Skill 流程。 */ add: []; /** 资源更新完成。 */ updated: [] }>()
const { t } = useI18n()
/** 当前资源视图。 */
const activeTab = ref<'shared' | 'local' | 'stats'>('shared')
/** 普通共享 Skill，不把系统 Manager 当作用户资源展示。 */
const sharedSkills = computed(() => props.managedSkills.filter(skill => skill.kind !== 'system'))
/** 普通共享 Skill 对应的健康状态。 */
const sharedHealth = computed(() => {
  const ids = new Set(sharedSkills.value.map(skill => skill.id))
  return props.health.filter(item => ids.has(item.skillId))
})
</script>

<template>
  <section class="grid gap-4">
    <Tabs v-model="activeTab" class="rounded-2xl border bg-card p-1.5 shadow-sm">
      <TabsList variant="line" size="40" scrollable :aria-label="t('skills.resourceTabs')">
        <TabsTrigger value="shared"><Icon name="askx-objects:skills" />{{ t('skills.sharedSkillsTab') }}<span class="font-mono text-[10px] opacity-60">{{ sharedSkills.length }}</span></TabsTrigger>
        <TabsTrigger value="local"><Icon name="askx-objects:file" />{{ t('skills.localSkillsTab') }}<span class="font-mono text-[10px] opacity-60">{{ localSkills.length }}</span></TabsTrigger>
        <TabsTrigger value="stats"><Icon name="askx-objects:layers" />{{ t('skills.statsTab') }}</TabsTrigger>
      </TabsList>
    </Tabs>

    <BusSkillsSkillList
      v-show="activeTab === 'shared'"
      :managed-skills="sharedSkills"
      :health="sharedHealth"
      :platforms="platforms"
      :platform-health="platformHealth"
      :report="report"
      :busy="busy"
      @add="emit('add')"
      @updated="emit('updated')"
    />
    <BusSkillsLocalSkillList v-show="activeTab === 'local'" :skills="localSkills" :busy="busy" @updated="emit('updated')" />
    <BusSkillsSkillStats v-show="activeTab === 'stats'" :active="activeTab === 'stats'" :shared-total="sharedSkills.length" />
  </section>
</template>
