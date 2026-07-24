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
    class="brand-mark"
    :data-appearance="props.appearance"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="baseGradientId" x1="4" y1="43" x2="42" y2="5" gradientUnits="userSpaceOnUse">
        <stop class="brand-mark__gradient-stop brand-mark__gradient-stop--start" offset="0" />
        <stop class="brand-mark__gradient-stop brand-mark__gradient-stop--middle" offset="0.52" />
        <stop class="brand-mark__gradient-stop brand-mark__gradient-stop--end" offset="1" />
      </linearGradient>
      <linearGradient :id="ribbonGradientId" x1="29" y1="25" x2="45" y2="7" gradientUnits="userSpaceOnUse">
        <stop class="brand-mark__ribbon-stop brand-mark__ribbon-stop--start" offset="0" />
        <stop class="brand-mark__ribbon-stop brand-mark__ribbon-stop--end" offset="1" />
      </linearGradient>
      <linearGradient :id="pathGradientId" x1="12" y1="14" x2="36" y2="38" gradientUnits="userSpaceOnUse">
        <stop class="brand-mark__path-stop brand-mark__path-stop--start" offset="0" />
        <stop class="brand-mark__path-stop brand-mark__path-stop--end" offset="1" />
      </linearGradient>
    </defs>
    <g class="brand-mark__art" transform="rotate(-6 24 24)">
      <rect class="brand-mark__frame" x="3.5" y="6" width="38" height="37.5" rx="2.5" :fill="`url(#${baseGradientId})`" />
      <path class="brand-mark__edge" d="M6.2 8.5H38.8V40.8" />
      <path class="brand-mark__shine" d="M7 9.3H28.5C34.2 9.3 38.1 13 38.8 18.2" />

      <path
        class="brand-mark__ribbon brand-mark__ribbon--back"
        :fill="`url(#${ribbonGradientId})`"
        d="M28.5 18.5C34 16.5 35.8 10.1 44.2 6.1C41.8 11.7 40.8 17.6 33.2 22.2L28.5 18.5Z"
      />
      <path
        class="brand-mark__ribbon brand-mark__ribbon--front"
        d="M30.4 21.2C36.2 20.5 40.2 17.8 45.3 13.5C42.5 20.2 38.7 24 31.5 25.3L30.4 21.2Z"
      />

      <path
        class="brand-mark__x"
        :stroke="`url(#${pathGradientId})`"
        d="M12.3 15C17.8 15.7 19.3 20.2 22.9 24.2C26.5 28.3 29.6 34.6 35.7 35.8"
      />
      <path
        class="brand-mark__x"
        :stroke="`url(#${pathGradientId})`"
        d="M34.8 13.8C29.2 15 27.1 19.5 23.5 24.4C20.1 29 17.5 34.4 11.4 37"
      />
      <path class="brand-mark__spark" d="M31.8 11.9L33 9.4L34.2 11.9L36.7 13.1L34.2 14.3L33 16.8L31.8 14.3L29.3 13.1L31.8 11.9Z" />
    </g>
  </svg>
</template>

<style scoped>
.brand-mark {
  --brand-mark-base-start: #182433;
  --brand-mark-base-middle: #475569;
  --brand-mark-base-end: #94a3b8;
  --brand-mark-border: #bae6fd;
  --brand-mark-highlight: #ecfeff;
  --brand-mark-ink-start: #f8fafc;
  --brand-mark-ink-end: #bae6fd;
  --brand-mark-ribbon-start: #22d3ee;
  --brand-mark-ribbon-end: #ecfeff;
  --brand-mark-ribbon-front: #ecfeff;
  --brand-mark-spark: #ecfeff;
  --brand-mark-glow: color-mix(in srgb, #22d3ee 24%, transparent);
  --brand-mark-ink-shadow: color-mix(in srgb, #22d3ee 42%, transparent);
  display: block;
  overflow: visible;
  filter: drop-shadow(0 5px 8px var(--brand-mark-glow));
}

:global(html.dark) .brand-mark[data-appearance='auto'],
.brand-mark[data-appearance='dark'] {
  --brand-mark-base-start: #cbd5e1;
  --brand-mark-base-middle: #e2e8f0;
  --brand-mark-base-end: #f8fafc;
  --brand-mark-border: #f8fafc;
  --brand-mark-highlight: #f8fafc;
  --brand-mark-ink-start: #1e293b;
  --brand-mark-ink-end: #334155;
  --brand-mark-ribbon-start: #38bdf8;
  --brand-mark-ribbon-end: #f8fafc;
  --brand-mark-ribbon-front: #f8fafc;
  --brand-mark-spark: #f8fafc;
  --brand-mark-glow: color-mix(in srgb, #38bdf8 34%, transparent);
  --brand-mark-ink-shadow: color-mix(in srgb, #38bdf8 24%, transparent);
}

.brand-mark__art {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 180ms ease;
}

.brand-mark:hover .brand-mark__art {
  transform: rotate(-3deg) translateY(-1px);
}

.brand-mark__frame {
  stroke: var(--brand-mark-border);
  stroke-width: 0.8;
}

.brand-mark__gradient-stop--start { stop-color: var(--brand-mark-base-start); }
.brand-mark__gradient-stop--middle { stop-color: var(--brand-mark-base-middle); }
.brand-mark__gradient-stop--end { stop-color: var(--brand-mark-base-end); }
.brand-mark__path-stop--start { stop-color: var(--brand-mark-ink-start); }
.brand-mark__path-stop--end { stop-color: var(--brand-mark-ink-end); }

.brand-mark__edge {
  fill: none;
  opacity: 0.3;
  stroke: var(--brand-mark-highlight);
  stroke-linecap: square;
  stroke-width: 0.8;
}

.brand-mark__shine {
  fill: none;
  opacity: 0.36;
  stroke: var(--brand-mark-highlight);
  stroke-linecap: round;
  stroke-width: 0.9;
}

.brand-mark__x {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3.25;
  filter: drop-shadow(0 1px 1px var(--brand-mark-ink-shadow));
}

.brand-mark__ribbon {
  stroke: color-mix(in srgb, var(--brand-mark-highlight) 55%, transparent);
  stroke-linejoin: round;
  stroke-width: 0.7;
  transform-box: fill-box;
  transform-origin: left center;
  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.brand-mark__ribbon--back {
  opacity: 0.9;
}

.brand-mark__ribbon--front {
  fill: var(--brand-mark-ribbon-front);
}

.brand-mark__ribbon-stop--start { stop-color: var(--brand-mark-ribbon-start); }
.brand-mark__ribbon-stop--end { stop-color: var(--brand-mark-ribbon-end); }

.brand-mark:hover .brand-mark__ribbon--back {
  transform: rotate(-4deg) translate(1px, -1px);
}

.brand-mark:hover .brand-mark__ribbon--front {
  transform: rotate(-2deg) translate(1px, -0.5px);
}

.brand-mark__spark {
  fill: var(--brand-mark-spark);
  opacity: 0.96;
}

@media (prefers-reduced-motion: reduce) {
  .brand-mark__art,
  .brand-mark__ribbon {
    transition: none;
  }
}
</style>
