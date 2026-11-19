<script setup lang="ts">
import type { AskXConfig, AskXLocale, AskXThemeColor, ManagedPlatformId } from '@askx/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { ResponsiveSelectOption } from '@/components/common/responsive-select/types'
import { useConfirm } from '@/composables/useConfirm'
import { parseSessionCredential } from '@/lib/session-credential'
import { defineComponent, h } from 'vue'

type FeedbackKey = 'feedbackConnecting' | 'feedbackConnected' | 'feedbackSynced' | 'feedbackExternal' | 'feedbackMinPlatform' | 'feedbackUnsaved' | 'feedbackSaved' | 'feedbackReadFailed' | 'feedbackSaveFailed' | 'feedbackConflict' | 'feedbackReset'
type AuthState = 'checking' | 'authenticated' | 'unauthenticated'
type WorkspaceView = 'home' | 'skills-x' | 'theme' | 'settings' | 'bridge'
type VisualTheme = 'light' | 'dark' | 'system'

const props = withDefaults(defineProps<{
    view?: WorkspaceView
    login?: boolean
}>(), {
    view: 'home',
    login: false,
})

const tokenCommand = 'askx ui token'
const localePath = useLocalePath()
const { locale, setLocale: setI18nLocale, t } = useI18n()
const commonMessages = useMessageSection('common')
const workspaceMessages = useMessageSection('workspace')
/** 工作台操作反馈 Toast。 */
const toast = useToast()
const settings = ref<AskXConfig | null>(null)
const authState = ref<AuthState>('checking')
const workspaceView = computed(() => props.view)
const visualTheme = ref<VisualTheme>('light')
const tokenInput = ref('')
const authenticating = ref(false)
const authError = ref('')
const commandCopied = ref(false)
const draft = reactive<{ backupBeforeLink: boolean, platforms: ManagedPlatformId[], locale: AskXLocale, themeColor: AskXThemeColor }>({
    backupBeforeLink: true,
    platforms: [],
    locale: 'zh-CN',
    themeColor: 'cyan',
})
const loading = ref(true)
const saving = ref(false)
/** 恢复初始状态请求是否正在执行。 */
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
const enabledCount = computed(() => draft.platforms.length)
/** 设置页语言选项。 */
const languageOptions = computed<ResponsiveSelectOption[]>(() => [
    { value: 'zh-CN', label: copy.value.chinese },
    { value: 'en', label: 'English' },
])

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
    const candidate = error as { statusCode?: number, response?: { status?: number } }
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
    }
    catch {
        authState.value = 'unauthenticated'
        if (!props.login) await navigateTo(localePath('/login'), { replace: true })
    }
    finally {
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
    }
    catch {
        authError.value = t('auth.invalidToken')
    }
    finally {
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
            }
            else {
                await applySettings(next, initial ? 'feedbackConnected' : 'feedbackSynced', { source: next.updatedBy.toUpperCase() })
            }
        }
    }
    catch (error) {
        if (errorStatus(error) === 401) {
            authState.value = 'unauthenticated'
            if (refreshTimer) clearInterval(refreshTimer)
            refreshTimer = undefined
            if (!props.login) await navigateTo(localePath('/login'), { replace: true })
        }
        else {
            setFeedback('feedbackReadFailed')
        }
    }
    finally {
        loading.value = false
    }
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
    }
    catch (error) {
        if (errorStatus(error) === 409) {
            dirty.value = false
            await refreshSettings(false, true)
            setFeedback('feedbackConflict')
        }
        else {
            setFeedback('feedbackSaveFailed')
        }
    }
    finally {
        saving.value = false
    }
}

/** 打开需要输入确认短语的恢复初始状态弹窗。 */
function openFactoryResetConfirm(): void {
    if (!settings.value || resetting.value) return
    const confirmation = ref('')
    /** 恢复初始状态确认输入区域。 */
    const FactoryResetConfirmation = defineComponent({
        name: 'FactoryResetConfirmation',
        setup() {
            return () => h('div', { class: 'grid gap-4' }, [
                h('p', { class: 'text-sm leading-6 text-muted-foreground' }, copy.value.factoryResetWarning),
                h('div', { class: 'grid gap-2' }, [
                    h('label', { class: 'text-sm font-medium text-foreground' }, copy.value.factoryResetInputLabel),
                    h(Input, {
                        modelValue: confirmation.value,
                        placeholder: copy.value.factoryResetPhrase,
                        autocomplete: 'off',
                        'onUpdate:modelValue': (value: string | number) => {
                            confirmation.value = String(value)
                            controller.init({ okDisabled: confirmation.value !== copy.value.factoryResetPhrase })
                        },
                    }),
                ]),
            ])
        },
    })
    const controller = useConfirm({
        title: copy.value.factoryResetConfirmTitle,
        desc: FactoryResetConfirmation,
        cancelText: copy.value.cancel,
        okText: copy.value.factoryResetAction,
        okVariant: 'destructive',
        okDisabled: true,
        contentClass: 'sm:max-w-lg',
        onOk: async done => {
            if (!settings.value || confirmation.value !== copy.value.factoryResetPhrase) return
            resetting.value = true
            try {
                const updated = await $fetch<AskXConfig>('/api/settings/factory-reset', {
                    method: 'POST',
                    body: { revision: settings.value.revision, confirmation: confirmation.value },
                })
                await applySettings(updated, 'feedbackReset', { revision: updated.revision })
                toast.success(copy.value.factoryResetSucceeded)
                done()
                await navigateTo(localePath('/settings'), { replace: true })
            }
            catch (error) {
                if (errorStatus(error) === 409) await refreshSettings(false, true)
                throw error
            }
            finally {
                resetting.value = false
            }
        },
    })
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
    }
    catch (error) {
        if (errorStatus(error) === 409) {
            dirty.value = false
            await refreshSettings(false, true)
            setFeedback('feedbackConflict')
        }
        else {
            setFeedback('feedbackSaveFailed')
        }
    }
    finally {
        saving.value = false
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

    <div
        v-else
        class="min-h-svh bg-background text-foreground"
    >
        <WorkspacePortal
            v-if="workspaceView === 'home'"
            :enabled-count="enabledCount"
            :revision="settings?.revision"
            :backup-enabled="draft.backupBeforeLink"
            :theme-color="draft.themeColor"
            @select="openWorkspacePage"
        />

        <CsWorkspaceContent
            v-else-if="workspaceView === 'skills-x'"
            as="main"
            class="grid min-h-svh content-start gap-8 pb-8 pt-20 lg:pb-12 lg:pt-16"
        >
            <BusSkillsOnboarding
                :settings="settings"
                @settings-updated="applySettings($event, 'feedbackSaved', { revision: $event.revision })"
            />
        </CsWorkspaceContent>

        <CsWorkspaceContent
            v-else-if="workspaceView === 'theme'"
            as="main"
            class="grid min-h-svh content-start gap-8 pb-8 pt-20 lg:pb-12 lg:pt-16"
        >
            <section class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div class="max-w-3xl">
                    <CsWorkspacePageNav
                        icon="askx-status:star"
                        :label="copy.themePreviewOnly"
                    />
                    <h1 class="text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
                        {{ copy.themePageTitle }}
                    </h1>
                    <p class="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                        {{ copy.themePageDescription }}
                    </p>
                </div>
                <Button
                    :size="40"
                    :disabled="!dirty || saving || loading"
                    data-testid="save-theme"
                    @click="saveSettings"
                >
                    <Icon
                        v-if="saving"
                        name="askx-actions:refresh"
                        class="animate-spin"
                    /><Icon
                        v-else
                        name="askx-actions:confirm"
                    />{{ saving ? copy.saving : copy.save }}
                </Button>
            </section>

            <section>
                <div class="mb-4">
                    <h2 class="text-sm font-medium">
                        {{ copy.themeColorTitle }}
                    </h2><p class="mt-1 text-xs text-muted-foreground">
                        {{ copy.themeColorDescription }}
                    </p>
                </div>
                <div class="grid gap-4 sm:grid-cols-2">
                    <button
                        type="button"
                        class="flex items-center gap-4 rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
                        :class="draft.themeColor === 'cyan' ? 'border-primary ring-2 ring-primary/20' : ''"
                        data-testid="theme-color-cyan"
                        @click="setThemeColor('cyan')"
                    >
                        <span class="grid size-14 shrink-0 place-items-center rounded-xl bg-[#2fbdc7]/15"><span class="size-7 rounded-full bg-[#2fbdc7] shadow-[0_0_24px_rgba(47,189,199,.45)]" /></span>
                        <span><strong class="block text-sm">{{ copy.themeCyan }}</strong><small class="mt-1.5 block text-xs leading-5 text-muted-foreground">{{ copy.themeCyanDescription }}</small></span>
                        <Icon
                            v-if="draft.themeColor === 'cyan'"
                            name="askx-status:check"
                            class="ml-auto size-4 text-primary"
                        />
                    </button>
                    <button
                        type="button"
                        class="flex items-center gap-4 rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
                        :class="draft.themeColor === 'rose' ? 'border-primary ring-2 ring-primary/20' : ''"
                        data-testid="theme-color-rose"
                        @click="setThemeColor('rose')"
                    >
                        <span class="grid size-14 shrink-0 place-items-center rounded-xl bg-[#e7659f]/15"><span class="size-7 rounded-full bg-[#e7659f] shadow-[0_0_24px_rgba(231,101,159,.45)]" /></span>
                        <span><strong class="block text-sm">{{ copy.themeRose }}</strong><small class="mt-1.5 block text-xs leading-5 text-muted-foreground">{{ copy.themeRoseDescription }}</small></span>
                        <Icon
                            v-if="draft.themeColor === 'rose'"
                            name="askx-status:check"
                            class="ml-auto size-4 text-primary"
                        />
                    </button>
                </div>
            </section>

            <section class="grid gap-5 md:grid-cols-3">
                <button
                    type="button"
                    class="group overflow-hidden rounded-2xl border bg-card p-3 text-left transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl"
                    :class="visualTheme === 'light' ? 'ring-2 ring-primary/40' : ''"
                    @click="setVisualTheme('light')"
                >
                    <span class="block h-44 rounded-xl border bg-[#f5f6f8] p-4"><span class="mb-8 block h-3 w-20 rounded-full bg-primary" /><span class="block h-14 rounded-xl border border-black/10 bg-white shadow-sm" /></span>
                    <span class="block px-2 pb-2 pt-4"><strong class="block text-sm">{{ copy.themeMist }}</strong><small class="mt-1.5 block leading-5 text-muted-foreground">{{ copy.themeMistDescription }}</small></span>
                </button>
                <button
                    type="button"
                    class="group overflow-hidden rounded-2xl border bg-card p-3 text-left transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl"
                    :class="visualTheme === 'dark' ? 'ring-2 ring-primary/40' : ''"
                    @click="setVisualTheme('dark')"
                >
                    <span class="block h-44 rounded-xl border border-white/10 bg-[#08090b] p-4"><span class="mb-8 block h-3 w-20 rounded-full bg-primary" /><span class="block h-14 rounded-xl border border-white/10 bg-[#16171a] shadow-sm" /></span>
                    <span class="block px-2 pb-2 pt-4"><strong class="block text-sm">{{ copy.themeNight }}</strong><small class="mt-1.5 block leading-5 text-muted-foreground">{{ copy.themeNightDescription }}</small></span>
                </button>
                <button
                    type="button"
                    class="group overflow-hidden rounded-2xl border bg-card p-3 text-left transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl"
                    :class="visualTheme === 'system' ? 'ring-2 ring-primary/40' : ''"
                    @click="setVisualTheme('system')"
                >
                    <span class="grid h-44 grid-cols-2 overflow-hidden rounded-xl border"><span class="bg-[#f5f6f8] p-4"><span class="block h-3 rounded-full bg-primary" /></span><span class="bg-[#08090b] p-4"><span class="block h-3 rounded-full bg-primary" /></span></span>
                    <span class="block px-2 pb-2 pt-4"><strong class="block text-sm">{{ copy.themeSystem }}</strong><small class="mt-1.5 block leading-5 text-muted-foreground">{{ copy.themeSystemDescription }}</small></span>
                </button>
            </section>
        </CsWorkspaceContent>

        <CsWorkspaceContent
            v-else
            as="main"
            class="grid min-h-svh content-start gap-8 pb-8 pt-20 lg:pb-10 lg:pt-16"
        >
            <section
                id="theme"
                class="grid gap-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
            >
                <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div class="max-w-3xl">
                        <CsWorkspacePageNav
                            icon="askx-status:star"
                            :label="copy.themePreviewOnly"
                        />
                        <h1 class="text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                            {{ copy.themePageTitle }}
                        </h1>
                        <p class="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                            {{ copy.themePageDescription }}
                        </p>
                    </div>
                    <Button
                        :size="40"
                        :disabled="!dirty || saving || loading"
                        data-testid="save-theme"
                        @click="saveSettings"
                    >
                        <Icon
                            v-if="saving"
                            name="askx-actions:refresh"
                            class="animate-spin"
                        /><Icon
                            v-else
                            name="askx-actions:confirm"
                        />{{ saving ? copy.saving : copy.save }}
                    </Button>
                </div>
                <div>
                    <h2 class="text-sm font-medium">
                        {{ copy.themeColorTitle }}
                    </h2>
                    <p class="mt-1 text-xs text-muted-foreground">
                        {{ copy.themeColorDescription }}
                    </p>
                    <div class="mt-4 grid gap-4 sm:grid-cols-2">
                        <button
                            type="button"
                            class="flex items-center gap-4 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
                            :class="draft.themeColor === 'cyan' ? 'border-primary ring-2 ring-primary/20' : ''"
                            data-testid="theme-color-cyan"
                            @click="setThemeColor('cyan')"
                        >
                            <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-[#2fbdc7]/15"><span class="size-6 rounded-full bg-[#2fbdc7] shadow-[0_0_24px_rgba(47,189,199,.45)]" /></span>
                            <span><strong class="block text-sm">{{ copy.themeCyan }}</strong><small class="mt-1 block text-xs leading-5 text-muted-foreground">{{ copy.themeCyanDescription }}</small></span>
                            <Icon
                                v-if="draft.themeColor === 'cyan'"
                                name="askx-status:check"
                                class="ml-auto size-4 text-primary"
                            />
                        </button>
                        <button
                            type="button"
                            class="flex items-center gap-4 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
                            :class="draft.themeColor === 'rose' ? 'border-primary ring-2 ring-primary/20' : ''"
                            data-testid="theme-color-rose"
                            @click="setThemeColor('rose')"
                        >
                            <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-[#e7659f]/15"><span class="size-6 rounded-full bg-[#e7659f] shadow-[0_0_24px_rgba(231,101,159,.45)]" /></span>
                            <span><strong class="block text-sm">{{ copy.themeRose }}</strong><small class="mt-1 block text-xs leading-5 text-muted-foreground">{{ copy.themeRoseDescription }}</small></span>
                            <Icon
                                v-if="draft.themeColor === 'rose'"
                                name="askx-status:check"
                                class="ml-auto size-4 text-primary"
                            />
                        </button>
                    </div>
                </div>
                <div class="grid gap-4 md:grid-cols-3">
                    <button
                        type="button"
                        class="group overflow-hidden rounded-2xl border p-3 text-left transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl"
                        :class="visualTheme === 'light' ? 'ring-2 ring-primary/40' : ''"
                        @click="setVisualTheme('light')"
                    >
                        <span class="block h-28 rounded-xl border bg-[#f5f6f8] p-4"><span class="mb-6 block h-3 w-20 rounded-full bg-primary" /><span class="block h-10 rounded-xl border border-black/10 bg-white shadow-sm" /></span><span class="block px-2 pb-1 pt-3"><strong class="block text-sm">{{ copy.themeMist }}</strong><small class="mt-1 block leading-5 text-muted-foreground">{{ copy.themeMistDescription }}</small></span>
                    </button>
                    <button
                        type="button"
                        class="group overflow-hidden rounded-2xl border p-3 text-left transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl"
                        :class="visualTheme === 'dark' ? 'ring-2 ring-primary/40' : ''"
                        @click="setVisualTheme('dark')"
                    >
                        <span class="block h-28 rounded-xl border border-white/10 bg-[#08090b] p-4"><span class="mb-6 block h-3 w-20 rounded-full bg-primary" /><span class="block h-10 rounded-xl border border-white/10 bg-[#16171a] shadow-sm" /></span><span class="block px-2 pb-1 pt-3"><strong class="block text-sm">{{ copy.themeNight }}</strong><small class="mt-1 block leading-5 text-muted-foreground">{{ copy.themeNightDescription }}</small></span>
                    </button>
                    <button
                        type="button"
                        class="group overflow-hidden rounded-2xl border p-3 text-left transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl"
                        :class="visualTheme === 'system' ? 'ring-2 ring-primary/40' : ''"
                        @click="setVisualTheme('system')"
                    >
                        <span class="grid h-28 grid-cols-2 overflow-hidden rounded-xl border"><span class="bg-[#f5f6f8] p-4"><span class="block h-3 rounded-full bg-primary" /></span><span class="bg-[#08090b] p-4"><span class="block h-3 rounded-full bg-primary" /></span></span><span class="block px-2 pb-1 pt-3"><strong class="block text-sm">{{ copy.themeSystem }}</strong><small class="mt-1 block leading-5 text-muted-foreground">{{ copy.themeSystemDescription }}</small></span>
                    </button>
                </div>
            </section>
            <section class="max-w-3xl">
                <CsWorkspacePageNav
                    icon="askx-objects:language"
                    :label="copy.pageEyebrow"
                />
                <h1 class="text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-4xl lg:text-5xl">
                    {{ copy.pageTitle }}
                </h1>
                <p class="mt-4 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
                    {{ copy.languageDescription }}
                </p>
            </section>

            <section class="max-w-2xl rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div class="flex min-w-0 items-start gap-3">
                        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon
                            name="askx-objects:language"
                            class="size-5"
                        /></span>
                        <div>
                            <h2 class="text-sm font-medium">
                                {{ copy.languageTitle }}
                            </h2>
                            <p class="mt-1 text-xs leading-5 text-muted-foreground">
                                {{ copy.languageDescription }}
                            </p>
                        </div>
                    </div>
                    <CsResponsiveSelect
                        :model-value="draft.locale"
                        size="40"
                        trigger-class="w-full sm:w-44"
                        :title="copy.languageTitle"
                        :placeholder="copy.languageTitle"
                        :close-label="copy.close"
                        :clear-label="copy.close"
                        :empty-text="copy.languageOptionsEmpty"
                        :options="languageOptions"
                        :disabled="saving || loading"
                        data-testid="locale-select"
                        @update:model-value="handleLocaleChange"
                    />
                </div>
            </section>

            <section class="max-w-2xl rounded-2xl border border-destructive/30 bg-card p-5 shadow-sm sm:p-6">
                <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div class="flex min-w-0 items-start gap-3">
                        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"><Icon
                            name="askx-actions:delete"
                            class="size-5"
                        /></span>
                        <div>
                            <h2 class="text-sm font-medium">
                                {{ copy.factoryResetTitle }}
                            </h2>
                            <p class="mt-1 text-xs leading-5 text-muted-foreground">
                                {{ copy.factoryResetDescription }}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="destructive"
                        :size="40"
                        :disabled="resetting || loading"
                        data-testid="factory-reset"
                        @click="openFactoryResetConfirm"
                    >
                        <Icon name="askx-actions:delete" />{{ copy.factoryResetAction }}
                    </Button>
                </div>
            </section>
        </CsWorkspaceContent>
    </div>
</template>
