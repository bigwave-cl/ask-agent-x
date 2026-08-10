<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

/** 局部 Loading 属性。 */
interface Props {
  /** 图标尺寸。 */
  size?: string
  /** 提示文字。 */
  text?: string
  /** 激活色。 */
  color?: string
  /** 轨道色。 */
  trackColor?: string
  /** 容器样式。 */
  class?: HTMLAttributes['class']
  /** 提示文字样式。 */
  textClass?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), { size: '1em', text: undefined, color: 'var(--ds-color-brand-default)', trackColor: 'var(--ds-color-border-subtle-10)', class: undefined, textClass: undefined })
const slots = useSlots()
</script>

<template>
  <div :class="cn('inline-flex flex-col items-center justify-center gap-1.5', props.class)" role="status" aria-live="polite">
    <svg :style="{ width: size, height: size }" class="askx-loader shrink-0 overflow-visible" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect class="askx-loader__block askx-loader__block--horizontal" x="19" y="19" width="10" height="10" rx="2.5" :fill="color" :stroke="trackColor" stroke-width="0.8" />
      <rect class="askx-loader__block askx-loader__block--vertical" x="19" y="19" width="10" height="10" rx="2.5" fill="var(--chart-4)" :stroke="trackColor" stroke-width="0.8" />
      <rect class="askx-loader__block askx-loader__block--diagonal" x="19" y="19" width="10" height="10" rx="2.5" fill="var(--ds-color-warning-default)" :stroke="trackColor" stroke-width="0.8" />
    </svg>
    <span v-if="text || slots.default" :class="cn('max-w-full truncate text-center text-sm text-muted-foreground', textClass)"><slot>{{ text }}</slot></span>
  </div>
</template>

<style scoped>
.askx-loader__block { transform-box: fill-box; transform-origin: center; animation-duration: 1.35s; animation-timing-function: cubic-bezier(.65, 0, .35, 1); animation-iteration-count: infinite; }
.askx-loader__block--horizontal { animation-name: askx-loader-horizontal; }
.askx-loader__block--vertical { animation-name: askx-loader-vertical; animation-delay: -0.45s; }
.askx-loader__block--diagonal { animation-name: askx-loader-diagonal; animation-delay: -0.9s; }
@keyframes askx-loader-horizontal { 0%, 100% { transform: translateX(-140%); } 50% { transform: translateX(140%); } }
@keyframes askx-loader-vertical { 0%, 100% { transform: translateY(-140%); } 50% { transform: translateY(140%); } }
@keyframes askx-loader-diagonal { 0%, 100% { transform: translate(-100%, -100%); } 50% { transform: translate(100%, 100%); } }
@media (prefers-reduced-motion: reduce) {
  .askx-loader__block { animation: none; }
  .askx-loader__block--horizontal { transform: translateX(-115%); }
  .askx-loader__block--diagonal { transform: translateX(115%); }
}
</style>
