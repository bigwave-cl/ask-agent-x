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
    <Tabs v-model="activeTab" class="rounded-[22px] bg-card/80 p-2 shadow-sm ring-1 ring-ds-border-subtle-5 backdrop-blur-sm">
      <TabsList variant="segment" size="40" shape="regular" scrollable class="gap-1.5 bg-transparent p-0" :aria-label="t('skills.resourceTabs')">
        <TabsTrigger value="shared" class="px-4 data-active:!border-ds-fill-brand-transparent-20 data-active:!bg-ds-fill-brand-transparent-10 data-active:!text-ds-text-brand data-active:!shadow-none sm:px-5">
          <Icon name="askx-objects:skills" />{{ t('skills.sharedSkillsTab') }}
          <span class="rounded-full bg-ds-fill-bw-transparent-5 px-1.5 py-0.5 font-mono text-[10px] leading-none text-ds-text-helper">{{ sharedSkills.length }}</span>
        </TabsTrigger>
        <TabsTrigger value="local" class="px-4 data-active:!border-ds-fill-brand-transparent-20 data-active:!bg-ds-fill-brand-transparent-10 data-active:!text-ds-text-brand data-active:!shadow-none sm:px-5">
          <Icon name="askx-objects:file" />{{ t('skills.localSkillsTab') }}
          <span class="rounded-full bg-ds-fill-bw-transparent-5 px-1.5 py-0.5 font-mono text-[10px] leading-none text-ds-text-helper">{{ localSkills.length }}</span>
        </TabsTrigger>
        <TabsTrigger value="stats" class="px-4 data-active:!border-ds-fill-brand-transparent-20 data-active:!bg-ds-fill-brand-transparent-10 data-active:!text-ds-text-brand data-active:!shadow-none sm:px-5">
          <Icon name="askx-objects:layers" />{{ t('skills.statsTab') }}
        </TabsTrigger>
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
    <BusSkillsSkillStats v-show="activeTab === 'stats'" :active="activeTab === 'stats'" :shared-total="sharedSkills.length + localSkills.length" @updated="emit('updated')" />
  </section>
</template>
