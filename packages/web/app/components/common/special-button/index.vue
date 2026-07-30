<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { SpecialButtonProps } from './types'
import { resolveSpecialButtonLabels, shouldRenderSpecialButtonIcon } from './types'

defineOptions({ name: 'SpecialButton' })

/** 特殊主题按钮属性。 */
const props = withDefaults(defineProps<SpecialButtonProps>(), {
  label: '',
  activeLabel: undefined,
  icon: 'askx-navigation:arrow-right',
  size: 'default',
  tone: 'theme',
  color: undefined,
  type: 'button',
  disabled: false,
})
/** 当前组件插槽。 */
const slots = useSlots()
/** 是否使用自定义默认内容。 */
const hasCustomContent = computed(() => Boolean(slots.default))
/** 动画文案字符。 */
const labels = computed(() => resolveSpecialButtonLabels(props.label, props.activeLabel))
/** 是否显示图标区域。 */
const hasIcon = computed(() => shouldRenderSpecialButtonIcon(Boolean(slots.icon), props.icon))
/** 自定义颜色生成的按钮调色变量。 */
const customColorStyle = computed(() => props.color
  ? {
      '--special-highlight': `color-mix(in srgb, ${props.color} 24%, white)`,
      '--special-light': `color-mix(in srgb, ${props.color} 48%, white)`,
      '--special-mid': props.color,
      '--special-deep': `color-mix(in srgb, ${props.color} 68%, black)`,
      '--special-shadow': `color-mix(in srgb, ${props.color} 44%, black)`,
    } as CSSProperties
  : undefined)

/**
 * 生成逐字动画延迟变量。
 *
 * @param index 字符索引。
 * @returns 字符动画使用的 CSS 变量。
 */
function getCharacterStyle(index: number) {
  return { '--special-char-index': index } as CSSProperties
}
</script>

<template>
  <button
    data-slot="special-button"
    :data-size="props.size"
    :data-tone="props.tone"
    :type="props.type"
    :disabled="props.disabled"
    :style="customColorStyle"
    class="special-button group/special-button relative isolate h-20 w-[220px] max-w-full cursor-pointer border-0 bg-transparent p-0 text-[1.15rem] font-semibold tracking-[-0.035em] outline-none select-none disabled:pointer-events-none disabled:opacity-50"
  >
    <span class="special-button__shadow absolute inset-0 rounded-[1.125rem]" aria-hidden="true" />

    <svg class="special-button__splash pointer-events-none absolute left-1/2 top-1/2 z-3 h-[208px] w-[342px] -translate-x-1/2 -translate-y-1/2 overflow-visible" viewBox="0 0 342 208" fill="none" aria-hidden="true">
      <path pathLength="60" d="M54.1 99.8S40.1 90.8 26.7 97.6 1.5 97.6 1.5 97.6M285.3 99.8s14-9 27.4-2.1 27.4-2.1 27.4-2.1" />
      <path pathLength="60" opacity=".35" d="M281.1 65s6.8-15.2 21.8-16.8c15-1.5 16.8-11.7 16.8-11.7M281.1 139s6.8 15.2 21.8 16.7c15 1.6 16.8 11.8 16.8 11.8" />
      <path pathLength="60" d="M230.6 57.4s-4.8-15.9 5.5-26.9c10.2-11 8.6-17.5 8.6-17.5M230.6 150.5s-4.8 16 5.5 27c10.2 11 8.6 17.5 8.6 17.5" />
      <path pathLength="60" opacity=".35" d="M170.4 57s3.5-14.9-.8-27.5 0-27.4 0-27.4M170.4 151s3.5 14.8-.8 27.4 0 27.5 0 27.5" />
      <path pathLength="60" d="M112.6 57.4s4.8-15.9-5.5-26.9C96.9 19.5 98.5 13 98.5 13M112.6 150.5s4.8 16-5.5 27c-10.2 11-8.6 17.5-8.6 17.5" />
      <path pathLength="60" opacity=".35" d="M62.3 65s-6.8-15.2-21.8-16.8C25.5 46.7 23.7 36.5 23.7 36.5M62.3 146s-6.8 15.2-21.8 16.7c-15 1.6-16.8 11.8-16.8 11.8" />
    </svg>

    <span class="special-button__frame absolute inset-0 z-1 overflow-hidden rounded-[1.125rem] p-[3px]">
      <span class="special-button__outline pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] opacity-0" aria-hidden="true" />
      <svg class="special-button__path pointer-events-none absolute inset-0 z-2 size-full overflow-visible" viewBox="0 0 221 80" fill="none" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength="480" d="M182.7 2H203c8.8 0 16 7.2 16 16v44c0 8.8-7.2 16-16 16H18C9.2 78 2 70.8 2 62V18C2 9.2 9.2 2 18 2h29.9" />
      </svg>

      <span class="special-button__content relative z-1 flex size-full items-center justify-center gap-4 overflow-hidden rounded-[0.95rem] px-5 text-ds-text-white">
        <span v-if="hasCustomContent" class="special-button__custom relative z-2 flex min-w-0 items-center justify-center">
          <slot />
        </span>
        <span v-else-if="props.label" class="special-button__words relative z-2 grid min-w-0 place-items-center" :aria-label="props.label">
          <span class="sr-only">{{ props.label }}</span>
          <span class="special-button__word special-button__word--primary col-start-1 row-start-1 flex" aria-hidden="true">
            <span v-for="(character, index) in labels.primary" :key="`primary-${index}`" class="special-button__character" :style="getCharacterStyle(index)">{{ character === ' ' ? '\u00A0' : character }}</span>
          </span>
          <span class="special-button__word special-button__word--active col-start-1 row-start-1 flex" aria-hidden="true">
            <span v-for="(character, index) in labels.active" :key="`active-${index}`" class="special-button__character" :style="getCharacterStyle(index)">{{ character === ' ' ? '\u00A0' : character }}</span>
          </span>
        </span>

        <span v-if="hasIcon" class="special-button__icon relative z-2 grid shrink-0 place-items-center" aria-hidden="true">
          <slot name="icon">
            <Icon v-if="props.icon" :name="props.icon" class="size-5" />
          </slot>
        </span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.special-button {
  --special-highlight: color-mix(in srgb, var(--ds-color-brand-default) 28%, white);
  --special-light: color-mix(in srgb, var(--ds-color-brand-default) 52%, white);
  --special-mid: var(--ds-color-brand-default);
  --special-deep: color-mix(in srgb, var(--ds-color-brand-hover) 72%, black);
  --special-shadow: color-mix(in srgb, var(--ds-color-brand-active) 48%, black);
  --special-text: color-mix(in srgb, var(--ds-color-text-white) 92%, var(--special-highlight));
  -webkit-tap-highlight-color: transparent;
}

.special-button[data-tone="ice"],
:global(html.dark) .special-button[data-tone="ice"] {
  --special-highlight: var(--ds-color-special-ice-highlight);
  --special-light: var(--ds-color-special-ice-light);
  --special-mid: var(--ds-color-special-ice-default);
  --special-deep: var(--ds-color-special-ice-deep);
  --special-shadow: var(--ds-color-special-ice-shadow);
  --special-text: var(--ds-color-special-ice-text);
}

:global(html.dark) .special-button {
  --special-highlight: color-mix(in srgb, var(--ds-color-brand-default) 48%, white);
  --special-light: color-mix(in srgb, var(--ds-color-brand-default) 72%, white);
  --special-deep: color-mix(in srgb, var(--ds-color-brand-active) 58%, black);
  --special-shadow: color-mix(in srgb, var(--ds-color-brand-active) 34%, black);
}

.special-button__shadow::before,
.special-button__shadow::after {
  position: absolute;
  inset: 0;
  border-radius: 1.2rem;
  background: var(--special-deep);
  content: "";
}

.special-button__shadow::before {
  filter: blur(5px);
  opacity: 0.9;
  box-shadow:
    -7px 6px 0 color-mix(in srgb, var(--special-shadow) 40%, transparent),
    -14px 12px 0 color-mix(in srgb, var(--special-shadow) 30%, transparent),
    -21px 18px 4px color-mix(in srgb, var(--special-shadow) 24%, transparent),
    -28px 24px 8px color-mix(in srgb, var(--special-shadow) 16%, transparent),
    -38px 30px 16px color-mix(in srgb, var(--special-shadow) 9%, transparent);
  transition: opacity 300ms ease, box-shadow 300ms ease;
}

.special-button__frame {
  background: linear-gradient(180deg, var(--special-highlight), var(--special-deep));
  transform: translate(6px, -6px);
  transition: transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.special-button__content {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--special-light) 76%, transparent), transparent 42%),
    linear-gradient(180deg, var(--special-mid), var(--special-deep));
  box-shadow:
    inset -2px 12px 11px -5px var(--special-light),
    inset 1px -4px 12px color-mix(in srgb, black 38%, transparent);
  color: var(--special-text);
  text-shadow: -1px 1px 2px var(--special-deep);
  transition: box-shadow 300ms ease;
}

.special-button[data-tone="ice"] .special-button__content {
  text-shadow: none;
}

.special-button__content::before {
  position: absolute;
  z-index: 1;
  top: 44%;
  left: 10%;
  width: 80%;
  height: 24%;
  border-radius: 999px;
  background: linear-gradient(180deg, transparent, var(--special-mid));
  content: "";
  filter: brightness(1.28) blur(5px);
  opacity: 0.65;
}

.special-button__outline {
  transition: opacity 350ms ease;
}

.special-button__outline::before {
  position: absolute;
  inset: -120px 48px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, white 88%, var(--special-highlight)), transparent);
  content: "";
  animation: special-button-spin 3s linear infinite paused;
}

.special-button__path path,
.special-button__splash path {
  stroke: var(--special-highlight);
  stroke-linecap: round;
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
}

.special-button__path path {
  stroke-dasharray: 150 480;
  stroke-dashoffset: 150;
}

.special-button__splash path {
  stroke-dasharray: 60 60;
  stroke-dashoffset: 60;
}

.special-button__character {
  display: block;
  transition:
    opacity 480ms ease,
    filter 480ms ease,
    transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1);
  transition-delay: calc(var(--special-char-index) * 28ms);
}

.special-button__word--active .special-button__character {
  filter: blur(8px);
  opacity: 0;
  transform: translateY(75%);
}

.special-button__icon {
  filter: drop-shadow(-2px 2px 3px var(--special-deep));
}

.special-button:hover:not(:disabled) .special-button__frame,
.special-button:focus-visible:not(:disabled) .special-button__frame {
  transform: translate(8px, -8px);
}

.special-button:hover:not(:disabled) .special-button__outline,
.special-button:focus-visible:not(:disabled) .special-button__outline {
  opacity: 1;
}

.special-button:hover:not(:disabled) .special-button__outline::before,
.special-button:focus-visible:not(:disabled) .special-button__outline::before {
  animation-play-state: running;
}

.special-button:hover:not(:disabled) .special-button__word--primary .special-button__character,
.special-button:focus-visible:not(:disabled) .special-button__word--primary .special-button__character {
  filter: blur(4px);
  opacity: 0;
  transform: translateY(-75%);
}

.special-button:hover:not(:disabled) .special-button__word--active .special-button__character,
.special-button:focus-visible:not(:disabled) .special-button__word--active .special-button__character {
  filter: blur(0);
  opacity: 1;
  transform: translateY(0);
}

.special-button:hover:not(:disabled) .special-button__icon,
.special-button:focus-visible:not(:disabled) .special-button__icon {
  animation: special-button-icon-swing 850ms ease-in-out infinite;
}

.special-button:active:not(:disabled) .special-button__frame {
  transform: translate(3px, -3px);
}

.special-button:active:not(:disabled) .special-button__shadow::before {
  opacity: 0.65;
  box-shadow:
    -7px 6px 0 color-mix(in srgb, var(--special-shadow) 38%, transparent),
    -14px 12px 0 color-mix(in srgb, var(--special-shadow) 22%, transparent),
    -21px 18px 4px color-mix(in srgb, var(--special-shadow) 12%, transparent);
}

.special-button:active:not(:disabled) .special-button__content {
  box-shadow:
    inset -1px 12px 8px -5px color-mix(in srgb, var(--special-deep) 42%, transparent),
    inset 0 -3px 8px var(--special-light);
}

.special-button:active:not(:disabled) .special-button__splash path {
  animation: special-button-splash 800ms cubic-bezier(0.3, 0, 0, 1) forwards 50ms;
}

.special-button:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--ds-color-brand-focus) 42%, transparent);
  outline-offset: 7px;
}

.special-button:focus-visible:not(:disabled) .special-button__path path {
  animation: special-button-path 1.6s ease forwards 180ms;
}

@keyframes special-button-spin {
  to { transform: rotate(360deg); }
}

@keyframes special-button-icon-swing {
  50% { transform: translateX(5px) rotate(-4deg); }
}

@keyframes special-button-path {
  to { stroke-dashoffset: -480; }
}

@keyframes special-button-splash {
  to {
    stroke-dasharray: 2 60;
    stroke-dashoffset: -60;
  }
}

.special-button[data-size="compact"] {
  width: 40px;
  height: 40px;
  font-size: 0.875rem;
}

.special-button[data-size="signal"] {
  width: 184px;
}

.special-button[data-size="signal"] .special-button__content {
  gap: 0.75rem;
  padding-inline: 1rem;
}

.special-button[data-size="compact"] .special-button__shadow,
.special-button[data-size="compact"] .special-button__shadow::before,
.special-button[data-size="compact"] .special-button__shadow::after,
.special-button[data-size="compact"] .special-button__frame {
  border-radius: 0.75rem;
}

.special-button[data-size="compact"] .special-button__shadow::before {
  box-shadow:
    -3px 3px 0 color-mix(in srgb, var(--special-shadow) 32%, transparent),
    -6px 6px 4px color-mix(in srgb, var(--special-shadow) 18%, transparent),
    -9px 9px 8px color-mix(in srgb, var(--special-shadow) 9%, transparent);
}

.special-button[data-size="compact"] .special-button__frame {
  padding: 2px;
  transform: translate(3px, -3px);
}

.special-button[data-size="compact"] .special-button__content {
  gap: 0.5rem;
  border-radius: 0.625rem;
  padding-inline: 0.5rem;
}

.special-button[data-size="compact"] .special-button__splash,
.special-button[data-size="compact"] .special-button__path {
  display: none;
}

.special-button[data-size="compact"] .special-button__outline::before {
  inset: -80px 12px;
}

.special-button[data-size="compact"]:hover:not(:disabled) .special-button__frame,
.special-button[data-size="compact"]:focus-visible:not(:disabled) .special-button__frame {
  transform: translate(4px, -4px);
}

.special-button[data-size="compact"]:active:not(:disabled) .special-button__frame {
  transform: translate(1px, -1px);
}

.special-button[data-size="compact"]:active:not(:disabled) .special-button__shadow::before {
  box-shadow: -3px 3px 3px color-mix(in srgb, var(--special-shadow) 22%, transparent);
}

.special-button[data-size="compact"]:focus-visible {
  outline-width: 2px;
  outline-offset: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .special-button *,
  .special-button *::before,
  .special-button *::after {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }

  .special-button:hover:not(:disabled) .special-button__word--primary .special-button__character,
  .special-button:focus-visible:not(:disabled) .special-button__word--primary .special-button__character {
    filter: none;
    opacity: 1;
    transform: none;
  }

  .special-button__word--active {
    display: none;
  }
}
</style>
