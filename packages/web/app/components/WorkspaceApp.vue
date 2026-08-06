<script setup lang="ts">
import type { AskXConfig, AskXLocale, AskXThemeColor, ManagedPlatformId } from '@askx/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { AskxIconName } from '@/lib/iconCatalog'
import { parseSessionCredential } from '@/lib/session-credential'
import { skillPlatformPresentations } from '@/lib/skillPlatformPresentation'

/** 设置页展示的 Agent 平台。 */
const agents: Array<{ id: ManagedPlatformId; name: string; icon: AskxIconName; note: string }> = [
  { id: 'codex', ...skillPlatformPresentations.codex, note: '~/.codex/skills' },
  { id: 'claude', ...skillPlatformPresentations.claude, note: '~/.claude/skills' },
  { id: 'cursor', ...skillPlatformPresentations.cursor, note: '~/.cursor/skills' },
]

type FeedbackKey = 'feedbackConnecting' | 'feedbackConnected' | 'feedbackSynced' | 'feedbackExternal' | 'feedbackMinPlatform' | 'feedbackUnsaved' | 'feedbackSaved' | 'feedbackReadFailed' | 'feedbackSaveFailed' | 'feedbackConflict' | 'feedbackReset'
type AuthState = 'checking' | 'authenticated' | 'unauthenticated'
type WorkspaceView = 'home' | 'skills-x' | 'theme' | 'settings'
type VisualTheme = 'light' | 'dark' | 'system'

const props = withDefaults(defineProps<{
  view?: WorkspaceView
  login?: boolean
}>(), {
  view: 'home',
  login: false,
})

const tokenCommand = 'askx ui token'
const pipelineKeys = ['pipelineDetect', 'pipelinePlan', 'pipelineConsent', 'pipelineApply', 'pipelineVerify', 'pipelineRollback'] as const
const localePath = useLocalePath()
const { locale, setLocale: setI18nLocale, t } = useI18n()
const commonMessages = useMessageSection('common')
const workspaceMessages = useMessageSection('workspace')
const settings = ref<AskXConfig | null>(null)
const authState = ref<AuthState>('checking')
const workspaceView = computed(() => props.view)
const visualTheme = ref<VisualTheme>('light')
const tokenInput = ref('')
const authenticating = ref(false)
const authError = ref('')
const commandCopied = ref(false)
const draft = reactive<{ backupBeforeLink: boolean; platforms: ManagedPlatformId[]; locale: AskXLocale; themeColor: AskXThemeColor }>({
  backupBeforeLink: true,
  platforms: [],
  locale: 'zh-CN',
  themeColor: 'cyan',
})
const loading = ref(true)
const saving = ref(false)
const resetOpen = ref(false)
const resetting = ref(false)
const dirty = ref(false)
const feedbackKey = ref<FeedbackKey>('feedbackConnecting')
const feedbackArgs = ref<Record<string, string | number>>({})
let refreshTimer: ReturnType<typeof setInterval> | undefined
let commandCopyTimer: ReturnType<typeof setTimeout> | undefined

const copy = computed(() => ({
  ...commonMessages.value,
  ...workspaceMessages.value,
}))
const feedback = computed(() => t(`workspace.${feedbackKey.value}`, feedbackArgs.value))
const enabledCount = computed(() => draft.platforms.length)
const syncProgress = computed(() => settings.value ? 100 : 20)

function setFeedback(key: FeedbackKey, args: Record<string, string | number> = {}) {
  feedbackKey.value = key
  feedbackArgs.value = args
}

async function syncI18nLocale(nextLocale: AskXLocale) {
  if (locale.value !== nextLocale) await setI18nLocale(nextLocale)
}

async function applySettings(next: AskXConfig, key: FeedbackKey, args: Record<string, string | number> = {}) {
  settings.value = next
  draft.locale = next.locale
  draft.themeColor = next.themeColor
  draft.backupBeforeLink = next.skills.backupBeforeLink
  draft.platforms = [...next.skills.platforms]
  dirty.value = false
  applyThemeColor(next.themeColor)
  setFeedback(key, args)
  await syncI18nLocale(next.locale)
}

function errorStatus(error: unknown): number | undefined {
  const candidate = error as { statusCode?: number; response?: { status?: number } }
  return candidate.statusCode ?? candidate.response?.status
}

function removeTokenFromAddressBar() {
  if (!import.meta.client) return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('token')) return
  url.searchParams.delete('token')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

function startRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = setInterval(() => refreshSettings(), 1200)
}

async function checkSession() {
  try {
    await $fetch('/api/session')
    authState.value = 'authenticated'
    if (props.login) {
      const next = await $fetch<AskXConfig>('/api/settings')
      await navigateTo(localePath('/', next.locale), { replace: true })
      return
    }
    await refreshSettings(true)
    startRefreshTimer()
  } catch {
    authState.value = 'unauthenticated'
    if (!props.login) await navigateTo(localePath('/login'), { replace: true })
  } finally {
    removeTokenFromAddressBar()
  }
}

async function authenticate() {
  const credential = parseSessionCredential(tokenInput.value)
  if (credential.kind === 'empty') {
    authError.value = t('auth.tokenRequired')
    return
  }
  if (credential.kind === 'url-without-token') {
    authError.value = t('auth.tokenUrlMissing')
    return
  }

  authenticating.value = true
  authError.value = ''
  try {
    await $fetch('/api/session', { method: 'POST', body: { token: credential.token } })
    tokenInput.value = ''
    authState.value = 'authenticated'
    const next = await $fetch<AskXConfig>('/api/settings')
    await navigateTo(localePath('/', next.locale), { replace: true })
  } catch {
    authError.value = t('auth.invalidToken')
  } finally {
    authenticating.value = false
  }
}

function updateTokenInput(value: string) {
  tokenInput.value = value
  authError.value = ''
}

async function copyTokenCommand() {
  commandCopied.value = await useCopyText(tokenCommand)
  if (!commandCopied.value) return
  if (commandCopyTimer) clearTimeout(commandCopyTimer)
  commandCopyTimer = setTimeout(() => { commandCopied.value = false }, 1600)
}

async function refreshSettings(initial = false, force = false) {
  try {
    const next = await $fetch<AskXConfig>('/api/settings')
    if (force || !settings.value || next.revision !== settings.value.revision) {
      if (dirty.value && settings.value) {
        setFeedback('feedbackExternal', { revision: next.revision })
        await syncI18nLocale(next.locale)
      } else {
        await applySettings(next, initial ? 'feedbackConnected' : 'feedbackSynced', { source: next.updatedBy.toUpperCase() })
      }
    }
  } catch (error) {
    if (errorStatus(error) === 401) {
      authState.value = 'unauthenticated'
      if (refreshTimer) clearInterval(refreshTimer)
      refreshTimer = undefined
      if (!props.login) await navigateTo(localePath('/login'), { replace: true })
    } else {
      setFeedback('feedbackReadFailed')
    }
  } finally {
    loading.value = false
  }
}

function togglePlatform(platform: ManagedPlatformId) {
  const exists = draft.platforms.includes(platform)
  if (exists && draft.platforms.length === 1) {
    setFeedback('feedbackMinPlatform')
    return
  }
  draft.platforms = exists
    ? draft.platforms.filter((entry) => entry !== platform)
    : [...draft.platforms, platform]
  dirty.value = true
  setFeedback('feedbackUnsaved')
}

function setBackup(value: boolean) {
  if (draft.backupBeforeLink === value) return
  draft.backupBeforeLink = value
  dirty.value = true
  setFeedback('feedbackUnsaved')
}

async function handleLocaleChange(value: unknown) {
  if ((value !== 'zh-CN' && value !== 'en') || !settings.value || value === draft.locale || saving.value) return
  saving.value = true
  try {
    const updated = await $fetch<AskXConfig>('/api/settings', {
      method: 'PUT',
      body: {
        revision: settings.value.revision,
        patch: {
          locale: value,
          themeColor: draft.themeColor,
          skills: {
            backupBeforeLink: draft.backupBeforeLink,
            platforms: draft.platforms,
          },
        },
      },
    })
    await applySettings(updated, 'feedbackSaved', { revision: updated.revision })
  } catch (error) {
    if (errorStatus(error) === 409) {
      dirty.value = false
      await refreshSettings(false, true)
      setFeedback('feedbackConflict')
    } else {
      setFeedback('feedbackSaveFailed')
    }
  } finally {
    saving.value = false
  }
}

function setVisualTheme(theme: VisualTheme) {
  visualTheme.value = theme
  if (!import.meta.client) return
  const shouldUseDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', shouldUseDark)
}

function applyThemeColor(color: AskXThemeColor) {
  if (!import.meta.client) return
  document.documentElement.classList.toggle('theme-rose', color === 'rose')
  document.documentElement.classList.toggle('theme-cyan', color === 'cyan')
}

function setThemeColor(color: AskXThemeColor) {
  if (draft.themeColor === color) return
  draft.themeColor = color
  applyThemeColor(color)
  dirty.value = true
  setFeedback('feedbackUnsaved')
}

async function saveSettings() {
  if (!settings.value || !dirty.value) return
  saving.value = true
  try {
    const updated = await $fetch<AskXConfig>('/api/settings', {
      method: 'PUT',
      body: {
        revision: settings.value.revision,
        patch: {
          locale: draft.locale,
          themeColor: draft.themeColor,
          skills: {
            backupBeforeLink: draft.backupBeforeLink,
            platforms: draft.platforms,
          },
        },
      },
    })
    await applySettings(updated, 'feedbackSaved', { revision: updated.revision })
  } catch (error) {
    if (errorStatus(error) === 409) {
      dirty.value = false
      await refreshSettings(false, true)
      setFeedback('feedbackConflict')
    } else {
      setFeedback('feedbackSaveFailed')
    }
  } finally {
    saving.value = false
  }
}

/** 恢复全部共享设置默认值，同时保留 Skills、备份和链接数据。 */
async function resetSettings(close: () => void) {
  if (!settings.value || resetting.value) return
  resetting.value = true
  try {
    const updated = await $fetch<AskXConfig>('/api/settings/reset', {
      method: 'POST',
      body: { revision: settings.value.revision, confirmed: true },
    })
    await applySettings(updated, 'feedbackReset', { revision: updated.revision })
    close()
  } catch (error) {
    if (errorStatus(error) === 409) {
      dirty.value = false
      await refreshSettings(false, true)
      setFeedback('feedbackConflict')
    } else {
      setFeedback('feedbackSaveFailed')
    }
  } finally {
    resetting.value = false
  }
}

function openWorkspacePage(destination: WorkspaceView) {
  return navigateTo(localePath(destination === 'home' ? '/' : `/${destination}`))
}

onMounted(checkSession)

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (commandCopyTimer) clearTimeout(commandCopyTimer)
})
</script>

<template>
  <div
    v-if="authState === 'checking'"
    class="grid place-items-center bg-background px-6 text-foreground"
    :class="props.login ? 'min-h-screen' : 'min-h-svh'"
  >
    <div class="grid justify-items-center gap-4 text-center">
      <BrandMark class="size-12" />
      <div class="grid gap-2">
        <Skeleton class="h-5 w-36" />
        <Skeleton class="h-3 w-52" />
      </div>
    </div>
  </div>

  <SessionLogin
    v-else-if="authState === 'unauthenticated'"
    :model-value="tokenInput"
    :auth-error="authError"
    :authenticating="authenticating"
    :token-command="tokenCommand"
    :command-copied="commandCopied"
    @update:model-value="updateTokenInput"
    @submit="authenticate"
    @copy-command="copyTokenCommand"
  />

  <div v-else class="min-h-svh bg-background text-foreground">
    <WorkspacePortal
      v-if="workspaceView === 'home'"
      :enabled-count="enabledCount"
      :revision="settings?.revision"
      :backup-enabled="draft.backupBeforeLink"
      :theme-color="draft.themeColor"
      @select="openWorkspacePage"
    />

    <CsWorkspaceContent v-else-if="workspaceView === 'skills-x'" as="main" class="grid min-h-svh content-start gap-8 pb-8 pt-20 lg:pb-12 lg:pt-16">
      <BusSkillsOnboarding :settings="settings" @settings-updated="applySettings($event, 'feedbackSaved', { revision: $event.revision })" />
    </CsWorkspaceContent>

    <CsWorkspaceContent v-else-if="workspaceView === 'theme'" as="main" class="grid min-h-svh content-start gap-8 pb-8 pt-20 lg:pb-12 lg:pt-16">
      <section class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-3xl">
          <CsWorkspacePageNav icon="askx-status:star" :label="copy.themePreviewOnly" />
          <h1 class="text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">{{ copy.themePageTitle }}</h1>
          <p class="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{{ copy.themePageDescription }}</p>
        </div>
        <Button size="40" :disabled="!dirty || saving || loading" data-testid="save-theme" @click="saveSettings"><Icon name="askx-actions:refresh" v-if="saving" class="animate-spin" /><Icon name="askx-actions:confirm" v-else />{{ saving ? copy.saving : copy.save }}</Button>
      </section>

      <section>
        <div class="mb-4"><h2 class="text-sm font-medium">{{ copy.themeColorTitle }}</h2><p class="mt-1 text-xs text-muted-foreground">{{ copy.themeColorDescription }}</p></div>
        <div class="grid gap-4 sm:grid-cols-2">
          <button type="button" class="flex items-center gap-4 rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg" :class="draft.themeColor === 'cyan' ? 'border-primary ring-2 ring-primary/20' : ''" data-testid="theme-color-cyan" @click="setThemeColor('cyan')">
            <span class="grid size-14 shrink-0 place-items-center rounded-xl bg-[#2fbdc7]/15"><span class="size-7 rounded-full bg-[#2fbdc7] shadow-[0_0_24px_rgba(47,189,199,.45)]" /></span>
            <span><strong class="block text-sm">{{ copy.themeCyan }}</strong><small class="mt-1.5 block text-xs leading-5 text-muted-foreground">{{ copy.themeCyanDescription }}</small></span>
            <Icon name="askx-status:check" v-if="draft.themeColor === 'cyan'" class="ml-auto size-4 text-primary" />
          </button>
          <button type="button" class="flex items-center gap-4 rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg" :class="draft.themeColor === 'rose' ? 'border-primary ring-2 ring-primary/20' : ''" data-testid="theme-color-rose" @click="setThemeColor('rose')">
            <span class="grid size-14 shrink-0 place-items-center rounded-xl bg-[#e7659f]/15"><span class="size-7 rounded-full bg-[#e7659f] shadow-[0_0_24px_rgba(231,101,159,.45)]" /></span>
            <span><strong class="block text-sm">{{ copy.themeRose }}</strong><small class="mt-1.5 block text-xs leading-5 text-muted-foreground">{{ copy.themeRoseDescription }}</small></span>
            <Icon name="askx-status:check" v-if="draft.themeColor === 'rose'" class="ml-auto size-4 text-primary" />
          </button>
        </div>
      </section>

      <section class="grid gap-5 md:grid-cols-3">
        <button type="button" class="group overflow-hidden rounded-2xl border bg-card p-3 text-left transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl" :class="visualTheme === 'light' ? 'ring-2 ring-primary/40' : ''" @click="setVisualTheme('light')">
          <span class="block h-44 rounded-xl border bg-[#f5f6f8] p-4"><span class="mb-8 block h-3 w-20 rounded-full bg-primary" /><span class="block h-14 rounded-xl border border-black/10 bg-white shadow-sm" /></span>
          <span class="block px-2 pb-2 pt-4"><strong class="block text-sm">{{ copy.themeMist }}</strong><small class="mt-1.5 block leading-5 text-muted-foreground">{{ copy.themeMistDescription }}</small></span>
        </button>
        <button type="button" class="group overflow-hidden rounded-2xl border bg-card p-3 text-left transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl" :class="visualTheme === 'dark' ? 'ring-2 ring-primary/40' : ''" @click="setVisualTheme('dark')">
          <span class="block h-44 rounded-xl border border-white/10 bg-[#08090b] p-4"><span class="mb-8 block h-3 w-20 rounded-full bg-primary" /><span class="block h-14 rounded-xl border border-white/10 bg-[#16171a] shadow-sm" /></span>
          <span class="block px-2 pb-2 pt-4"><strong class="block text-sm">{{ copy.themeNight }}</strong><small class="mt-1.5 block leading-5 text-muted-foreground">{{ copy.themeNightDescription }}</small></span>
        </button>
        <button type="button" class="group overflow-hidden rounded-2xl border bg-card p-3 text-left transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl" :class="visualTheme === 'system' ? 'ring-2 ring-primary/40' : ''" @click="setVisualTheme('system')">
          <span class="grid h-44 grid-cols-2 overflow-hidden rounded-xl border"><span class="bg-[#f5f6f8] p-4"><span class="block h-3 rounded-full bg-primary" /></span><span class="bg-[#08090b] p-4"><span class="block h-3 rounded-full bg-primary" /></span></span>
          <span class="block px-2 pb-2 pt-4"><strong class="block text-sm">{{ copy.themeSystem }}</strong><small class="mt-1.5 block leading-5 text-muted-foreground">{{ copy.themeSystemDescription }}</small></span>
        </button>
      </section>
    </CsWorkspaceContent>

    <CsWorkspaceContent v-else as="main" class="grid min-h-svh content-start gap-8 pb-8 pt-20 lg:pb-10 lg:pt-16">
      <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div class="max-w-3xl">
          <CsWorkspacePageNav icon="askx-status:star" :label="copy.pageEyebrow" />
          <h1 class="text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-4xl lg:text-5xl">{{ copy.pageTitle }}</h1>
          <p class="mt-4 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">{{ copy.pageDescription }}</p>
        </div>
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon name="askx-actions:refresh" class="size-3.5" :class="{ 'animate-spin': loading }" />
          <span data-testid="settings-feedback">{{ feedback }}</span>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-3" :aria-label="copy.overview">
        <Card size="sm">
          <CardHeader class="flex-row items-start justify-between space-y-0">
            <div><CardDescription>{{ copy.agentsEnabled }}</CardDescription><CardTitle class="mt-2 text-2xl">{{ enabledCount }} / {{ agents.length }}</CardTitle></div>
            <span class="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon name="askx-objects:agent" class="size-4" /></span>
          </CardHeader>
          <CardContent class="text-xs text-muted-foreground">{{ enabledCount }} {{ copy.agentsEnabledHint }}</CardContent>
        </Card>

        <Card size="sm">
          <CardHeader class="flex-row items-start justify-between space-y-0">
            <div>
              <CardDescription>{{ copy.currentRevision }}</CardDescription>
              <CardTitle v-if="settings" class="mt-2 text-2xl" data-testid="settings-revision">#{{ settings.revision }}</CardTitle>
              <Skeleton v-else class="mt-2 h-7 w-16" />
            </div>
            <span class="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Icon name="askx-objects:branch" class="size-4" /></span>
          </CardHeader>
          <CardContent class="text-xs text-muted-foreground">{{ copy.currentRevisionHint }}</CardContent>
        </Card>

        <Card size="sm">
          <CardHeader class="flex-row items-start justify-between space-y-0">
            <div><CardDescription>{{ copy.safetyGuard }}</CardDescription><CardTitle class="mt-2 text-base">{{ draft.backupBeforeLink ? copy.safetyGuardOn : copy.safetyGuardOff }}</CardTitle></div>
            <span class="grid size-9 place-items-center rounded-lg bg-success-soft text-success"><Icon name="askx-status:lock" class="size-4" /></span>
          </CardHeader>
          <CardContent><Badge :variant="draft.backupBeforeLink ? 'secondary' : 'destructive'">{{ draft.backupBeforeLink ? copy.connected : copy.off }}</Badge></CardContent>
        </Card>
      </section>

      <section class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,.75fr)]">
        <Card data-testid="settings-panel">
          <CardHeader class="border-b">
            <div class="flex items-start gap-3">
              <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon name="askx-actions:settings" class="size-4" /></span>
              <div><CardTitle>{{ copy.settingsTitle }}</CardTitle><CardDescription class="mt-1.5">{{ copy.settingsDescription }}</CardDescription></div>
            </div>
          </CardHeader>

          <CardContent class="grid gap-6 pt-2">
            <section>
              <div class="mb-3 flex items-end justify-between gap-4">
                <div><h2 class="text-sm font-medium">{{ copy.platformsTitle }}</h2><p class="mt-1 text-xs text-muted-foreground">{{ copy.platformsDescription }}</p></div>
                <Badge variant="outline">{{ enabledCount }}/{{ agents.length }}</Badge>
              </div>
              <div class="grid gap-3 sm:grid-cols-3" :class="{ 'pointer-events-none opacity-60': loading }">
                <Button
                  v-for="agent in agents"
                  :key="agent.id"
                  type="button"
                  variant="outline"
                  class="h-auto min-w-0 justify-start gap-3 p-3 text-left"
                  :class="draft.platforms.includes(agent.id) ? 'border-primary bg-primary/5 hover:bg-primary/8' : 'text-muted-foreground'"
                  :aria-pressed="draft.platforms.includes(agent.id)"
                  :data-testid="`platform-${agent.id}`"
                  @click="togglePlatform(agent.id)"
                >
                  <span class="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground"><Icon :name="agent.icon" class="size-4.5" aria-hidden="true" /></span>
                  <span class="min-w-0 flex-1"><strong class="block truncate text-xs font-medium text-foreground">{{ agent.name }}</strong><small class="mt-1 block truncate font-mono text-[10px]">{{ agent.note }}</small></span>
                  <Icon name="askx-status:check" v-if="draft.platforms.includes(agent.id)" class="size-3.5 shrink-0 text-primary" />
                </Button>
              </div>
            </section>

            <Separator />

            <section class="flex items-center justify-between gap-6">
              <div class="flex min-w-0 items-start gap-3">
                <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Icon name="askx-actions:download" class="size-4" /></span>
                <div><div class="flex flex-wrap items-center gap-2"><h2 class="text-sm font-medium">{{ copy.backupTitle }}</h2><Badge variant="secondary">{{ copy.recommended }}</Badge></div><p class="mt-1 text-xs leading-5 text-muted-foreground">{{ copy.backupDescription }}</p></div>
              </div>
              <Switch
                :model-value="draft.backupBeforeLink"
                :aria-label="copy.backupTitle"
                data-testid="backup-toggle"
                @update:model-value="setBackup"
              />
            </section>

            <Separator />

            <section class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div class="flex min-w-0 items-start gap-3">
                <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Icon name="askx-objects:language" class="size-4" /></span>
                <div><h2 class="text-sm font-medium">{{ copy.languageTitle }}</h2><p class="mt-1 text-xs leading-5 text-muted-foreground">{{ copy.languageDescription }}</p></div>
              </div>
              <ToggleGroup
                type="single"
                variant="outline"
                :model-value="draft.locale"
                class="w-full sm:w-auto"
                :disabled="saving || loading"
                @update:model-value="handleLocaleChange"
              >
                <ToggleGroupItem value="zh-CN" class="flex-1 sm:flex-none" data-testid="locale-zh-CN"><Icon name="askx-objects:language" class="size-3.5" />{{ copy.chinese }}</ToggleGroupItem>
                <ToggleGroupItem value="en" class="flex-1 sm:flex-none" data-testid="locale-en">EN</ToggleGroupItem>
              </ToggleGroup>
            </section>
          </CardContent>

          <CardFooter class="flex-col justify-between gap-3 sm:flex-row">
            <div class="flex items-center gap-2 text-xs" :class="dirty ? 'text-warning' : 'text-muted-foreground'">
              <span class="size-1.5 rounded-full" :class="dirty ? 'bg-warning' : 'bg-success'" />
              {{ dirty ? copy.unsaved : copy.allSaved }}
            </div>
            <Button size="40" :disabled="!dirty || saving || loading" data-testid="save-settings" @click="saveSettings">
              <Icon name="askx-actions:refresh" v-if="saving" data-icon="inline-start" class="animate-spin" />
              <Icon name="askx-actions:confirm" v-else data-icon="inline-start" />
              {{ saving ? copy.saving : copy.save }}
            </Button>
          </CardFooter>
        </Card>

        <div class="grid gap-6">
          <Card>
            <CardHeader>
              <div class="flex items-center justify-between gap-3">
                <span class="grid size-9 place-items-center rounded-lg bg-success-soft text-success"><Icon name="askx-objects:layers" class="size-4" /></span>
                <Badge variant="outline"><span class="size-1.5 rounded-full bg-success" />{{ settings ? copy.connected : copy.connecting }}</Badge>
              </div>
              <CardTitle class="mt-2">{{ copy.syncTitle }}</CardTitle>
              <CardDescription>{{ copy.syncDescription }}</CardDescription>
            </CardHeader>
            <CardContent class="grid gap-4">
              <Progress :model-value="syncProgress" />
              <dl class="grid gap-3 text-xs">
                <div class="flex items-center justify-between gap-4"><dt class="text-muted-foreground">{{ copy.revision }}</dt><dd class="font-mono font-medium">#{{ settings?.revision ?? '—' }}</dd></div>
                <div class="flex items-center justify-between gap-4"><dt class="text-muted-foreground">{{ copy.source }}</dt><dd class="font-mono font-medium">{{ settings?.updatedBy?.toUpperCase() ?? '—' }}</dd></div>
                <div class="flex items-center justify-between gap-4"><dt class="text-muted-foreground">{{ copy.configPath }}</dt><dd class="truncate font-mono font-medium">~/.askx/config.json</dd></div>
                <div class="flex items-center justify-between gap-4"><dt class="text-muted-foreground">{{ copy.polling }}</dt><dd class="font-mono font-medium">{{ copy.pollingValue }}</dd></div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div class="flex items-center justify-between gap-3"><span class="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon name="askx-objects:agent" class="size-4" /></span><Badge variant="secondary"><Icon name="askx-status:lock" class="size-3" />{{ copy.readOnly }}</Badge></div>
              <CardTitle class="mt-2">{{ copy.skillsTitle }}</CardTitle>
              <CardDescription>{{ copy.skillsDescription }}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol class="grid gap-2">
                <li v-for="(key, index) in pipelineKeys" :key="key" class="flex items-center gap-2 text-xs">
                  <span class="grid size-5 place-items-center rounded-full" :class="index === 0 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'">
                    <Icon name="askx-status:check" v-if="index === 0" class="size-3" />
                    <span v-else class="text-[9px]">{{ index + 1 }}</span>
                  </span>
                  <span :class="index === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'">{{ copy[key] }}</span>
                  <Icon name="askx-navigation:chevron-right" v-if="index < pipelineKeys.length - 1" class="ml-auto size-3 text-muted-foreground/50" />
                </li>
              </ol>
            </CardContent>
            <CardFooter class="flex-col items-stretch gap-2 bg-transparent">
              <Button variant="outline" size="40" disabled><Icon name="askx-objects:agent" data-icon="inline-start" />{{ copy.runDetection }}</Button>
              <p class="text-center text-[11px] text-muted-foreground">{{ copy.comingSoon }}</p>
            </CardFooter>
          </Card>

          <Card class="border-destructive/30">
            <CardHeader>
              <CardTitle>{{ copy.resetSettingsTitle }}</CardTitle>
              <CardDescription>{{ copy.resetSettingsDescription }}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="destructive" size="40" :disabled="loading || saving" data-testid="reset-settings" @click="resetOpen = true">
                <Icon name="askx-actions:refresh" />{{ copy.resetSettingsAction }}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </section>

      <CsResponsiveOverlayDialogDrawer
        v-model:open="resetOpen"
        :title="copy.resetSettingsConfirmTitle"
        :description="copy.resetSettingsConfirmDescription"
        :dismissible="!resetting"
        :close-disabled="resetting"
        :close-label="copy.resetSettingsCancel"
      >
        <p class="rounded-2xl border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">{{ copy.resetSettingsPreserved }}</p>
        <template #footer="{ close }">
          <Button variant="outline" :disabled="resetting" @click="close">{{ copy.resetSettingsCancel }}</Button>
          <Button variant="destructive" :disabled="resetting" data-testid="confirm-reset-settings" @click="resetSettings(close)">
            <Icon name="askx-actions:refresh" :class="{ 'animate-spin': resetting }" />{{ resetting ? copy.resettingSettings : copy.confirmResetSettings }}
          </Button>
        </template>
      </CsResponsiveOverlayDialogDrawer>
    </CsWorkspaceContent>

  </div>
</template>
