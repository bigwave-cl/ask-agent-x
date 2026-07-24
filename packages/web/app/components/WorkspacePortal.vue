<script setup lang="ts">
import type { Component } from 'vue'
import type { AskXLocale, AskXThemeColor } from '@askx/core'
import { ArrowUpRight, CloudCog, Command, Palette, ShieldCheck, Sparkles } from '@lucide/vue'

type PortalDestination = 'skills' | 'theme' | 'settings'

const props = defineProps<{
  locale: AskXLocale
  enabledCount: number
  revision?: number
  backupEnabled: boolean
  themeColor: AskXThemeColor
}>()

const emit = defineEmits<{
  select: [destination: PortalDestination]
}>()

const messages = {
  en: {
    eyebrow: 'LOCAL AGENT ORBIT',
    title: 'Choose where to begin.',
    description: 'Three paths, one shared workspace. Shape capabilities, tune the atmosphere, or manage the system beneath it all.',
    skillsTitle: 'Skills', skillsDescription: 'Discover, organize, and connect reusable capabilities across every local Agent.', skillsMeta: '{count} Agents in orbit',
    themeTitle: 'Themes', themeDescription: 'Tune color, contrast, and motion until the workspace feels unmistakably yours.', themeMeta: '3 visual directions',
    settingsTitle: 'Settings', settingsDescription: 'Control platforms, backups, language, and the shared configuration revision.', settingsMeta: 'Revision #{revision}',
    enter: 'Enter', connected: 'Local session connected', protected: 'Backup protection on', private: 'Private to this device',
  },
  'zh-CN': {
    eyebrow: '本地 AGENT 轨道',
    title: '选择你要进入的空间。',
    description: '三条路径，共享同一个工作台。编排能力、塑造氛围，或管理支撑一切的系统设置。',
    skillsTitle: 'Skills', skillsDescription: '发现、整理并连接可复用能力，让每个本地 Agent 共享同一套技能网络。', skillsMeta: '{count} 个 Agent 在轨',
    themeTitle: '主题', themeDescription: '调整色彩、明暗与动态，让工作台拥有真正属于你的气质。', themeMeta: '3 种视觉方向',
    settingsTitle: '设置', settingsDescription: '管理平台、备份、语言，以及 CLI 与 Web 共同使用的配置版本。', settingsMeta: '当前版本 #{revision}',
    enter: '进入', connected: '本地会话已连接', protected: '备份保护已开启', private: '仅保留在当前设备',
  },
} as const

const copy = computed(() => messages[props.locale])
const particleColor = computed(() => props.themeColor === 'rose' ? '#e7659f' : '#31bbc5')

const portals = computed<Array<{
  id: PortalDestination
  index: string
  title: string
  description: string
  meta: string
  icon: Component
}>>(() => [
  {
    id: 'skills',
    index: '01',
    title: copy.value.skillsTitle,
    description: copy.value.skillsDescription,
    meta: copy.value.skillsMeta.replace('{count}', String(props.enabledCount)),
    icon: Command,
  },
  {
    id: 'theme',
    index: '02',
    title: copy.value.themeTitle,
    description: copy.value.themeDescription,
    meta: copy.value.themeMeta,
    icon: Palette,
  },
  {
    id: 'settings',
    index: '03',
    title: copy.value.settingsTitle,
    description: copy.value.settingsDescription,
    meta: copy.value.settingsMeta.replace('{revision}', String(props.revision ?? '—')),
    icon: CloudCog,
  },
])
</script>

<template>
  <main class="portal-shell">
    <ClientOnly>
      <LazyAntigravityBackground
        :count="190"
        :color="particleColor"
        :magnet-radius="13"
        :ring-radius="9"
        :wave-amplitude="0.85"
      />
    </ClientOnly>

    <div class="portal-aurora" aria-hidden="true" />
    <div class="portal-grid" aria-hidden="true" />

    <div class="portal-content">
      <section class="portal-intro">
        <Badge variant="outline" class="portal-eyebrow">
          <Sparkles class="size-3" />
          {{ copy.eyebrow }}
        </Badge>
        <h1>{{ copy.title }}</h1>
        <p>{{ copy.description }}</p>
      </section>

      <section class="portal-list" aria-label="Workspace destinations">
        <button
          v-for="portal in portals"
          :key="portal.id"
          type="button"
          class="portal-card"
          :class="`portal-card--${portal.id}`"
          :data-testid="`portal-${portal.id}`"
          @click="emit('select', portal.id)"
        >
          <span class="portal-card__glow" aria-hidden="true" />
          <span class="portal-card__topline">
            <span class="portal-card__index">{{ portal.index }}</span>
            <span class="portal-card__icon"><component :is="portal.icon" /></span>
          </span>
          <span class="portal-card__body">
            <strong>{{ portal.title }}</strong>
            <span>{{ portal.description }}</span>
          </span>
          <span class="portal-card__footer">
            <span>{{ portal.meta }}</span>
            <span class="portal-card__action">{{ copy.enter }}<ArrowUpRight /></span>
          </span>
        </button>
      </section>

      <footer class="portal-status">
        <span><i class="portal-status__dot" />{{ copy.connected }}</span>
        <span v-if="backupEnabled"><ShieldCheck />{{ copy.protected }}</span>
        <span>{{ copy.private }}</span>
      </footer>
    </div>
  </main>
</template>

<style scoped>
.portal-shell {
  position: relative;
  min-height: calc(100vh - 4rem);
  overflow: hidden;
  isolation: isolate;
  background:
    radial-gradient(circle at 20% 5%, color-mix(in srgb, var(--ds-color-brand-default) 14%, transparent), transparent 34rem),
    linear-gradient(145deg, var(--background) 15%, color-mix(in srgb, var(--ds-color-bg-surface-raised) 76%, var(--background)) 100%);
}

.portal-aurora {
  position: absolute;
  inset: -20%;
  z-index: -1;
  opacity: 0.72;
  background:
    radial-gradient(ellipse at 23% 38%, rgba(100, 224, 231, 0.22), transparent 27%),
    radial-gradient(ellipse at 73% 25%, rgba(255, 194, 116, 0.14), transparent 23%),
    radial-gradient(ellipse at 72% 83%, rgba(242, 103, 162, 0.1), transparent 22%);
  filter: blur(28px);
  animation: portal-drift 16s ease-in-out infinite alternate;
}

.portal-grid {
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.22;
  background-image: radial-gradient(circle, color-mix(in srgb, var(--foreground) 28%, transparent) 0.7px, transparent 0.8px);
  background-size: 22px 22px;
  mask-image: linear-gradient(to bottom, transparent, black 22%, black 74%, transparent);
}

.portal-content {
  position: relative;
  z-index: 1;
  width: min(100% - 2rem, 80rem);
  min-height: calc(100vh - 4rem);
  margin-inline: auto;
  padding: clamp(3rem, 7vh, 5.5rem) 0 1.75rem;
}

.portal-intro {
  max-width: 58rem;
  margin-inline: auto;
  text-align: center;
}

.portal-eyebrow {
  height: 1.75rem;
  gap: 0.4rem;
  border-color: color-mix(in srgb, var(--ds-color-brand-default) 30%, transparent);
  background: color-mix(in srgb, var(--card) 72%, transparent);
  color: var(--ds-color-text-brand);
  box-shadow: 0 10px 40px rgba(47, 189, 199, 0.08);
  backdrop-filter: blur(14px);
}

.portal-intro h1 {
  margin: 1.5rem 0 0;
  font-size: clamp(2.65rem, 6.5vw, 5.7rem);
  font-weight: 620;
  letter-spacing: -0.065em;
  line-height: 0.98;
  text-wrap: balance;
}

.portal-intro p {
  max-width: 40rem;
  margin: 1.35rem auto 0;
  color: var(--muted-foreground);
  font-size: clamp(0.9rem, 1.5vw, 1.05rem);
  line-height: 1.75;
  text-wrap: pretty;
}

.portal-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(0.9rem, 2vw, 1.35rem);
  margin-top: clamp(2.5rem, 5vh, 3.6rem);
  perspective: 1200px;
}

.portal-card {
  --portal-accent: var(--ds-color-brand-default);
  position: relative;
  display: flex;
  min-height: 18rem;
  overflow: hidden;
  flex-direction: column;
  padding: 1.35rem;
  color: var(--foreground);
  text-align: left;
  border: 1px solid color-mix(in srgb, var(--portal-accent) 22%, var(--border));
  border-radius: 1.55rem;
  background: linear-gradient(145deg, color-mix(in srgb, var(--card) 86%, transparent), color-mix(in srgb, var(--card) 64%, transparent));
  box-shadow: 0 22px 70px rgba(18, 47, 51, 0.08), inset 0 1px rgba(255, 255, 255, 0.76);
  backdrop-filter: blur(18px) saturate(1.15);
  transform: translateZ(0) rotate(-0.7deg);
  transition: transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 260ms ease, box-shadow 260ms ease;
}

.portal-card--theme {
  --portal-accent: #efab63;
  transform: translateY(0.75rem) rotate(0.8deg);
}

.portal-card--settings {
  --portal-accent: #e2679e;
  transform: rotate(-0.2deg);
}

.portal-card:hover,
.portal-card:focus-visible {
  z-index: 2;
  border-color: color-mix(in srgb, var(--portal-accent) 52%, var(--border));
  box-shadow: 0 32px 90px color-mix(in srgb, var(--portal-accent) 15%, transparent), inset 0 1px rgba(255, 255, 255, 0.8);
  transform: translateY(-0.65rem) rotate(0deg) scale(1.012);
  outline: none;
}

.portal-card__glow {
  position: absolute;
  top: -6rem;
  right: -5rem;
  width: 13rem;
  height: 13rem;
  border-radius: 999px;
  opacity: 0.2;
  background: var(--portal-accent);
  filter: blur(26px);
  transition: opacity 260ms ease, transform 400ms ease;
}

.portal-card:hover .portal-card__glow {
  opacity: 0.34;
  transform: translate(-1.5rem, 1.5rem) scale(1.15);
}

.portal-card__topline,
.portal-card__footer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.portal-card__index {
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.13em;
}

.portal-card__icon {
  display: grid;
  width: 2.8rem;
  height: 2.8rem;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--portal-accent) 27%, transparent);
  border-radius: 0.9rem;
  color: color-mix(in srgb, var(--portal-accent) 82%, var(--foreground));
  background: color-mix(in srgb, var(--portal-accent) 10%, var(--card));
  transform: rotate(4deg);
  transition: transform 260ms ease;
}

.portal-card:hover .portal-card__icon {
  transform: rotate(-4deg) scale(1.08);
}

.portal-card__icon :deep(svg) {
  width: 1.15rem;
  height: 1.15rem;
}

.portal-card__body {
  position: relative;
  display: grid;
  gap: 0.8rem;
  margin-top: auto;
  padding-block: 2.5rem 1.8rem;
}

.portal-card__body strong {
  font-size: clamp(1.65rem, 2.4vw, 2.2rem);
  font-weight: 620;
  letter-spacing: -0.045em;
}

.portal-card__body > span {
  max-width: 19rem;
  color: var(--muted-foreground);
  font-size: 0.82rem;
  line-height: 1.65;
}

.portal-card__footer {
  padding-top: 1rem;
  border-top: 1px solid color-mix(in srgb, var(--foreground) 8%, transparent);
  color: var(--muted-foreground);
  font-size: 0.7rem;
}

.portal-card__action {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--foreground);
  font-weight: 560;
}

.portal-card__action :deep(svg) {
  width: 0.85rem;
  height: 0.85rem;
  transition: transform 180ms ease;
}

.portal-card:hover .portal-card__action :deep(svg) {
  transform: translate(2px, -2px);
}

.portal-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem 1.5rem;
  margin-top: 2.2rem;
  color: var(--muted-foreground);
  font-size: 0.68rem;
}

.portal-status span {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.portal-status :deep(svg) {
  width: 0.8rem;
  height: 0.8rem;
  color: var(--success);
}

.portal-status__dot {
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 999px;
  background: var(--success);
  box-shadow: 0 0 0 4px var(--success-soft);
}

@keyframes portal-drift {
  from { transform: translate3d(-2%, -1%, 0) rotate(-2deg); }
  to { transform: translate3d(3%, 2%, 0) rotate(2deg); }
}

@media (max-width: 800px) {
  .portal-content { padding-top: 3.5rem; }
  .portal-list { grid-template-columns: 1fr; margin-top: 2.7rem; }
  .portal-card,
  .portal-card--theme,
  .portal-card--settings { min-height: 15rem; transform: none; }
  .portal-card__body { padding-block: 2.6rem 1.8rem; }
}

@media (prefers-reduced-motion: reduce) {
  .portal-aurora { animation: none; }
  .portal-card,
  .portal-card__glow,
  .portal-card__icon,
  .portal-card__action :deep(svg) { transition: none; }
}
</style>
