<script setup lang="ts">
import type { SkillPlatformId, SkillsBootstrap } from '@askx/module-skills/skill-types'
import { skillPlatformPresentations } from '@/lib/skillPlatformPresentation'

/** Skills 管理页总览属性。 */
interface Props {
  /** Skills 初始化和平台状态。 */
  bootstrap: SkillsBootstrap
  /** 共享设置中的管理平台。 */
  configuredPlatforms: SkillPlatformId[]
  /** 是否正在读取或扫描。 */
  busy?: boolean
}

const props = withDefaults(defineProps<Props>(), { busy: false })
const emit = defineEmits<{ /** 打开初始化或重新扫描流程。 */ action: [] }>()
const { t } = useI18n()

/** 兼容旧版启动数据的统一源路径回退。 */
const canonicalSkillsDir = computed(() => props.bootstrap.canonicalSkillsDir || '~/.askx/skills')

/** 计算一个平台当前登记的软链数量。 */
function bindingCount(platform: SkillPlatformId): number {
  return props.bootstrap.managedSkills.reduce((count, skill) => count + skill.bindings.filter((binding) => binding.platform === platform).length, 0)
}

/** 判断平台是否已被当前 manifest 纳入管理。 */
function isConfigured(platform: SkillPlatformId): boolean {
  return props.bootstrap.initialized && props.configuredPlatforms.includes(platform)
}
</script>

<template>
  <section class="relative overflow-hidden rounded-[28px] border bg-card shadow-sm">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-br from-primary/12 via-primary/4 to-transparent" />
    <div class="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)] lg:items-stretch">
      <div class="flex min-w-0 flex-col justify-between rounded-2xl border bg-background/85 p-5 shadow-sm backdrop-blur sm:p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <span class="text-[10px] font-medium uppercase tracking-[0.18em] text-primary">{{ t('skills.canonicalEyebrow') }}</span>
            <h2 class="mt-2 text-xl font-semibold tracking-[-0.03em]">{{ t('skills.canonicalTitle') }}</h2>
          </div>
          <Badge :variant="bootstrap.initialized ? 'secondary' : 'outline'">
            <span class="size-1.5 rounded-full" :class="bootstrap.initialized ? 'bg-success' : 'bg-warning'" />
            {{ bootstrap.initialized ? t('skills.initialized') : t('skills.notInitialized') }}
          </Badge>
        </div>
        <div class="mt-8 flex min-w-0 items-center gap-3 rounded-2xl border bg-muted/25 p-4">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name="askx-objects:file" class="size-4" /></span>
          <div class="min-w-0"><span class="block text-xs text-muted-foreground">{{ t('skills.storagePath') }}</span><code class="mt-1 block truncate font-mono text-xs font-medium" :title="canonicalSkillsDir">{{ canonicalSkillsDir }}</code></div>
        </div>
        <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="max-w-xl text-xs leading-5 text-muted-foreground">{{ bootstrap.initialized ? t('skills.canonicalReadyHint') : t('skills.canonicalPendingHint') }}</p>
          <Button size="40" :variant="bootstrap.initialized ? 'outline' : 'default'" :disabled="busy" class="shrink-0" @click="emit('action')">
            <Icon :name="bootstrap.initialized ? 'askx-actions:refresh' : 'askx-actions:adjust'" />
            {{ bootstrap.initialized ? t('skills.rescan') : t('skills.startSetup') }}
          </Button>
        </div>
      </div>

      <div class="grid gap-2.5">
        <article v-for="platform in bootstrap.platforms" :key="platform.id" class="group flex min-w-0 items-center gap-3 rounded-2xl border bg-background/75 p-3.5 transition hover:border-primary/35 hover:bg-background">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl border bg-card text-foreground shadow-sm"><Icon :name="skillPlatformPresentations[platform.id].icon" class="size-5" aria-hidden="true" /></span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2"><strong class="truncate text-sm">{{ skillPlatformPresentations[platform.id].name }}</strong><Badge :variant="isConfigured(platform.id) ? 'secondary' : 'outline'" class="shrink-0">{{ isConfigured(platform.id) ? t('skills.configured') : t('skills.unconfigured') }}</Badge></div>
            <code class="mt-1 block truncate font-mono text-[9px] text-muted-foreground" :title="platform.skillsDir">{{ platform.skillsDir }}</code>
          </div>
          <div class="shrink-0 text-right"><strong class="block text-sm">{{ bindingCount(platform.id) }}</strong><span class="text-[9px] text-muted-foreground">{{ t('skills.managedLinks') }}</span></div>
        </article>
      </div>
    </div>
  </section>
</template>
