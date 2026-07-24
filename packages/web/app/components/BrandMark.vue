<script setup lang="ts">
import { useId } from 'vue'

const props = withDefaults(defineProps<{
  appearance?: 'auto' | 'light' | 'dark'
}>(), {
  appearance: 'auto',
})

const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const baseGradientId = `askx-brand-base-${instanceId}`
const pathGradientId = `askx-brand-path-${instanceId}`
const ribbonGradientId = `askx-brand-ribbon-${instanceId}`
</script>

<template>
  <svg
    class="group block overflow-visible [--brand-mark-base-end:#94a3b8] [--brand-mark-base-middle:#475569] [--brand-mark-base-start:#182433] [--brand-mark-border:#bae6fd] [--brand-mark-glow:color-mix(in_srgb,#22d3ee_24%,transparent)] [--brand-mark-highlight:#ecfeff] [--brand-mark-ink-end:#bae6fd] [--brand-mark-ink-shadow:color-mix(in_srgb,#22d3ee_42%,transparent)] [--brand-mark-ink-start:#f8fafc] [--brand-mark-ribbon-end:#ecfeff] [--brand-mark-ribbon-front:#ecfeff] [--brand-mark-ribbon-start:#22d3ee] [--brand-mark-spark:#ecfeff] drop-shadow-[0_5px_8px_var(--brand-mark-glow)] data-[appearance=dark]:[--brand-mark-base-end:#f8fafc] data-[appearance=dark]:[--brand-mark-base-middle:#e2e8f0] data-[appearance=dark]:[--brand-mark-base-start:#cbd5e1] data-[appearance=dark]:[--brand-mark-border:#f8fafc] data-[appearance=dark]:[--brand-mark-glow:color-mix(in_srgb,#38bdf8_34%,transparent)] data-[appearance=dark]:[--brand-mark-highlight:#f8fafc] data-[appearance=dark]:[--brand-mark-ink-end:#334155] data-[appearance=dark]:[--brand-mark-ink-shadow:color-mix(in_srgb,#38bdf8_24%,transparent)] data-[appearance=dark]:[--brand-mark-ink-start:#1e293b] data-[appearance=dark]:[--brand-mark-ribbon-end:#f8fafc] data-[appearance=dark]:[--brand-mark-ribbon-front:#f8fafc] data-[appearance=dark]:[--brand-mark-ribbon-start:#38bdf8] data-[appearance=dark]:[--brand-mark-spark:#f8fafc] dark:data-[appearance=auto]:[--brand-mark-base-end:#f8fafc] dark:data-[appearance=auto]:[--brand-mark-base-middle:#e2e8f0] dark:data-[appearance=auto]:[--brand-mark-base-start:#cbd5e1] dark:data-[appearance=auto]:[--brand-mark-border:#f8fafc] dark:data-[appearance=auto]:[--brand-mark-glow:color-mix(in_srgb,#38bdf8_34%,transparent)] dark:data-[appearance=auto]:[--brand-mark-highlight:#f8fafc] dark:data-[appearance=auto]:[--brand-mark-ink-end:#334155] dark:data-[appearance=auto]:[--brand-mark-ink-shadow:color-mix(in_srgb,#38bdf8_24%,transparent)] dark:data-[appearance=auto]:[--brand-mark-ink-start:#1e293b] dark:data-[appearance=auto]:[--brand-mark-ribbon-end:#f8fafc] dark:data-[appearance=auto]:[--brand-mark-ribbon-front:#f8fafc] dark:data-[appearance=auto]:[--brand-mark-ribbon-start:#38bdf8] dark:data-[appearance=auto]:[--brand-mark-spark:#f8fafc]"
    :data-appearance="props.appearance"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="baseGradientId" x1="4" y1="43" x2="42" y2="5" gradientUnits="userSpaceOnUse">
        <stop class="[stop-color:var(--brand-mark-base-start)]" offset="0" />
        <stop class="[stop-color:var(--brand-mark-base-middle)]" offset="0.52" />
        <stop class="[stop-color:var(--brand-mark-base-end)]" offset="1" />
      </linearGradient>
      <linearGradient :id="ribbonGradientId" x1="29" y1="25" x2="45" y2="7" gradientUnits="userSpaceOnUse">
        <stop class="[stop-color:var(--brand-mark-ribbon-start)]" offset="0" />
        <stop class="[stop-color:var(--brand-mark-ribbon-end)]" offset="1" />
      </linearGradient>
      <linearGradient :id="pathGradientId" x1="12" y1="14" x2="36" y2="38" gradientUnits="userSpaceOnUse">
        <stop class="[stop-color:var(--brand-mark-ink-start)]" offset="0" />
        <stop class="[stop-color:var(--brand-mark-ink-end)]" offset="1" />
      </linearGradient>
    </defs>
    <g class="origin-center transition-transform duration-180 [transform-box:fill-box] group-hover:[transform:rotate(-3deg)_translateY(-1px)] motion-reduce:transition-none" transform="rotate(-6 24 24)">
      <rect class="[stroke-width:0.8] [stroke:var(--brand-mark-border)]" x="3.5" y="6" width="38" height="37.5" rx="2.5" :fill="`url(#${baseGradientId})`" />
      <path class="fill-none opacity-30 [stroke-linecap:square] [stroke-width:0.8] [stroke:var(--brand-mark-highlight)]" d="M6.2 8.5H38.8V40.8" />
      <path class="fill-none opacity-36 [stroke-linecap:round] [stroke-width:0.9] [stroke:var(--brand-mark-highlight)]" d="M7 9.3H28.5C34.2 9.3 38.1 13 38.8 18.2" />

      <path
        class="origin-left opacity-90 transition-transform duration-220 ease-[cubic-bezier(0.2,0.8,0.2,1)] [stroke-linejoin:round] [stroke-width:0.7] [stroke:color-mix(in_srgb,var(--brand-mark-highlight)_55%,transparent)] [transform-box:fill-box] group-hover:[transform:rotate(-4deg)_translate(1px,-1px)] motion-reduce:transition-none"
        :fill="`url(#${ribbonGradientId})`"
        d="M28.5 18.5C34 16.5 35.8 10.1 44.2 6.1C41.8 11.7 40.8 17.6 33.2 22.2L28.5 18.5Z"
      />
      <path
        class="origin-left fill-[var(--brand-mark-ribbon-front)] transition-transform duration-220 ease-[cubic-bezier(0.2,0.8,0.2,1)] [stroke-linejoin:round] [stroke-width:0.7] [stroke:color-mix(in_srgb,var(--brand-mark-highlight)_55%,transparent)] [transform-box:fill-box] group-hover:[transform:rotate(-2deg)_translate(1px,-0.5px)] motion-reduce:transition-none"
        d="M30.4 21.2C36.2 20.5 40.2 17.8 45.3 13.5C42.5 20.2 38.7 24 31.5 25.3L30.4 21.2Z"
      />

      <path
        class="fill-none drop-shadow-[0_1px_1px_var(--brand-mark-ink-shadow)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:3.25]"
        :stroke="`url(#${pathGradientId})`"
        d="M12.3 15C17.8 15.7 19.3 20.2 22.9 24.2C26.5 28.3 29.6 34.6 35.7 35.8"
      />
      <path
        class="fill-none drop-shadow-[0_1px_1px_var(--brand-mark-ink-shadow)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:3.25]"
        :stroke="`url(#${pathGradientId})`"
        d="M34.8 13.8C29.2 15 27.1 19.5 23.5 24.4C20.1 29 17.5 34.4 11.4 37"
      />
      <path class="fill-[var(--brand-mark-spark)] opacity-96" d="M31.8 11.9L33 9.4L34.2 11.9L36.7 13.1L34.2 14.3L33 16.8L31.8 14.3L29.3 13.1L31.8 11.9Z" />
    </g>
  </svg>
</template>
