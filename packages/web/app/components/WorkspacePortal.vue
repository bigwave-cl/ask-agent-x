<script setup lang="ts">
import type { AskXThemeColor } from '@askx/core'
import type { AskxIconName } from '@/lib/iconCatalog'

type PortalDestination = 'skills' | 'theme' | 'settings'

const props = defineProps<{
  enabledCount: number
  revision?: number
  backupEnabled: boolean
  themeColor: AskXThemeColor
}>()

const emit = defineEmits<{
  select: [destination: PortalDestination]
}>()

const { t } = useI18n()
const copy = useMessageSection('portal')
const particleColor = computed(() => props.themeColor === 'rose' ? '#e7659f' : '#31bbc5')

const portalCardTone: Record<PortalDestination, string> = {
  skills: '[--portal-accent:var(--ds-color-brand-default)] min-[801px]:rotate-[-0.7deg]',
  theme: '[--portal-accent:var(--chart-3)] min-[801px]:translate-y-3 min-[801px]:rotate-[0.8deg]',
  settings: '[--portal-accent:var(--chart-4)] min-[801px]:rotate-[-0.2deg]',
}

const portals = computed<Array<{
  id: PortalDestination
  index: string
  title: string
  description: string
  meta: string
  icon: AskxIconName
}>>(() => [
  {
    id: 'skills',
    index: '01',
    title: copy.value.skillsTitle,
    description: copy.value.skillsDescription,
    meta: t('portal.skillsMeta', { count: props.enabledCount }),
    icon: 'askx-objects:agent',
  },
  {
    id: 'theme',
    index: '02',
    title: copy.value.themeTitle,
    description: copy.value.themeDescription,
    meta: copy.value.themeMeta,
    icon: 'askx-objects:palette',
  },
  {
    id: 'settings',
    index: '03',
    title: copy.value.settingsTitle,
    description: copy.value.settingsDescription,
    meta: t('portal.settingsMeta', { revision: props.revision ?? '—' }),
    icon: 'askx-actions:settings',
  },
])
</script>

<template>
  <main class="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden [background:radial-gradient(circle_at_20%_5%,color-mix(in_srgb,var(--ds-color-brand-default)_14%,transparent),transparent_34rem),linear-gradient(145deg,var(--background)_15%,color-mix(in_srgb,var(--ds-color-bg-surface-raised)_76%,var(--background))_100%)]">
    <ClientOnly>
      <LazyAntigravityBackground
        :count="190"
        :color="particleColor"
        :magnet-radius="13"
        :ring-radius="9"
        :wave-amplitude="0.85"
      />
    </ClientOnly>

    <div class="pointer-events-none absolute -inset-[20%] -z-1 animate-portal-drift opacity-70 blur-[28px] motion-reduce:animate-none [background:radial-gradient(ellipse_at_23%_38%,rgb(100_224_231_/_22%),transparent_27%),radial-gradient(ellipse_at_73%_25%,rgb(255_194_116_/_14%),transparent_23%),radial-gradient(ellipse_at_72%_83%,rgb(242_103_162_/_10%),transparent_22%)]" aria-hidden="true" />
    <div class="pointer-events-none absolute inset-0 -z-1 opacity-20 [background-image:radial-gradient(circle,color-mix(in_srgb,var(--foreground)_28%,transparent)_0.7px,transparent_0.8px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,transparent,black_22%,black_74%,transparent)]" aria-hidden="true" />

    <div class="relative z-1 mx-auto min-h-[calc(100vh-4rem)] w-[min(100%-2rem,80rem)] pb-7 pt-14 min-[801px]:pt-[clamp(3rem,7vh,5.5rem)]">
      <section class="mx-auto max-w-[58rem] text-center">
        <Badge variant="outline" class="h-7 gap-1.5 border-primary/30 bg-card/70 text-ds-text-brand shadow-[0_10px_40px_rgb(47_189_199_/_8%)] backdrop-blur-[14px]">
          <Icon name="askx-status:star" class="size-3" />
          {{ copy.eyebrow }}
        </Badge>
        <h1 class="mt-6 text-balance text-[clamp(2.65rem,6.5vw,5.7rem)] font-semibold leading-[0.98] tracking-[-0.065em]">{{ copy.title }}</h1>
        <p class="mx-auto mt-5 max-w-2xl text-pretty text-[clamp(0.9rem,1.5vw,1.05rem)] leading-7 text-muted-foreground">{{ copy.description }}</p>
      </section>

      <section class="mt-[clamp(2.5rem,5vh,3.6rem)] grid gap-[clamp(0.9rem,2vw,1.35rem)] min-[801px]:grid-cols-3 min-[801px]:[perspective:1200px]" :aria-label="copy.destinations">
        <button
          v-for="portal in portals"
          :key="portal.id"
          type="button"
          class="group relative flex min-h-60 flex-col overflow-hidden rounded-[1.55rem] border border-[color-mix(in_srgb,var(--portal-accent)_22%,var(--border))] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--card)_86%,transparent),color-mix(in_srgb,var(--card)_64%,transparent))] p-[1.35rem] text-left text-foreground shadow-[0_22px_70px_rgb(18_47_51_/_8%),inset_0_1px_rgb(255_255_255_/_76%)] outline-none transition-[transform,border-color,box-shadow] duration-[260ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] [backdrop-filter:blur(18px)_saturate(1.15)] hover:z-2 hover:border-[color-mix(in_srgb,var(--portal-accent)_52%,var(--border))] hover:shadow-[0_32px_90px_color-mix(in_srgb,var(--portal-accent)_15%,transparent),inset_0_1px_rgb(255_255_255_/_80%)] hover:[transform:translateY(-0.65rem)_rotate(0)_scale(1.012)] focus-visible:z-2 focus-visible:border-[color-mix(in_srgb,var(--portal-accent)_52%,var(--border))] focus-visible:shadow-[0_32px_90px_color-mix(in_srgb,var(--portal-accent)_15%,transparent),inset_0_1px_rgb(255_255_255_/_80%)] focus-visible:[transform:translateY(-0.65rem)_rotate(0)_scale(1.012)] motion-reduce:transition-none min-[801px]:min-h-72"
          :class="portalCardTone[portal.id]"
          :data-testid="`portal-${portal.id}`"
          @click="emit('select', portal.id)"
        >
          <span class="absolute -right-20 -top-24 size-52 rounded-full bg-portal-accent opacity-20 blur-[26px] transition-[opacity,transform] duration-[400ms] group-hover:translate-x-[-1.5rem] group-hover:translate-y-6 group-hover:scale-115 group-hover:opacity-35 motion-reduce:transition-none" aria-hidden="true" />
          <span class="relative flex items-center justify-between gap-4">
            <span class="font-mono text-[0.68rem] tracking-[0.13em] text-muted-foreground">{{ portal.index }}</span>
            <span class="grid size-[2.8rem] rotate-4 place-items-center rounded-[0.9rem] border border-[color-mix(in_srgb,var(--portal-accent)_27%,transparent)] bg-[color-mix(in_srgb,var(--portal-accent)_10%,var(--card))] text-[color-mix(in_srgb,var(--portal-accent)_82%,var(--foreground))] transition-transform duration-[260ms] group-hover:rotate-[-4deg] group-hover:scale-108 motion-reduce:transition-none"><Icon :name="portal.icon" class="size-[1.15rem]" /></span>
          </span>
          <span class="relative mt-auto grid gap-3 py-[2.5rem_1.8rem]">
            <strong class="text-[clamp(1.65rem,2.4vw,2.2rem)] font-semibold tracking-[-0.045em]">{{ portal.title }}</strong>
            <span class="max-w-xs text-[0.82rem] leading-[1.65] text-muted-foreground">{{ portal.description }}</span>
          </span>
          <span class="relative flex items-center justify-between gap-4 border-t border-foreground/8 pt-4 text-[0.7rem] text-muted-foreground">
            <span>{{ portal.meta }}</span>
            <span class="inline-flex items-center gap-1.5 font-medium text-foreground">{{ copy.enter }}<Icon name="askx-actions:external-link" class="size-3.5 transition-transform duration-180 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" /></span>
          </span>
        </button>
      </section>

      <footer class="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[0.68rem] text-muted-foreground">
        <span class="inline-flex items-center gap-1.5"><i class="size-1.5 rounded-full bg-success shadow-[0_0_0_4px_var(--success-soft)]" />{{ copy.connected }}</span>
        <span v-if="backupEnabled" class="inline-flex items-center gap-1.5"><Icon name="askx-status:lock" class="size-3 text-success" />{{ copy.protected }}</span>
        <span class="inline-flex items-center gap-1.5">{{ copy.private }}</span>
      </footer>
    </div>
  </main>
</template>
