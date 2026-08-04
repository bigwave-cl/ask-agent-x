<script setup lang="ts">
import { MAX_CUSTOM_SKILL_DIRECTORIES } from '@askx/module-skills/skill-types'
import type { PlatformLinkAction, SkillPlatformId, SkillsBootstrap } from '@askx/module-skills/skill-types'
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
const emit = defineEmits<{
  /** 打开初始化或重新扫描流程。 */
  action: []
  /** 只扫描并导入指定平台。 */
  'platform-action': [platform: SkillPlatformId]
  /** 将指定平台的 Skill 同步到 AskX 统一源。 */
  'platform-sync': [platform: SkillPlatformId]
  /** 停用或恢复指定平台的受管根目录软链。 */
  'platform-link-action': [platform: SkillPlatformId, action: PlatformLinkAction]
  /** 打开自定义扫描来源选择。 */
  'add-custom-root': []
  /** 移除一个已保存的自定义扫描来源。 */
  'remove-custom-root': [rootId: string]
}>()
const { t } = useI18n()

/** 兼容旧版启动数据的统一源路径回退。 */
const canonicalSkillsDir = computed(() => props.bootstrap.canonicalSkillsDir || '~/.askx/skills')

/** 判断平台是否已被当前 manifest 纳入管理。 */
function isConfigured(platform: SkillPlatformId): boolean {
  return (props.bootstrap.platformBindings ?? []).some((binding) => binding.platform === platform)
}

/** 判断平台根目录绑定当前是否健康。 */
function isConnected(platform: SkillPlatformId): boolean {
  return (props.bootstrap.platformHealth ?? []).some((health) => health.platform === platform && health.connected)
}

/** 返回平台最新的接入状态。 */
function connectionStatus(platform: SkillPlatformId): 'connected' | 'suspended' | 'failed' | 'broken' | 'pending' {
  return props.bootstrap.platformHealth.find((health) => health.platform === platform)?.status
    ?? (isConfigured(platform) ? 'broken' : 'pending')
}

/** 返回平台当前根目录代理状态文案。 */
function connectionLabel(platform: SkillPlatformId): string {
  const status = connectionStatus(platform)
  if (status === 'connected') return t('skills.rootConnected')
  if (status === 'suspended') return t('skills.rootSuspended')
  if (status === 'failed') return t('skills.rootFailed')
  if (status === 'broken') return t('skills.rootBroken')
  if (props.configuredPlatforms.includes(platform)) return t('skills.rootPending')
  return t('skills.unconfigured')
}

/** 返回平台导入操作文案。 */
function platformActionLabel(platform: SkillPlatformId): string {
  return ['failed', 'broken'].includes(connectionStatus(platform)) ? t('skills.retryPlatformImport') : t('skills.importPlatform')
}

/** 返回受管平台当前可执行的软链状态操作。 */
function platformLinkAction(platform: SkillPlatformId): PlatformLinkAction {
  return connectionStatus(platform) === 'suspended' ? 'resume' : 'suspend'
}
</script>

<template>
  <section class="relative overflow-hidden rounded-[28px] border bg-card shadow-sm">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-br from-primary/12 via-primary/4 to-transparent" />
    <div class="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(31rem,0.9fr)] lg:items-stretch">
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
        <div class="mt-5 flex flex-col gap-3">
          <p class="max-w-xl text-xs leading-5 text-muted-foreground">{{ bootstrap.initialized ? t('skills.canonicalReadyHint') : t('skills.canonicalPendingHint') }}</p>
          <div v-if="!bootstrap.initialized" class="flex justify-end">
            <Button size="40" :disabled="busy" class="shrink-0" @click="emit('action')">
              <Icon name="askx-actions:adjust" />
              {{ t('skills.startSetup') }}
            </Button>
          </div>
        </div>
      </div>

      <div class="grid gap-2.5">
        <article v-for="platform in bootstrap.platforms" :key="platform.id" class="group flex min-w-0 items-center gap-3 rounded-2xl border bg-background/75 p-3.5 transition hover:border-primary/35 hover:bg-background">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl border bg-card text-foreground shadow-sm"><Icon :name="skillPlatformPresentations[platform.id].icon" class="size-5" aria-hidden="true" /></span>
          <div class="min-w-0 flex-1">
            <strong class="block truncate text-sm">{{ skillPlatformPresentations[platform.id].name }}</strong>
            <div class="mt-1 flex min-w-0 items-center gap-1.5"><Badge :variant="isConnected(platform.id) || connectionStatus(platform.id) === 'suspended' ? 'secondary' : ['failed', 'broken'].includes(connectionStatus(platform.id)) ? 'destructive' : 'outline'" class="shrink-0">{{ connectionLabel(platform.id) }}</Badge><code class="block min-w-0 truncate font-mono text-[9px] text-muted-foreground" :title="platform.skillsDir">{{ platform.skillsDir }}</code></div>
          </div>
          <div v-if="bootstrap.initialized" class="flex shrink-0 items-center gap-1.5">
            <TooltipProvider :delay-duration="150">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button size="36" variant="outline" class="shrink-0" :disabled="busy" @click="emit('platform-sync', platform.id)">
                    <Icon name="askx-actions:flip-vertical" :class="['size-3.5', { 'animate-pulse': busy }]" />
                    {{ t('skills.syncPlatformSkills') }}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" :side-offset="8" class="max-w-[280px]">{{ t('skills.syncPlatformSkillsTip') }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button v-if="isConnected(platform.id) || connectionStatus(platform.id) === 'suspended'" size="36" variant="outline" class="shrink-0" :disabled="busy" @click="emit('platform-link-action', platform.id, platformLinkAction(platform.id))">
              <Icon :name="connectionStatus(platform.id) === 'suspended' ? 'askx-actions:refresh' : 'askx-status:prohibited'" class="size-3.5" />
              {{ connectionStatus(platform.id) === 'suspended' ? t('skills.resumePlatformLink') : t('skills.suspendPlatformLink') }}
            </Button>
            <Button v-else size="36" variant="outline" class="shrink-0" :disabled="busy" @click="emit('platform-action', platform.id)">
              <Icon name="askx-actions:refresh" :class="['size-3.5', { 'animate-spin': busy }]" />
              {{ platformActionLabel(platform.id) }}
            </Button>
          </div>
          <span v-else class="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Icon name="askx-status:info" class="size-3.5" /></span>
        </article>

        <section v-if="bootstrap.customLinkBindings.length" class="overflow-hidden rounded-2xl border bg-background/65">
          <div class="flex items-center gap-2 px-3.5 py-3"><Icon name="askx-objects:folder" class="size-4 text-primary" /><strong class="text-sm">{{ t('skills.customLinkTargetsTitle') }}</strong><Badge variant="outline">{{ bootstrap.customLinkBindings.length }}/{{ MAX_CUSTOM_SKILL_DIRECTORIES }}</Badge></div>
          <div class="border-t">
            <div v-for="binding in bootstrap.customLinkBindings" :key="binding.id" class="flex min-w-0 items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0">
              <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon name="askx-objects:file-link" class="size-4" /></span>
              <span class="min-w-0 flex-1"><strong class="block truncate text-xs">{{ binding.name }}</strong><code class="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground" :title="binding.path">{{ binding.path }}</code></span>
              <Badge variant="secondary">{{ t('skills.rootConnected') }}</Badge>
            </div>
          </div>
        </section>

        <section class="overflow-hidden rounded-2xl border border-dashed bg-background/55">
          <div class="flex items-center justify-between gap-3 px-3.5 py-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2"><Icon name="askx-objects:folder" class="size-4 text-primary" /><strong class="text-sm">{{ t('skills.customSourcesTitle') }}</strong><Badge variant="outline">{{ bootstrap.customRoots.length }}/{{ MAX_CUSTOM_SKILL_DIRECTORIES }}</Badge></div>
              <p class="mt-1 text-[11px] text-muted-foreground">{{ t('skills.customSourcesHint') }}</p>
            </div>
            <Button size="36" variant="outline" class="shrink-0" :disabled="busy || bootstrap.customRoots.length >= MAX_CUSTOM_SKILL_DIRECTORIES" @click="emit('add-custom-root')"><Icon name="askx-actions:upload" />{{ t('skills.addCustomFolder') }}</Button>
          </div>
          <div v-if="bootstrap.customRoots.length" class="border-t">
            <div v-for="root in bootstrap.customRoots" :key="root.id" class="flex min-w-0 items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0">
              <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon name="askx-objects:folder" class="size-4" /></span>
              <span class="min-w-0 flex-1"><strong class="block truncate text-xs">{{ root.name }}</strong><code class="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground" :title="root.path">{{ root.path }}</code></span>
              <TooltipProvider :delay-duration="150">
                <Tooltip>
                  <TooltipTrigger as-child><Button size="icon-sm" variant="ghost" :disabled="busy" :aria-label="t('skills.removeFolder', { name: root.name })" @click="emit('remove-custom-root', root.id)"><Icon name="askx-actions:delete" class="size-3.5" /></Button></TooltipTrigger>
                  <TooltipContent side="top">{{ t('skills.removeCustomRootTip') }}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>
