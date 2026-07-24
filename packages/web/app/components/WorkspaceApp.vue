<script setup lang="ts">
import type { AskXConfig, AskXLocale, AskXThemeColor, ManagedPlatformId } from '@askx/core'
import {
  Bot,
  Check,
  ChevronRight,
  CircleCheck,
  CloudCog,
  Command,
  Database,
  GitBranch,
  Globe2,
  HardDriveDownload,
  Languages,
  LockKeyhole,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { parseSessionCredential } from '@/lib/session-credential'

const agents: Array<{ id: ManagedPlatformId; name: string; mark: string; note: string }> = [
  { id: 'codex', name: 'Codex', mark: 'CX', note: '~/.codex/skills' },
  { id: 'claude', name: 'Claude Code', mark: 'CL', note: '~/.claude/skills' },
  { id: 'cursor', name: 'Cursor', mark: 'CU', note: '~/.cursor/skills' },
]

const messages = {
  en: {
    welcomeEyebrow: 'Private local workspace', welcomeTitle: 'Welcome to AskAgent X.', welcomeDescription: 'Enter the token for the active local UI session to continue. The token stays in an HttpOnly session cookie and is never stored in browser storage.',
    tokenLabel: 'Session token', tokenPlaceholder: 'Token or http://…/?token=…', unlock: 'Open workspace', unlocking: 'Verifying…', invalidToken: 'That token is invalid or the UI session has expired.', tokenRequired: 'Enter a token to continue.', tokenUrlMissing: 'This URL does not contain a token parameter.',
    tokenHelpTitle: 'Get the token from the CLI', tokenHelpDescription: 'Open another terminal in the project and run:', copyCommand: 'Copy command', commandCopied: 'Command copied',
    credentialHint: 'Paste token or startup URL', detectedToken: 'Token detected', detectedUrl: 'Startup URL detected', detectedUrlMissing: 'URL has no token parameter', paste: 'Paste', pasted: 'Pasted', pasteDenied: 'Use ⌘V', showToken: 'Show token', hideToken: 'Hide token', terminalLabel: 'LOCAL SESSION HANDSHAKE', secureChannel: 'SECURE CHANNEL',
    authLocal: 'Loopback only', authPrivate: 'HttpOnly session', authNoStorage: 'No browser storage',
    home: 'AskAgent X home', productTagline: 'Local extension workspace', localOnly: 'Local only', demoNav: 'UI Demo', demoPublic: 'Explore the public UI demo without a token.',
    overview: 'Overview', sharedSettings: 'Shared settings', modules: 'Modules', skillsNav: 'Skills', themeNav: 'Themes', settingsNav: 'Settings', backToPortal: 'Back to portal',
    skillsPageTitle: 'Skills orbit', skillsPageDescription: 'A focused view of the reusable capabilities shared by every enabled Agent.',
    themePageTitle: 'Workspace atmosphere', themePageDescription: 'Choose a shared accent color, then preview the light and dark appearance locally.',
    themeMist: 'Mineral mist', themeMistDescription: 'Bright surfaces, cyan energy and generous clarity.', themeNight: 'Deep orbit', themeNightDescription: 'A focused dark canvas with luminous details.', themeSystem: 'Follow system', themeSystemDescription: 'Match the appearance preference of this device.', themePreviewOnly: 'Local preview',
    themeColorTitle: 'Theme color', themeColorDescription: 'This accent is shared by the Web and CLI.', themeCyan: 'Ion cyan', themeCyanDescription: 'Clear, technical and energetic.', themeRose: 'Signal rose', themeRoseDescription: 'Expressive warmth with a precise edge.',
    pageEyebrow: 'Agent extension control', pageTitle: 'One workspace for every local agent.',
    pageDescription: 'Manage shared settings, platform connections, and Skills topology from a calm, versioned control surface.',
    connected: 'Connected', connecting: 'Connecting', agentsEnabled: 'Agents enabled', agentsEnabledHint: 'platforms share one Skills policy',
    currentRevision: 'Current revision', currentRevisionHint: 'conflict-safe shared state', safetyGuard: 'Safety guard', safetyGuardOn: 'Backup before every link', safetyGuardOff: 'Backup is currently disabled',
    settingsTitle: 'Workspace settings', settingsDescription: 'Changes are stored in ~/.askx/config.json and synchronized with the CLI.',
    platformsTitle: 'Agent platforms', platformsDescription: 'Choose the local agents managed by this workspace.', enabled: 'Enabled', off: 'Off',
    backupTitle: 'Backup before linking', backupDescription: 'Keep a durable copy before AskAgent X changes a platform link.', recommended: 'Recommended',
    languageTitle: 'Interface language', languageDescription: 'This preference is shared by the Web and CLI.', chinese: '简体中文', english: 'English',
    save: 'Save changes', saving: 'Saving…', unsaved: 'Unsaved changes', allSaved: 'All changes saved',
    syncTitle: 'Shared state', syncDescription: 'The Web watches the same revision used by every CLI command.', revision: 'Revision', source: 'Last source', configPath: 'Config path', polling: 'Sync interval', pollingValue: '1.2 seconds',
    skillsTitle: 'Skills topology', skillsDescription: 'Read-only discovery is available now. Transactional changes unlock after the safety chain is complete.', readOnly: 'Read only', runDetection: 'Run detection', comingSoon: 'Available in a later milestone',
    pipelineDetect: 'Detect', pipelinePlan: 'Plan', pipelineConsent: 'Consent', pipelineApply: 'Apply', pipelineVerify: 'Verify', pipelineRollback: 'Rollback',
    footer: 'No telemetry. Settings stay on this device.',
    feedbackConnecting: 'Connecting to shared settings…', feedbackConnected: 'Shared settings connected', feedbackSynced: '{source} update synced to Web',
    feedbackExternal: 'Revision #{revision} detected; reload before saving', feedbackMinPlatform: 'Keep at least one Agent platform',
    feedbackUnsaved: 'Unsaved Web settings', feedbackSaved: 'WEB saved · revision #{revision}', feedbackReadFailed: 'Failed to read settings',
    feedbackConflict: 'Settings changed elsewhere; reloading…',
  },
  'zh-CN': {
    welcomeEyebrow: '私有本地工作台', welcomeTitle: '欢迎使用 AskAgent X。', welcomeDescription: '输入当前本地 UI 会话的 token 后继续。token 只用于建立 HttpOnly 会话，不会写入浏览器存储。',
    tokenLabel: '会话 token', tokenPlaceholder: 'Token 或 http://…/?token=…', unlock: '进入工作台', unlocking: '验证中…', invalidToken: 'token 无效，或当前 UI 会话已经结束。', tokenRequired: '请输入 token 后继续。', tokenUrlMissing: '这个 URL 中没有 token 参数。',
    tokenHelpTitle: '通过 CLI 获取 token', tokenHelpDescription: '在项目目录中打开另一个终端并运行：', copyCommand: '复制命令', commandCopied: '已复制命令',
    credentialHint: '粘贴 token 或完整启动 URL', detectedToken: '已识别 Token', detectedUrl: '已识别启动 URL', detectedUrlMissing: 'URL 缺少 token 参数', paste: '粘贴', pasted: '已粘贴', pasteDenied: '请按 ⌘V', showToken: '显示 token', hideToken: '隐藏 token', terminalLabel: '本地会话握手', secureChannel: '安全通道',
    authLocal: '仅限本机回环地址', authPrivate: 'HttpOnly 会话', authNoStorage: '不写入浏览器存储',
    home: 'AskAgent X 首页', productTagline: '本地扩展工作台', localOnly: '仅限本地', demoNav: 'UI Demo', demoPublic: '无需 Token，先浏览公开 UI Demo。',
    overview: '概览', sharedSettings: '共享设置', modules: '模块', skillsNav: 'Skills', themeNav: '主题', settingsNav: '设置', backToPortal: '返回入口',
    skillsPageTitle: 'Skills 轨道', skillsPageDescription: '集中查看每个已启用 Agent 共享的可复用能力与安全处理链路。',
    themePageTitle: '工作台氛围', themePageDescription: '选择 Web 与 CLI 共享的主题色，并在本地即时预览明暗外观。',
    themeMist: '矿物薄雾', themeMistDescription: '明亮表面、青色能量与充足的留白。', themeNight: '深空轨道', themeNightDescription: '沉浸式暗色画布，保留清晰的发光细节。', themeSystem: '跟随系统', themeSystemDescription: '自动匹配当前设备的外观偏好。', themePreviewOnly: '本地预览',
    themeColorTitle: '主题色', themeColorDescription: '这项强调色由 Web 和 CLI 共同使用。', themeCyan: '离子青', themeCyanDescription: '清晰、理性，同时保持充足的能量感。', themeRose: '信号玫红', themeRoseDescription: '更具表达力的暖色，但依旧保持精准。',
    pageEyebrow: 'Agent 扩展控制', pageTitle: '一个工作台，管理所有本地 Agent。',
    pageDescription: '在清晰、可追踪的控制界面中管理共享设置、平台连接与 Skills 拓扑。',
    connected: '已连接', connecting: '连接中', agentsEnabled: '已启用 Agent', agentsEnabledHint: '个平台共享同一套 Skills 策略',
    currentRevision: '当前版本', currentRevisionHint: '冲突安全的共享状态', safetyGuard: '安全保护', safetyGuardOn: '每次挂接前自动备份', safetyGuardOff: '当前已关闭挂接前备份',
    settingsTitle: '工作台设置', settingsDescription: '变更保存到 ~/.askx/config.json，并与 CLI 双向同步。',
    platformsTitle: 'Agent 平台', platformsDescription: '选择由当前工作台管理的本地 Agent。', enabled: '已启用', off: '关闭',
    backupTitle: '挂接前备份', backupDescription: 'AskAgent X 修改平台链接前保留一份长期副本。', recommended: '推荐',
    languageTitle: '界面语言', languageDescription: '这个偏好由 Web 和 CLI 共同使用。', chinese: '简体中文', english: 'English',
    save: '保存更改', saving: '保存中…', unsaved: '存在未保存更改', allSaved: '所有更改已保存',
    syncTitle: '共享状态', syncDescription: 'Web 持续监听每一条 CLI 命令所使用的同一份 revision。', revision: '版本', source: '最近来源', configPath: '配置路径', polling: '同步间隔', pollingValue: '1.2 秒',
    skillsTitle: 'Skills 拓扑', skillsDescription: '当前已开放只读检测。安全链路完整后将开放事务化变更。', readOnly: '只读', runDetection: '运行检测', comingSoon: '后续里程碑开放',
    pipelineDetect: '发现', pipelinePlan: '计划', pipelineConsent: '授权', pipelineApply: '应用', pipelineVerify: '验证', pipelineRollback: '回滚',
    footer: '无遥测，所有设置仅保留在当前设备。',
    feedbackConnecting: '正在连接共享设置…', feedbackConnected: '共享设置已连接', feedbackSynced: '{source} 更新已同步到 Web',
    feedbackExternal: '检测到 revision #{revision}，保存前请重新载入', feedbackMinPlatform: '至少保留一个 Agent 平台',
    feedbackUnsaved: '存在未保存的 Web 设置', feedbackSaved: 'WEB 保存完成 · revision #{revision}', feedbackReadFailed: '读取设置失败',
    feedbackConflict: '设置已被其他入口更新，正在重新载入…',
  },
} as const

type MessageKey = keyof typeof messages.en
type AuthState = 'checking' | 'authenticated' | 'unauthenticated'
type WorkspaceView = 'home' | 'skills' | 'theme' | 'settings'
type VisualTheme = 'light' | 'dark' | 'system'

const props = withDefaults(defineProps<{
  view?: WorkspaceView
  login?: boolean
}>(), {
  view: 'home',
  login: false,
})

const tokenCommand = 'pnpm askx ui token'
const pipelineKeys = ['pipelineDetect', 'pipelinePlan', 'pipelineConsent', 'pipelineApply', 'pipelineVerify', 'pipelineRollback'] as const
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
  platforms: ['codex', 'claude', 'cursor'],
  locale: 'zh-CN',
  themeColor: 'cyan',
})
const loading = ref(true)
const saving = ref(false)
const dirty = ref(false)
const feedbackKey = ref<MessageKey>('feedbackConnecting')
const feedbackArgs = ref<Record<string, string | number>>({})
let refreshTimer: ReturnType<typeof setInterval> | undefined

const copy = computed(() => messages[draft.locale])
const { locale: workspaceLocale } = useWorkspaceUi()
const feedback = computed(() => {
  const template: string = copy.value[feedbackKey.value]
  return Object.entries(feedbackArgs.value).reduce<string>(
    (value, [key, replacement]) => value.replace(`{${key}}`, String(replacement)),
    template,
  )
})
const enabledCount = computed(() => draft.platforms.length)
const syncProgress = computed(() => settings.value ? 100 : 20)

useHead(() => ({ htmlAttrs: { lang: draft.locale }, bodyAttrs: { class: 'bg-background text-foreground' } }))

watch(() => draft.locale, (locale) => {
  workspaceLocale.value = locale
}, { immediate: true })

function setFeedback(key: MessageKey, args: Record<string, string | number> = {}) {
  feedbackKey.value = key
  feedbackArgs.value = args
}

function applySettings(next: AskXConfig, key: MessageKey, args: Record<string, string | number> = {}) {
  settings.value = next
  draft.locale = next.locale
  draft.themeColor = next.themeColor
  draft.backupBeforeLink = next.skills.backupBeforeLink
  draft.platforms = [...next.skills.platforms]
  dirty.value = false
  applyThemeColor(next.themeColor)
  setFeedback(key, args)
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
      await navigateTo('/', { replace: true })
      return
    }
    await refreshSettings(true)
    startRefreshTimer()
  } catch {
    authState.value = 'unauthenticated'
    if (!props.login) await navigateTo('/login', { replace: true })
  } finally {
    removeTokenFromAddressBar()
  }
}

async function authenticate() {
  const credential = parseSessionCredential(tokenInput.value)
  if (credential.kind === 'empty') {
    authError.value = copy.value.tokenRequired
    return
  }
  if (credential.kind === 'url-without-token') {
    authError.value = copy.value.tokenUrlMissing
    return
  }

  authenticating.value = true
  authError.value = ''
  try {
    await $fetch('/api/session', { method: 'POST', body: { token: credential.token } })
    tokenInput.value = ''
    authState.value = 'authenticated'
    await navigateTo('/', { replace: true })
    await refreshSettings(true)
    startRefreshTimer()
  } catch {
    authError.value = copy.value.invalidToken
  } finally {
    authenticating.value = false
  }
}

function updateTokenInput(value: string) {
  tokenInput.value = value
  authError.value = ''
}

async function copyTokenCommand() {
  try {
    await navigator.clipboard.writeText(tokenCommand)
    commandCopied.value = true
    setTimeout(() => { commandCopied.value = false }, 1600)
  } catch {
    commandCopied.value = false
  }
}

async function refreshSettings(initial = false, force = false) {
  try {
    const next = await $fetch<AskXConfig>('/api/settings')
    if (force || !settings.value || next.revision !== settings.value.revision) {
      if (dirty.value && settings.value) {
        setFeedback('feedbackExternal', { revision: next.revision })
      } else {
        applySettings(next, initial ? 'feedbackConnected' : 'feedbackSynced', { source: next.updatedBy.toUpperCase() })
      }
    }
  } catch (error) {
    if (errorStatus(error) === 401) {
      authState.value = 'unauthenticated'
      if (refreshTimer) clearInterval(refreshTimer)
      refreshTimer = undefined
      if (!props.login) await navigateTo('/login', { replace: true })
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

function setLocale(locale: AskXLocale) {
  if (draft.locale === locale) return
  draft.locale = locale
  dirty.value = true
  setFeedback('feedbackUnsaved')
}

function handleLocaleChange(value: unknown) {
  if (value === 'zh-CN' || value === 'en') setLocale(value)
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
    applySettings(updated, 'feedbackSaved', { revision: updated.revision })
  } catch {
    dirty.value = false
    await refreshSettings(false, true)
    setFeedback('feedbackConflict')
  } finally {
    saving.value = false
  }
}

function openWorkspacePage(destination: WorkspaceView) {
  return navigateTo(destination === 'home' ? '/' : `/${destination}`)
}

onMounted(checkSession)

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div
    v-if="authState === 'checking'"
    class="grid place-items-center bg-background px-6 text-foreground"
    :class="props.login ? 'min-h-screen' : 'min-h-[calc(100vh-4rem)]'"
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
    :copy="copy"
    :auth-error="authError"
    :authenticating="authenticating"
    :token-command="tokenCommand"
    :command-copied="commandCopied"
    @update:model-value="updateTokenInput"
    @submit="authenticate"
    @copy-command="copyTokenCommand"
  />

  <div v-else class="min-h-[calc(100vh-4rem)] bg-background text-foreground">
    <WorkspacePortal
      v-if="workspaceView === 'home'"
      :locale="draft.locale"
      :enabled-count="enabledCount"
      :revision="settings?.revision"
      :backup-enabled="draft.backupBeforeLink"
      :theme-color="draft.themeColor"
      @select="openWorkspacePage"
    />

    <main v-else-if="workspaceView === 'skills'" class="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl content-start gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <section class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div class="max-w-3xl">
          <Button as-child variant="ghost" size="sm" class="mb-4 -ml-2 text-muted-foreground"><NuxtLink to="/"><ChevronRight class="rotate-180" />{{ copy.backToPortal }}</NuxtLink></Button>
          <Badge variant="secondary" class="mb-4 text-primary"><Command data-icon="inline-start" />{{ copy.skillsNav }}</Badge>
          <h1 class="text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">{{ copy.skillsPageTitle }}</h1>
          <p class="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{{ copy.skillsPageDescription }}</p>
        </div>
        <Badge variant="outline" class="gap-1.5 bg-card"><span class="size-1.5 rounded-full bg-success" />{{ enabledCount }}/{{ agents.length }} {{ copy.connected }}</Badge>
      </section>

      <section class="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <Card>
          <CardHeader><CardTitle>{{ copy.platformsTitle }}</CardTitle><CardDescription>{{ copy.platformsDescription }}</CardDescription></CardHeader>
          <CardContent class="grid gap-3 sm:grid-cols-3">
            <div v-for="agent in agents" :key="agent.id" class="flex items-center gap-3 rounded-xl border bg-card/70 p-4" :class="draft.platforms.includes(agent.id) ? 'border-primary/40' : 'opacity-50'">
              <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 font-mono text-[10px] text-primary">{{ agent.mark }}</span>
              <span class="min-w-0"><strong class="block truncate text-sm">{{ agent.name }}</strong><small class="mt-1 block truncate font-mono text-[10px] text-muted-foreground">{{ agent.note }}</small></span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div class="flex items-center justify-between"><span class="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><TerminalSquare class="size-4" /></span><Badge variant="secondary">{{ copy.readOnly }}</Badge></div><CardTitle class="mt-2">{{ copy.skillsTitle }}</CardTitle><CardDescription>{{ copy.skillsDescription }}</CardDescription></CardHeader>
          <CardContent><ol class="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3"><li v-for="(key, index) in pipelineKeys" :key="key" class="grid justify-items-center gap-2 rounded-lg bg-muted/65 p-3 text-center text-[11px]"><span class="grid size-6 place-items-center rounded-full" :class="index === 0 ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'"><CircleCheck v-if="index === 0" class="size-3" /><span v-else>{{ index + 1 }}</span></span><span>{{ copy[key] }}</span></li></ol></CardContent>
        </Card>
      </section>
    </main>

    <main v-else-if="workspaceView === 'theme'" class="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl content-start gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <section class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-3xl">
          <Button as-child variant="ghost" size="sm" class="mb-4 -ml-2 text-muted-foreground"><NuxtLink to="/"><ChevronRight class="rotate-180" />{{ copy.backToPortal }}</NuxtLink></Button>
          <Badge variant="secondary" class="mb-4 text-primary"><Sparkles data-icon="inline-start" />{{ copy.themePreviewOnly }}</Badge>
          <h1 class="text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">{{ copy.themePageTitle }}</h1>
          <p class="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{{ copy.themePageDescription }}</p>
        </div>
        <Button :disabled="!dirty || saving || loading" data-testid="save-theme" @click="saveSettings"><RefreshCw v-if="saving" class="animate-spin" /><Save v-else />{{ saving ? copy.saving : copy.save }}</Button>
      </section>

      <section>
        <div class="mb-4"><h2 class="text-sm font-medium">{{ copy.themeColorTitle }}</h2><p class="mt-1 text-xs text-muted-foreground">{{ copy.themeColorDescription }}</p></div>
        <div class="grid gap-4 sm:grid-cols-2">
          <button type="button" class="flex items-center gap-4 rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg" :class="draft.themeColor === 'cyan' ? 'border-primary ring-2 ring-primary/20' : ''" data-testid="theme-color-cyan" @click="setThemeColor('cyan')">
            <span class="grid size-14 shrink-0 place-items-center rounded-xl bg-[#2fbdc7]/15"><span class="size-7 rounded-full bg-[#2fbdc7] shadow-[0_0_24px_rgba(47,189,199,.45)]" /></span>
            <span><strong class="block text-sm">{{ copy.themeCyan }}</strong><small class="mt-1.5 block text-xs leading-5 text-muted-foreground">{{ copy.themeCyanDescription }}</small></span>
            <Check v-if="draft.themeColor === 'cyan'" class="ml-auto size-4 text-primary" />
          </button>
          <button type="button" class="flex items-center gap-4 rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg" :class="draft.themeColor === 'rose' ? 'border-primary ring-2 ring-primary/20' : ''" data-testid="theme-color-rose" @click="setThemeColor('rose')">
            <span class="grid size-14 shrink-0 place-items-center rounded-xl bg-[#e7659f]/15"><span class="size-7 rounded-full bg-[#e7659f] shadow-[0_0_24px_rgba(231,101,159,.45)]" /></span>
            <span><strong class="block text-sm">{{ copy.themeRose }}</strong><small class="mt-1.5 block text-xs leading-5 text-muted-foreground">{{ copy.themeRoseDescription }}</small></span>
            <Check v-if="draft.themeColor === 'rose'" class="ml-auto size-4 text-primary" />
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
    </main>

    <main v-else class="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div class="max-w-3xl">
          <Badge variant="secondary" class="mb-4 text-primary"><Sparkles data-icon="inline-start" />{{ copy.pageEyebrow }}</Badge>
          <h1 class="text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-4xl lg:text-5xl">{{ copy.pageTitle }}</h1>
          <p class="mt-4 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">{{ copy.pageDescription }}</p>
        </div>
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': loading }" />
          <span data-testid="settings-feedback">{{ feedback }}</span>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-3" :aria-label="copy.overview">
        <Card size="sm">
          <CardHeader class="flex-row items-start justify-between space-y-0">
            <div><CardDescription>{{ copy.agentsEnabled }}</CardDescription><CardTitle class="mt-2 text-2xl">{{ enabledCount }} / {{ agents.length }}</CardTitle></div>
            <span class="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Bot class="size-4" /></span>
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
            <span class="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground"><GitBranch class="size-4" /></span>
          </CardHeader>
          <CardContent class="text-xs text-muted-foreground">{{ copy.currentRevisionHint }}</CardContent>
        </Card>

        <Card size="sm">
          <CardHeader class="flex-row items-start justify-between space-y-0">
            <div><CardDescription>{{ copy.safetyGuard }}</CardDescription><CardTitle class="mt-2 text-base">{{ draft.backupBeforeLink ? copy.safetyGuardOn : copy.safetyGuardOff }}</CardTitle></div>
            <span class="grid size-9 place-items-center rounded-lg bg-success-soft text-success"><ShieldCheck class="size-4" /></span>
          </CardHeader>
          <CardContent><Badge :variant="draft.backupBeforeLink ? 'secondary' : 'destructive'">{{ draft.backupBeforeLink ? copy.connected : copy.off }}</Badge></CardContent>
        </Card>
      </section>

      <section class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,.75fr)]">
        <Card data-testid="settings-panel">
          <CardHeader class="border-b">
            <div class="flex items-start gap-3">
              <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CloudCog class="size-4" /></span>
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
                  <span class="grid size-8 shrink-0 place-items-center rounded-md bg-secondary font-mono text-[10px] text-secondary-foreground">{{ agent.mark }}</span>
                  <span class="min-w-0 flex-1"><strong class="block truncate text-xs font-medium text-foreground">{{ agent.name }}</strong><small class="mt-1 block truncate font-mono text-[10px]">{{ agent.note }}</small></span>
                  <Check v-if="draft.platforms.includes(agent.id)" class="size-3.5 shrink-0 text-primary" />
                </Button>
              </div>
            </section>

            <Separator />

            <section class="flex items-center justify-between gap-6">
              <div class="flex min-w-0 items-start gap-3">
                <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><HardDriveDownload class="size-4" /></span>
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
                <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Languages class="size-4" /></span>
                <div><h2 class="text-sm font-medium">{{ copy.languageTitle }}</h2><p class="mt-1 text-xs leading-5 text-muted-foreground">{{ copy.languageDescription }}</p></div>
              </div>
              <ToggleGroup
                type="single"
                variant="outline"
                :model-value="draft.locale"
                class="w-full sm:w-auto"
                @update:model-value="handleLocaleChange"
              >
                <ToggleGroupItem value="zh-CN" class="flex-1 sm:flex-none" data-testid="locale-zh-CN"><Globe2 class="size-3.5" />{{ copy.chinese }}</ToggleGroupItem>
                <ToggleGroupItem value="en" class="flex-1 sm:flex-none" data-testid="locale-en">EN</ToggleGroupItem>
              </ToggleGroup>
            </section>
          </CardContent>

          <CardFooter class="flex-col justify-between gap-3 sm:flex-row">
            <div class="flex items-center gap-2 text-xs" :class="dirty ? 'text-warning' : 'text-muted-foreground'">
              <span class="size-1.5 rounded-full" :class="dirty ? 'bg-warning' : 'bg-success'" />
              {{ dirty ? copy.unsaved : copy.allSaved }}
            </div>
            <Button :disabled="!dirty || saving || loading" data-testid="save-settings" @click="saveSettings">
              <RefreshCw v-if="saving" data-icon="inline-start" class="animate-spin" />
              <Save v-else data-icon="inline-start" />
              {{ saving ? copy.saving : copy.save }}
            </Button>
          </CardFooter>
        </Card>

        <div class="grid gap-6">
          <Card>
            <CardHeader>
              <div class="flex items-center justify-between gap-3">
                <span class="grid size-9 place-items-center rounded-lg bg-success-soft text-success"><Database class="size-4" /></span>
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
              <div class="flex items-center justify-between gap-3"><span class="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><TerminalSquare class="size-4" /></span><Badge variant="secondary"><LockKeyhole class="size-3" />{{ copy.readOnly }}</Badge></div>
              <CardTitle class="mt-2">{{ copy.skillsTitle }}</CardTitle>
              <CardDescription>{{ copy.skillsDescription }}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol class="grid gap-2">
                <li v-for="(key, index) in pipelineKeys" :key="key" class="flex items-center gap-2 text-xs">
                  <span class="grid size-5 place-items-center rounded-full" :class="index === 0 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'">
                    <CircleCheck v-if="index === 0" class="size-3" />
                    <span v-else class="text-[9px]">{{ index + 1 }}</span>
                  </span>
                  <span :class="index === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'">{{ copy[key] }}</span>
                  <ChevronRight v-if="index < pipelineKeys.length - 1" class="ml-auto size-3 text-muted-foreground/50" />
                </li>
              </ol>
            </CardContent>
            <CardFooter class="flex-col items-stretch gap-2 bg-transparent">
              <Button variant="outline" disabled><Command data-icon="inline-start" />{{ copy.runDetection }}</Button>
              <p class="text-center text-[11px] text-muted-foreground">{{ copy.comingSoon }}</p>
            </CardFooter>
          </Card>
        </div>
      </section>
    </main>

  </div>
</template>
