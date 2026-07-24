<script setup lang="ts">
import { BookOpen, Check, ClipboardPaste, Copy, Eye, EyeOff, KeyRound, Link2, LoaderCircle, LockKeyhole, LogIn, ShieldCheck, TerminalSquare } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseSessionCredential } from '@/lib/session-credential'

interface LoginCopy {
  welcomeEyebrow: string
  welcomeTitle: string
  welcomeDescription: string
  tokenLabel: string
  tokenPlaceholder: string
  unlock: string
  unlocking: string
  tokenHelpTitle: string
  tokenHelpDescription: string
  copyCommand: string
  commandCopied: string
  authLocal: string
  authPrivate: string
  authNoStorage: string
  home: string
  productTagline: string
  localOnly: string
  demoNav: string
  demoPublic: string
  footer: string
  credentialHint: string
  detectedToken: string
  detectedUrl: string
  detectedUrlMissing: string
  paste: string
  pasted: string
  pasteDenied: string
  showToken: string
  hideToken: string
  terminalLabel: string
  secureChannel: string
}

const props = defineProps<{
  modelValue: string
  copy: LoginCopy
  authError: string
  authenticating: boolean
  tokenCommand: string
  commandCopied: boolean
}>()

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
  if (credential.value.kind === 'url') return { label: props.copy.detectedUrl, tone: 'url' }
  if (credential.value.kind === 'url-without-token') return { label: props.copy.detectedUrlMissing, tone: 'error' }
  if (credential.value.kind === 'token') return { label: props.copy.detectedToken, tone: 'token' }
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
  <div class="session-login">
    <ClientOnly>
      <LazyAntigravityBackground
        class="session-login__particles"
        :count="230"
        color="#52cdd4"
        :magnet-radius="14"
        :ring-radius="9.5"
        :wave-amplitude="1.1"
      />
    </ClientOnly>
    <div class="session-login__aura" aria-hidden="true" />
    <div class="session-login__grid" aria-hidden="true" />
    <div class="session-login__beam" aria-hidden="true" />

    <header class="session-login__header">
      <a href="#" class="session-login__brand" :aria-label="copy.home">
        <BrandMark class="size-10 shrink-0" />
        <span><strong>AskAgent X</strong><small>{{ copy.productTagline }}</small></span>
      </a>
      <Badge variant="outline" class="session-login__local"><span />127.0.0.1 · {{ copy.localOnly }}</Badge>
    </header>

    <main class="session-login__main">
      <section class="session-login__intro">
        <div class="session-login__eyebrow"><span>01</span><i />{{ copy.welcomeEyebrow }}</div>
        <h1>{{ copy.welcomeTitle }}</h1>
        <p>{{ copy.welcomeDescription }}</p>

        <div class="session-login__orbit" aria-hidden="true">
          <span class="session-login__orbit-ring session-login__orbit-ring--outer" />
          <span class="session-login__orbit-ring session-login__orbit-ring--inner" />
          <span class="session-login__orbit-core"><BrandMark class="size-14" /></span>
          <span class="session-login__orbit-node session-login__orbit-node--a" />
          <span class="session-login__orbit-node session-login__orbit-node--b" />
        </div>

        <div class="session-login__trust">
          <span><LockKeyhole />{{ copy.authLocal }}</span>
          <span><ShieldCheck />{{ copy.authPrivate }}</span>
          <span>{{ copy.authNoStorage }}</span>
        </div>

        <Button as="a" href="/demo" variant="soft" size="lg" class="session-login__demo" data-testid="open-public-demo">
          <BookOpen />
          <span><strong>{{ copy.demoNav }}</strong><small>{{ copy.demoPublic }}</small></span>
          <span aria-hidden="true">↗</span>
        </Button>
      </section>

      <section class="session-login__panel" data-testid="login-panel">
        <div class="session-login__panel-shine" aria-hidden="true" />
        <header class="session-login__panel-header">
          <span class="session-login__panel-icon"><KeyRound /></span>
          <span><small>{{ copy.terminalLabel }}</small><strong>{{ copy.tokenLabel }}</strong></span>
          <Badge variant="outline" class="session-login__channel"><i />{{ copy.secureChannel }}</Badge>
        </header>

        <form class="session-login__form" @submit.prevent="emit('submit')">
          <div class="session-login__label-row">
            <label for="session-token">{{ copy.credentialHint }}</label>
            <span v-if="credentialStatus" class="session-login__detected" :data-tone="credentialStatus.tone">
              <Link2 v-if="credentialStatus.tone === 'url'" />
              <KeyRound v-else />
              {{ credentialStatus.label }}
            </span>
          </div>

          <div class="session-login__input-wrap">
            <TerminalSquare class="session-login__input-icon" />
            <Input
              id="session-token"
              :model-value="modelValue"
              :type="showToken ? 'text' : 'password'"
              autocomplete="one-time-code"
              spellcheck="false"
              :placeholder="copy.tokenPlaceholder"
              class="session-login__input"
              data-testid="token-input"
              :aria-invalid="Boolean(authError) || credential.kind === 'url-without-token'"
              autofocus
              @update:model-value="updateValue"
              @paste="handleNativePaste"
            />
            <Button type="button" variant="ghost" size="icon-sm" class="session-login__input-action" :aria-label="showToken ? copy.hideToken : copy.showToken" @click="showToken = !showToken">
              <EyeOff v-if="showToken" />
              <Eye v-else />
            </Button>
            <Button type="button" variant="ghost" size="sm" class="session-login__paste" :aria-label="copy.paste" data-testid="paste-token" @click="pasteFromClipboard">
              <Check v-if="pasteStatus === 'pasted'" />
              <ClipboardPaste v-else />
              <span>{{ pasteStatus === 'pasted' ? copy.pasted : pasteStatus === 'denied' ? copy.pasteDenied : copy.paste }}</span>
            </Button>
          </div>

          <p v-if="authError" role="alert" class="session-login__error" data-testid="token-error">{{ authError }}</p>
          <p v-else-if="credential.kind === 'url-without-token'" role="status" class="session-login__error">{{ copy.detectedUrlMissing }}</p>
          <p v-else class="session-login__hint">TOKEN · URL / ?token=••••••••</p>

          <Button type="submit" size="lg" class="session-login__submit" :disabled="authenticating" data-testid="login-submit">
            <LoaderCircle v-if="authenticating" class="animate-spin" />
            <LogIn v-else />
            {{ authenticating ? copy.unlocking : copy.unlock }}
            <span aria-hidden="true">↗</span>
          </Button>
        </form>

        <div class="session-login__divider"><span>CLI HANDSHAKE</span></div>

        <section class="session-login__command">
          <div><strong>{{ copy.tokenHelpTitle }}</strong><span>{{ copy.tokenHelpDescription }}</span></div>
          <div class="session-login__terminal">
            <span aria-hidden="true">$</span>
            <code>{{ tokenCommand }}</code>
            <Button type="button" variant="ghost" size="icon-sm" :aria-label="copy.copyCommand" data-testid="copy-token-command" @click="emit('copy-command')">
              <Check v-if="commandCopied" />
              <Copy v-else />
            </Button>
          </div>
          <small>{{ commandCopied ? copy.commandCopied : copy.footer }}</small>
        </section>
      </section>
    </main>
  </div>
</template>

<style scoped>
.session-login {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  isolation: isolate;
  color: var(--ds-color-auth-text);
  background: var(--ds-color-auth-bg);
}

.session-login__particles { z-index: -3; opacity: 0.48; }

.session-login__aura,
.session-login__grid,
.session-login__beam {
  position: absolute;
  inset: 0;
  z-index: -2;
  pointer-events: none;
}

.session-login__aura {
  background:
    radial-gradient(circle at 73% 50%, color-mix(in srgb, var(--ds-color-brand-default) 22%, transparent), transparent 24rem),
    radial-gradient(circle at 14% 88%, color-mix(in srgb, var(--ds-color-brand-hover) 13%, transparent), transparent 25rem),
    linear-gradient(112deg, transparent 0 47%, color-mix(in srgb, var(--ds-color-brand-default) 5%, transparent) 48% 52%, transparent 53%);
}

.session-login__grid {
  opacity: 0.28;
  background-image:
    linear-gradient(var(--ds-color-auth-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--ds-color-auth-grid) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at center, black 22%, transparent 78%);
}

.session-login__beam {
  left: 56%;
  width: 1px;
  background: linear-gradient(transparent 8%, color-mix(in srgb, var(--ds-color-brand-default) 50%, transparent), transparent 92%);
  box-shadow: 0 0 32px 4px color-mix(in srgb, var(--ds-color-brand-default) 10%, transparent);
  transform: rotate(8deg) scaleY(1.3);
}

.session-login__header {
  position: relative;
  z-index: 3;
  display: flex;
  width: min(100% - 2.5rem, 76rem);
  height: 5rem;
  margin-inline: auto;
  align-items: center;
  justify-content: space-between;
}

.session-login__brand { display: flex; align-items: center; gap: 0.75rem; color: inherit; }
.session-login__brand strong { display: block; font-size: 0.85rem; letter-spacing: -0.01em; }
.session-login__brand small { display: block; margin-top: 0.2rem; color: var(--ds-color-auth-muted); font-size: 0.67rem; }

.session-login__local {
  gap: 0.45rem;
  border-color: var(--ds-color-auth-border);
  color: var(--ds-color-auth-muted);
  background: var(--ds-color-auth-surface);
  backdrop-filter: blur(14px);
}
.session-login__local > span { width: 0.38rem; height: 0.38rem; border-radius: 50%; background: var(--success); box-shadow: 0 0 12px var(--success); }

.session-login__main {
  position: relative;
  z-index: 1;
  display: grid;
  width: min(100% - 2.5rem, 76rem);
  min-height: calc(100vh - 5rem);
  margin-inline: auto;
  grid-template-columns: minmax(0, 1fr) minmax(23rem, 28rem);
  gap: clamp(3rem, 8vw, 8rem);
  align-items: center;
  padding: 2.5rem 0 5rem;
}

.session-login__intro { position: relative; max-width: 39rem; }
.session-login__eyebrow { display: flex; align-items: center; gap: 0.65rem; color: var(--ds-color-brand-active); font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; }
.session-login__eyebrow span { color: var(--ds-color-auth-muted); }
.session-login__eyebrow i { width: 2.2rem; height: 1px; background: var(--ds-color-brand-default); box-shadow: 0 0 10px var(--ds-color-brand-default); }
.session-login__intro h1 { max-width: 36rem; margin: 1.35rem 0 0; font-size: clamp(3.5rem, 7vw, 6.6rem); font-weight: 620; letter-spacing: -0.07em; line-height: 0.92; text-wrap: balance; }
.session-login__intro > p { max-width: 34rem; margin: 1.5rem 0 0; color: var(--ds-color-auth-muted); font-size: 0.9rem; line-height: 1.75; }

.session-login__orbit { position: relative; width: 12rem; height: 5rem; margin-top: 2.8rem; }
.session-login__orbit-ring { position: absolute; left: 0; top: 50%; border: 1px solid var(--ds-color-auth-border); border-radius: 50%; transform: translateY(-50%) rotate(-10deg); }
.session-login__orbit-ring--outer { width: 11rem; height: 3.8rem; }
.session-login__orbit-ring--inner { left: 1.5rem; width: 8rem; height: 2.4rem; border-color: color-mix(in srgb, var(--ds-color-brand-default) 34%, transparent); transform: translateY(-50%) rotate(8deg); }
.session-login__orbit-core { position: absolute; left: 4.1rem; top: 50%; transform: translateY(-50%); }
.session-login__orbit-node { position: absolute; width: 0.45rem; height: 0.45rem; border-radius: 50%; background: var(--ds-color-brand-active); box-shadow: 0 0 14px var(--ds-color-brand-active); }
.session-login__orbit-node--a { left: 1rem; top: 0.8rem; animation: node-pulse 2.2s ease-in-out infinite; }
.session-login__orbit-node--b { right: 0.7rem; bottom: 0.65rem; animation: node-pulse 2.2s 0.8s ease-in-out infinite; }

.session-login__trust { display: flex; flex-wrap: wrap; gap: 0.65rem 1rem; margin-top: 2rem; color: var(--ds-color-auth-muted); font-size: 0.67rem; }
.session-login__trust span { display: inline-flex; align-items: center; gap: 0.35rem; }
.session-login__trust :deep(svg) { width: 0.75rem; height: 0.75rem; color: var(--ds-color-brand-active); }
.session-login__demo { width: min(100%, 25rem); height: auto; margin-top: 1.25rem; justify-content: flex-start; padding: 0.7rem 0.85rem; border: 1px solid color-mix(in srgb, var(--ds-color-brand-default) 20%, transparent); color: var(--ds-color-auth-text); background: color-mix(in srgb, var(--ds-color-brand-default) 8%, transparent); }
.session-login__demo > span:nth-of-type(1) { display: grid; flex: 1; gap: 0.1rem; text-align: left; }
.session-login__demo strong { font-size: 0.7rem; }
.session-login__demo small { color: var(--ds-color-auth-muted); font-size: 0.58rem; font-weight: 400; }

.session-login__panel {
  position: relative;
  overflow: hidden;
  padding: 1.3rem;
  border: 1px solid var(--ds-color-auth-border);
  border-radius: 1.5rem 0.35rem 1.5rem 1.5rem;
  background: linear-gradient(145deg, color-mix(in srgb, var(--ds-color-auth-surface) 92%, transparent), color-mix(in srgb, var(--ds-color-auth-bg) 78%, transparent));
  box-shadow: 0 40px 110px rgba(0, 0, 0, 0.45), inset 0 1px rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(24px) saturate(1.2);
}
.session-login__panel-shine { position: absolute; top: -8rem; right: -8rem; width: 18rem; height: 18rem; border-radius: 50%; background: color-mix(in srgb, var(--ds-color-brand-default) 13%, transparent); filter: blur(38px); pointer-events: none; }
.session-login__panel-header { position: relative; display: grid; grid-template-columns: auto 1fr auto; gap: 0.75rem; align-items: center; padding: 0.2rem 0.1rem 1.2rem; }
.session-login__panel-icon { display: grid; width: 2.6rem; height: 2.6rem; place-items: center; border: 1px solid color-mix(in srgb, var(--ds-color-brand-default) 28%, transparent); border-radius: 0.75rem; color: var(--ds-color-brand-active); background: color-mix(in srgb, var(--ds-color-brand-default) 9%, transparent); }
.session-login__panel-icon :deep(svg) { width: 1rem; height: 1rem; }
.session-login__panel-header small, .session-login__panel-header strong { display: block; }
.session-login__panel-header small { color: var(--ds-color-auth-muted); font-family: var(--font-mono); font-size: 0.58rem; letter-spacing: 0.11em; }
.session-login__panel-header strong { margin-top: 0.25rem; font-size: 0.9rem; }
.session-login__channel { gap: 0.35rem; border-color: var(--ds-color-auth-border); color: var(--ds-color-auth-muted); font-family: var(--font-mono); font-size: 0.55rem; }
.session-login__channel i { width: 0.35rem; height: 0.35rem; border-radius: 50%; background: var(--success); }

.session-login__form { position: relative; display: grid; gap: 0.75rem; }
.session-login__label-row { display: flex; min-height: 1.3rem; align-items: center; justify-content: space-between; gap: 0.75rem; }
.session-login__label-row label { color: var(--ds-color-auth-muted); font-size: 0.68rem; }
.session-login__detected { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--ds-color-brand-active); font-size: 0.6rem; }
.session-login__detected[data-tone="error"] { color: var(--destructive); }
.session-login__detected :deep(svg) { width: 0.68rem; height: 0.68rem; }

.session-login__input-wrap { position: relative; display: flex; align-items: center; gap: 0.2rem; padding: 0.35rem; border: 1px solid var(--ds-color-auth-border); border-radius: 0.85rem; background: color-mix(in srgb, var(--ds-color-auth-bg) 68%, transparent); transition: border-color 180ms ease, box-shadow 180ms ease; }
.session-login__input-wrap:focus-within { border-color: color-mix(in srgb, var(--ds-color-brand-default) 65%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ds-color-brand-default) 10%, transparent), 0 0 30px color-mix(in srgb, var(--ds-color-brand-default) 8%, transparent); }
.session-login__input-icon { width: 0.9rem; height: 0.9rem; margin-left: 0.5rem; flex: none; color: var(--ds-color-auth-muted); }
.session-login__input { height: 2.5rem; border: 0; color: var(--ds-color-auth-text); background: transparent; box-shadow: none; font-family: var(--font-mono); font-size: 0.72rem; }
.session-login__input:focus-visible { border: 0; box-shadow: none; }
.session-login__input-action, .session-login__paste { color: var(--ds-color-auth-muted); }
.session-login__input-action:hover, .session-login__paste:hover { color: var(--ds-color-auth-text); background: color-mix(in srgb, var(--ds-color-brand-default) 10%, transparent); }
.session-login__paste { margin-right: 0.1rem; font-size: 0.65rem; }
.session-login__hint, .session-login__error { min-height: 1rem; margin: 0; font-family: var(--font-mono); font-size: 0.58rem; letter-spacing: 0.04em; }
.session-login__hint { color: var(--ds-color-auth-muted); }
.session-login__error { color: var(--destructive); }
.session-login__submit { height: 2.8rem; margin-top: 0.15rem; justify-content: flex-start; gap: 0.65rem; padding-inline: 1rem; border-radius: 0.8rem 0.2rem 0.8rem 0.8rem; box-shadow: 0 12px 34px color-mix(in srgb, var(--ds-color-brand-default) 16%, transparent); }
.session-login__submit > span { margin-left: auto; font-size: 1rem; }

.session-login__divider { display: flex; align-items: center; gap: 0.7rem; margin: 1.15rem 0; color: var(--ds-color-auth-muted); font-family: var(--font-mono); font-size: 0.54rem; letter-spacing: 0.12em; }
.session-login__divider::before, .session-login__divider::after { height: 1px; flex: 1; content: ''; background: var(--ds-color-auth-border); }
.session-login__command { display: grid; gap: 0.7rem; }
.session-login__command > div:first-child { display: grid; gap: 0.2rem; }
.session-login__command strong { font-size: 0.72rem; }
.session-login__command > div:first-child span, .session-login__command > small { color: var(--ds-color-auth-muted); font-size: 0.6rem; line-height: 1.5; }
.session-login__terminal { display: flex; min-width: 0; align-items: center; gap: 0.6rem; padding: 0.4rem 0.45rem 0.4rem 0.75rem; border: 1px solid var(--ds-color-auth-border); border-radius: 0.7rem; background: rgba(0, 0, 0, 0.24); }
.session-login__terminal > span { color: var(--ds-color-brand-active); font-family: var(--font-mono); font-size: 0.7rem; }
.session-login__terminal code { min-width: 0; flex: 1; overflow: hidden; color: var(--ds-color-auth-text); font-size: 0.68rem; text-overflow: ellipsis; white-space: nowrap; }
.session-login__terminal button { color: var(--ds-color-auth-muted); }

@keyframes node-pulse { 50% { opacity: 0.45; transform: scale(0.65); } }

@media (max-width: 880px) {
  .session-login { overflow: auto; }
  .session-login__main { grid-template-columns: 1fr; gap: 3rem; padding-top: 3rem; }
  .session-login__intro { max-width: 42rem; }
  .session-login__intro h1 { font-size: clamp(3.2rem, 12vw, 5.5rem); }
  .session-login__orbit { display: none; }
  .session-login__panel { width: min(100%, 31rem); }
}

@media (max-width: 520px) {
  .session-login__header, .session-login__main { width: min(100% - 1.5rem, 76rem); }
  .session-login__local { display: none; }
  .session-login__main { padding-top: 2rem; }
  .session-login__intro h1 { font-size: 3.3rem; }
  .session-login__trust { gap: 0.55rem; }
  .session-login__panel { padding: 1rem; border-radius: 1.2rem 0.25rem 1.2rem 1.2rem; }
  .session-login__paste span { display: none; }
  .session-login__channel { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .session-login__orbit-node { animation: none; }
}
</style>
