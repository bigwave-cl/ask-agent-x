<script setup lang="ts">
import { BookOpen, Check, ClipboardPaste, Copy, Eye, EyeOff, KeyRound, Link2, LoaderCircle, LockKeyhole, LogIn, ShieldCheck, TerminalSquare } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseSessionCredential } from '@/lib/session-credential'

const props = defineProps<{
  modelValue: string
  authError: string
  authenticating: boolean
  tokenCommand: string
  commandCopied: boolean
}>()

const localePath = useLocalePath()
const commonMessages = useMessageSection('common')
const authMessages = useMessageSection('auth')
const copy = computed(() => ({
  ...commonMessages.value,
  ...authMessages.value,
}))

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'submit': []
  'copy-command': []
}>()

const showToken = ref(false)
const pasteStatus = ref<'idle' | 'pasted' | 'denied'>('idle')
let pasteTimer: ReturnType<typeof setTimeout> | undefined

const credential = computed(() => parseSessionCredential(props.modelValue))
const credentialStatus = computed(() => {
  if (credential.value.kind === 'url') return { label: copy.value.detectedUrl, tone: 'url' }
  if (credential.value.kind === 'url-without-token') return { label: copy.value.detectedUrlMissing, tone: 'error' }
  if (credential.value.kind === 'token') return { label: copy.value.detectedToken, tone: 'token' }
  return null
})

function updateValue(value: string | number) {
  pasteStatus.value = 'idle'
  emit('update:modelValue', String(value))
}

function setPasteStatus(status: 'pasted' | 'denied') {
  pasteStatus.value = status
  if (pasteTimer) clearTimeout(pasteTimer)
  pasteTimer = setTimeout(() => { pasteStatus.value = 'idle' }, 1800)
}

function handleNativePaste(event: ClipboardEvent) {
  const value = event.clipboardData?.getData('text')
  if (!value) return
  event.preventDefault()
  emit('update:modelValue', value.trim())
  setPasteStatus('pasted')
}

async function pasteFromClipboard() {
  try {
    const value = await navigator.clipboard.readText()
    if (!value) throw new Error('Clipboard is empty')
    emit('update:modelValue', value.trim())
    setPasteStatus('pasted')
  } catch {
    setPasteStatus('denied')
  }
}

onBeforeUnmount(() => {
  if (pasteTimer) clearTimeout(pasteTimer)
})
</script>

<template>
  <div class="relative isolate min-h-screen overflow-hidden bg-ds-auth-bg text-ds-auth-text max-[880px]:overflow-auto">
    <ClientOnly>
      <LazyAntigravityBackground
        class="-z-3 opacity-48"
        :count="230"
        color="#52cdd4"
        :magnet-radius="14"
        :ring-radius="9.5"
        :wave-amplitude="1.1"
      />
    </ClientOnly>
    <div class="pointer-events-none absolute inset-0 -z-2 [background:radial-gradient(circle_at_73%_50%,color-mix(in_srgb,var(--ds-color-brand-default)_22%,transparent),transparent_24rem),radial-gradient(circle_at_14%_88%,color-mix(in_srgb,var(--ds-color-brand-hover)_13%,transparent),transparent_25rem),linear-gradient(112deg,transparent_0_47%,color-mix(in_srgb,var(--ds-color-brand-default)_5%,transparent)_48%_52%,transparent_53%)]" aria-hidden="true" />
    <div class="pointer-events-none absolute inset-0 -z-2 opacity-28 [background-image:linear-gradient(var(--ds-color-auth-grid)_1px,transparent_1px),linear-gradient(90deg,var(--ds-color-auth-grid)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_22%,transparent_78%)]" aria-hidden="true" />
    <div class="pointer-events-none absolute inset-y-0 left-[56%] -z-2 w-px rotate-8 scale-y-130 bg-[linear-gradient(transparent_8%,color-mix(in_srgb,var(--ds-color-brand-default)_50%,transparent),transparent_92%)] shadow-[0_0_32px_4px_color-mix(in_srgb,var(--ds-color-brand-default)_10%,transparent)]" aria-hidden="true" />

    <header class="relative z-3 mx-auto flex h-20 w-[calc(100%-2.5rem)] max-w-[76rem] items-center justify-between max-[520px]:w-[calc(100%-1.5rem)]">
      <NuxtLink :to="localePath('/')" class="flex items-center gap-3 text-inherit" :aria-label="copy.home">
        <BrandMark class="size-10 shrink-0" />
        <span><strong class="block text-[0.85rem] tracking-[-0.01em]">AskAgent X</strong><small class="mt-0.5 block text-[0.67rem] text-ds-auth-muted">{{ copy.productTagline }}</small></span>
      </NuxtLink>
      <Badge variant="outline" class="gap-[0.45rem] border-ds-auth-border bg-ds-auth-surface text-ds-auth-muted backdrop-blur-[14px] max-[520px]:hidden"><span class="size-[0.38rem] rounded-full bg-success shadow-[0_0_12px_var(--success)]" />127.0.0.1 · {{ copy.localOnly }}</Badge>
    </header>

    <main class="relative z-1 mx-auto grid min-h-[calc(100vh-5rem)] w-[calc(100%-2.5rem)] max-w-[76rem] grid-cols-[minmax(0,1fr)_minmax(23rem,28rem)] items-center gap-[clamp(3rem,8vw,8rem)] py-10 pb-20 max-[880px]:grid-cols-1 max-[880px]:gap-12 max-[880px]:pt-12 max-[520px]:w-[calc(100%-1.5rem)] max-[520px]:pt-8">
      <section class="relative max-w-[39rem] max-[880px]:max-w-[42rem]">
        <div class="flex items-center gap-[0.65rem] font-mono text-[0.68rem] uppercase tracking-[0.12em] text-ds-brand-active"><span class="text-ds-auth-muted">01</span><i class="h-px w-[2.2rem] bg-ds-brand-default shadow-[0_0_10px_var(--ds-color-brand-default)]" />{{ copy.welcomeEyebrow }}</div>
        <h1 class="mt-[1.35rem] max-w-[36rem] text-balance text-[clamp(3.5rem,7vw,6.6rem)] font-semibold leading-[0.92] tracking-[-0.07em] max-[880px]:text-[clamp(3.2rem,12vw,5.5rem)] max-[520px]:text-[3.3rem]">{{ copy.welcomeTitle }}</h1>
        <p class="mt-6 max-w-[34rem] text-[0.9rem] leading-[1.75] text-ds-auth-muted">{{ copy.welcomeDescription }}</p>

        <div class="relative mt-[2.8rem] h-20 w-48 max-[880px]:hidden" aria-hidden="true">
          <span class="absolute left-0 top-1/2 h-[3.8rem] w-44 -translate-y-1/2 -rotate-10 rounded-full border border-ds-auth-border" />
          <span class="absolute left-6 top-1/2 h-[2.4rem] w-32 -translate-y-1/2 rotate-8 rounded-full border border-[color-mix(in_srgb,var(--ds-color-brand-default)_34%,transparent)]" />
          <span class="absolute left-[4.1rem] top-1/2 -translate-y-1/2"><BrandMark class="size-14" /></span>
          <span class="absolute left-4 top-[0.8rem] size-[0.45rem] animate-node-pulse rounded-full bg-ds-brand-active shadow-[0_0_14px_var(--ds-color-brand-active)] motion-reduce:animate-none" />
          <span class="absolute bottom-[0.65rem] right-[0.7rem] size-[0.45rem] animate-node-pulse rounded-full bg-ds-brand-active shadow-[0_0_14px_var(--ds-color-brand-active)] [animation-delay:0.8s] motion-reduce:animate-none" />
        </div>

        <div class="mt-8 flex flex-wrap gap-x-4 gap-y-[0.65rem] text-[0.67rem] text-ds-auth-muted max-[520px]:gap-[0.55rem]">
          <span class="inline-flex items-center gap-[0.35rem]"><LockKeyhole class="size-3 text-ds-brand-active" />{{ copy.authLocal }}</span>
          <span class="inline-flex items-center gap-[0.35rem]"><ShieldCheck class="size-3 text-ds-brand-active" />{{ copy.authPrivate }}</span>
          <span class="inline-flex items-center gap-[0.35rem]">{{ copy.authNoStorage }}</span>
        </div>

        <Button as-child variant="soft" size="lg" class="mt-5 h-auto w-full max-w-[25rem] justify-start border border-ds-brand-default/20 bg-ds-brand-default/8 px-[0.85rem] py-[0.7rem] text-ds-auth-text" data-testid="open-public-demo">
          <NuxtLink :to="localePath('/demo')">
            <BookOpen />
            <span class="grid flex-1 gap-[0.1rem] text-left"><strong class="text-[0.7rem]">{{ copy.demoNav }}</strong><small class="text-[0.58rem] font-normal text-ds-auth-muted">{{ copy.demoPublic }}</small></span>
            <span aria-hidden="true">↗</span>
          </NuxtLink>
        </Button>
      </section>

      <section class="relative overflow-hidden rounded-[1.5rem_0.35rem_1.5rem_1.5rem] border border-ds-auth-border bg-[linear-gradient(145deg,color-mix(in_srgb,var(--ds-color-auth-surface)_92%,transparent),color-mix(in_srgb,var(--ds-color-auth-bg)_78%,transparent))] p-[1.3rem] shadow-[0_40px_110px_rgb(0_0_0_/_45%),inset_0_1px_rgb(255_255_255_/_6%)] [backdrop-filter:blur(24px)_saturate(1.2)] max-[880px]:w-full max-[880px]:max-w-[31rem] max-[520px]:rounded-[1.2rem_0.25rem_1.2rem_1.2rem] max-[520px]:p-4" data-testid="login-panel">
        <div class="pointer-events-none absolute -right-32 -top-32 size-72 rounded-full bg-[color-mix(in_srgb,var(--ds-color-brand-default)_13%,transparent)] blur-[38px]" aria-hidden="true" />
        <header class="relative grid grid-cols-[auto_1fr_auto] items-center gap-3 px-[0.1rem] pb-[1.2rem] pt-[0.2rem]">
          <span class="grid size-[2.6rem] place-items-center rounded-xl border border-[color-mix(in_srgb,var(--ds-color-brand-default)_28%,transparent)] bg-[color-mix(in_srgb,var(--ds-color-brand-default)_9%,transparent)] text-ds-brand-active"><KeyRound class="size-4" /></span>
          <span><small class="block font-mono text-[0.58rem] tracking-[0.11em] text-ds-auth-muted">{{ copy.terminalLabel }}</small><strong class="mt-1 block text-[0.9rem]">{{ copy.tokenLabel }}</strong></span>
          <Badge variant="outline" class="gap-[0.35rem] border-ds-auth-border font-mono text-[0.55rem] text-ds-auth-muted max-[520px]:hidden"><i class="size-[0.35rem] rounded-full bg-success" />{{ copy.secureChannel }}</Badge>
        </header>

        <form class="relative grid gap-3" @submit.prevent="emit('submit')">
          <div class="flex min-h-[1.3rem] items-center justify-between gap-3">
            <label for="session-token" class="text-[0.68rem] text-ds-auth-muted">{{ copy.credentialHint }}</label>
            <span v-if="credentialStatus" class="inline-flex items-center gap-[0.3rem] text-[0.6rem] text-ds-brand-active data-[tone=error]:text-destructive" :data-tone="credentialStatus.tone">
              <Link2 v-if="credentialStatus.tone === 'url'" class="size-[0.68rem]" />
              <KeyRound v-else class="size-[0.68rem]" />
              {{ credentialStatus.label }}
            </span>
          </div>

          <div class="relative flex items-center gap-[0.2rem] rounded-[0.85rem] border border-ds-auth-border bg-ds-auth-bg/68 p-[0.35rem] transition-[border-color,box-shadow] duration-180 focus-within:border-ds-brand-default/65 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ds-color-brand-default)_10%,transparent),0_0_30px_color-mix(in_srgb,var(--ds-color-brand-default)_8%,transparent)]">
            <TerminalSquare class="ml-2 size-[0.9rem] shrink-0 text-ds-auth-muted" />
            <Input
              id="session-token"
              :model-value="modelValue"
              :type="showToken ? 'text' : 'password'"
              autocomplete="one-time-code"
              spellcheck="false"
              :placeholder="copy.tokenPlaceholder"
              class="h-10 border-0 bg-transparent font-mono text-[0.72rem] text-ds-auth-text shadow-none focus-visible:border-0 focus-visible:ring-0"
              data-testid="token-input"
              :aria-invalid="Boolean(authError) || credential.kind === 'url-without-token'"
              autofocus
              @update:model-value="updateValue"
              @paste="handleNativePaste"
            />
            <Button type="button" variant="ghost" size="icon-sm" class="text-ds-auth-muted hover:bg-ds-brand-default/10 hover:text-ds-auth-text" :aria-label="showToken ? copy.hideToken : copy.showToken" @click="showToken = !showToken">
              <EyeOff v-if="showToken" />
              <Eye v-else />
            </Button>
            <Button type="button" variant="ghost" size="sm" class="mr-[0.1rem] text-[0.65rem] text-ds-auth-muted hover:bg-ds-brand-default/10 hover:text-ds-auth-text" :aria-label="copy.paste" data-testid="paste-token" @click="pasteFromClipboard">
              <Check v-if="pasteStatus === 'pasted'" />
              <ClipboardPaste v-else />
              <span class="max-[520px]:hidden">{{ pasteStatus === 'pasted' ? copy.pasted : pasteStatus === 'denied' ? copy.pasteDenied : copy.paste }}</span>
            </Button>
          </div>

          <p v-if="authError" role="alert" class="min-h-4 font-mono text-[0.58rem] tracking-[0.04em] text-destructive" data-testid="token-error">{{ authError }}</p>
          <p v-else-if="credential.kind === 'url-without-token'" role="status" class="min-h-4 font-mono text-[0.58rem] tracking-[0.04em] text-destructive">{{ copy.detectedUrlMissing }}</p>
          <p v-else class="min-h-4 font-mono text-[0.58rem] tracking-[0.04em] text-ds-auth-muted">TOKEN · URL / ?token=••••••••</p>

          <Button type="submit" size="lg" class="mt-[0.15rem] h-[2.8rem] justify-start gap-[0.65rem] rounded-[0.8rem_0.2rem_0.8rem_0.8rem] px-4 shadow-[0_12px_34px_color-mix(in_srgb,var(--ds-color-brand-default)_16%,transparent)]" :disabled="authenticating" data-testid="login-submit">
            <LoaderCircle v-if="authenticating" class="animate-spin" />
            <LogIn v-else />
            {{ authenticating ? copy.unlocking : copy.unlock }}
            <span class="ml-auto text-base" aria-hidden="true">↗</span>
          </Button>
        </form>

        <div class="my-[1.15rem] flex items-center gap-[0.7rem] font-mono text-[0.54rem] tracking-[0.12em] text-ds-auth-muted"><span class="h-px flex-1 bg-ds-auth-border" /><span>{{ copy.cliHandshake }}</span><span class="h-px flex-1 bg-ds-auth-border" /></div>

        <section class="grid gap-[0.7rem]">
          <div class="grid gap-[0.2rem]"><strong class="text-[0.72rem]">{{ copy.tokenHelpTitle }}</strong><span class="text-[0.6rem] leading-normal text-ds-auth-muted">{{ copy.tokenHelpDescription }}</span></div>
          <div class="flex min-w-0 items-center gap-[0.6rem] rounded-[0.7rem] border border-ds-auth-border bg-black/25 py-[0.4rem] pl-3 pr-[0.45rem]">
            <span class="font-mono text-[0.7rem] text-ds-brand-active" aria-hidden="true">$</span>
            <code class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.68rem] text-ds-auth-text">{{ tokenCommand }}</code>
            <Button type="button" variant="ghost" size="icon-sm" class="text-ds-auth-muted" :aria-label="copy.copyCommand" data-testid="copy-token-command" @click="emit('copy-command')">
              <Check v-if="commandCopied" />
              <Copy v-else />
            </Button>
          </div>
          <small class="text-[0.6rem] leading-normal text-ds-auth-muted">{{ commandCopied ? copy.commandCopied : copy.footer }}</small>
        </section>
      </section>
    </main>
  </div>
</template>
