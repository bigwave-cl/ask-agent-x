<script setup lang="ts">
import { useId } from 'vue'

/** 品牌外观；表情仅由首页主动开启。 */
const props = withDefaults(defineProps<{
    /** 明暗配色，默认跟随主题。 */
    appearance?: 'auto' | 'light' | 'dark'
    /** 未指定时保留标准品牌图形。 */
    expression?: 'idle' | 'curious' | 'speaking' | 'focused'
    /** 页面不可见时暂停连续表情动画。 */
    paused?: boolean
    /** 标准化水平视线，默认正面。 */
    lookX?: number
    /** 标准化垂直视线，默认正面。 */
    lookY?: number
}>(), {
    appearance: 'auto',
    paused: false,
    lookX: 0,
    lookY: 0,
})

/** 实例标识，避免同页渐变冲突。 */
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
/** 书页底色渐变标识。 */
const baseGradientId = `askx-brand-base-${instanceId}`
/** 品牌笔画渐变标识。 */
const pathGradientId = `askx-brand-path-${instanceId}`
/** 缎带渐变标识。 */
const ribbonGradientId = `askx-brand-ribbon-${instanceId}`
/** 单实例眼白裁切路径，保证瞳孔与高光始终位于眼白内。 */
const eyeClipId = `askx-brand-eyes-${instanceId}`
/** 防止调用方的越界方向放大表现位移。 */
const lookStyle = computed(() => ({
    /** 水平表现系数。 */
    '--look-x': props.paused ? 0 : Math.max(-1, Math.min(1, props.lookX)),
    /** 垂直表现系数。 */
    '--look-y': props.paused ? 0 : Math.max(-1, Math.min(1, props.lookY)),
}))
</script>

<template>
    <svg
        class="group block overflow-visible [--brand-mark-base-end:#94a3b8] [--brand-mark-base-middle:#475569] [--brand-mark-base-start:#182433] [--brand-mark-border:#bae6fd] [--brand-mark-glow:color-mix(in_srgb,#22d3ee_24%,transparent)] [--brand-mark-highlight:#ecfeff] [--brand-mark-ink-end:#bae6fd] [--brand-mark-ink-shadow:color-mix(in_srgb,#22d3ee_42%,transparent)] [--brand-mark-ink-start:#f8fafc] [--brand-mark-ribbon-end:#ecfeff] [--brand-mark-ribbon-front:#ecfeff] [--brand-mark-ribbon-start:#22d3ee] [--brand-mark-spark:#ecfeff] drop-shadow-[0_5px_8px_var(--brand-mark-glow)] data-[appearance=dark]:[--brand-mark-base-end:#f8fafc] data-[appearance=dark]:[--brand-mark-base-middle:#e2e8f0] data-[appearance=dark]:[--brand-mark-base-start:#cbd5e1] data-[appearance=dark]:[--brand-mark-border:#f8fafc] data-[appearance=dark]:[--brand-mark-glow:color-mix(in_srgb,#38bdf8_34%,transparent)] data-[appearance=dark]:[--brand-mark-highlight:#f8fafc] data-[appearance=dark]:[--brand-mark-ink-end:#334155] data-[appearance=dark]:[--brand-mark-ink-shadow:color-mix(in_srgb,#38bdf8_24%,transparent)] data-[appearance=dark]:[--brand-mark-ink-start:#1e293b] data-[appearance=dark]:[--brand-mark-ribbon-end:#f8fafc] data-[appearance=dark]:[--brand-mark-ribbon-front:#f8fafc] data-[appearance=dark]:[--brand-mark-ribbon-start:#38bdf8] data-[appearance=dark]:[--brand-mark-spark:#f8fafc] dark:data-[appearance=auto]:[--brand-mark-base-end:#f8fafc] dark:data-[appearance=auto]:[--brand-mark-base-middle:#e2e8f0] dark:data-[appearance=auto]:[--brand-mark-base-start:#cbd5e1] dark:data-[appearance=auto]:[--brand-mark-border:#f8fafc] dark:data-[appearance=auto]:[--brand-mark-glow:color-mix(in_srgb,#38bdf8_34%,transparent)] dark:data-[appearance=auto]:[--brand-mark-highlight:#f8fafc] dark:data-[appearance=auto]:[--brand-mark-ink-end:#334155] dark:data-[appearance=auto]:[--brand-mark-ink-shadow:color-mix(in_srgb,#38bdf8_24%,transparent)] dark:data-[appearance=auto]:[--brand-mark-ink-start:#1e293b] dark:data-[appearance=auto]:[--brand-mark-ribbon-end:#f8fafc] dark:data-[appearance=auto]:[--brand-mark-ribbon-front:#f8fafc] dark:data-[appearance=auto]:[--brand-mark-ribbon-start:#38bdf8] dark:data-[appearance=auto]:[--brand-mark-spark:#f8fafc]"
        :data-appearance="props.appearance"
        :data-expression="props.expression"
        :data-paused="props.paused"
        :style="lookStyle"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
    >
        <defs>
            <clipPath :id="eyeClipId">
                <ellipse
                    cx="16"
                    cy="24"
                    rx="4.3"
                    ry="5.2"
                />
                <ellipse
                    v-if="props.expression !== 'curious'"
                    cx="29"
                    cy="24"
                    rx="4.3"
                    ry="5.2"
                />
            </clipPath>
            <linearGradient
                :id="baseGradientId"
                x1="4"
                y1="43"
                x2="42"
                y2="5"
                gradientUnits="userSpaceOnUse"
            >
                <stop
                    class="[stop-color:var(--brand-mark-base-start)]"
                    offset="0"
                />
                <stop
                    class="[stop-color:var(--brand-mark-base-middle)]"
                    offset="0.52"
                />
                <stop
                    class="[stop-color:var(--brand-mark-base-end)]"
                    offset="1"
                />
            </linearGradient>
            <linearGradient
                :id="ribbonGradientId"
                x1="29"
                y1="25"
                x2="45"
                y2="7"
                gradientUnits="userSpaceOnUse"
            >
                <stop
                    class="[stop-color:var(--brand-mark-ribbon-start)]"
                    offset="0"
                />
                <stop
                    class="[stop-color:var(--brand-mark-ribbon-end)]"
                    offset="1"
                />
            </linearGradient>
            <linearGradient
                :id="pathGradientId"
                x1="12"
                y1="14"
                x2="36"
                y2="38"
                gradientUnits="userSpaceOnUse"
            >
                <stop
                    class="[stop-color:var(--brand-mark-ink-start)]"
                    offset="0"
                />
                <stop
                    class="[stop-color:var(--brand-mark-ink-end)]"
                    offset="1"
                />
            </linearGradient>
        </defs>
        <g class="brand-look">
            <g
                class="brand-body origin-center transition-transform duration-180 [transform-box:fill-box] group-hover:[transform:rotate(-3deg)_translateY(-1px)] motion-reduce:transition-none"
                transform="rotate(-6 24 24)"
            >
                <rect
                    class="[stroke-width:0.8] [stroke:var(--brand-mark-border)]"
                    x="3.5"
                    y="6"
                    width="38"
                    height="37.5"
                    rx="2.5"
                    :fill="`url(#${baseGradientId})`"
                />
                <path
                    class="fill-none opacity-30 [stroke-linecap:square] [stroke-width:0.8] [stroke:var(--brand-mark-highlight)]"
                    d="M6.2 8.5H38.8V40.8"
                />
                <path
                    class="fill-none opacity-36 [stroke-linecap:round] [stroke-width:0.9] [stroke:var(--brand-mark-highlight)]"
                    d="M7 9.3H28.5C34.2 9.3 38.1 13 38.8 18.2"
                />

                <path
                    class="origin-left opacity-90 transition-transform duration-220 ease-[cubic-bezier(0.2,0.8,0.2,1)] [stroke-linejoin:round] [stroke-width:0.7] [stroke:color-mix(in_srgb,var(--brand-mark-highlight)_55%,transparent)] [transform-box:fill-box] group-hover:[transform:rotate(-4deg)_translate(1px,-1px)] motion-reduce:transition-none"
                    :fill="`url(#${ribbonGradientId})`"
                    d="M28.5 18.5C34 16.5 35.8 10.1 44.2 6.1C41.8 11.7 40.8 17.6 33.2 22.2L28.5 18.5Z"
                />
                <path
                    class="origin-left fill-[var(--brand-mark-ribbon-front)] transition-transform duration-220 ease-[cubic-bezier(0.2,0.8,0.2,1)] [stroke-linejoin:round] [stroke-width:0.7] [stroke:color-mix(in_srgb,var(--brand-mark-highlight)_55%,transparent)] [transform-box:fill-box] group-hover:[transform:rotate(-2deg)_translate(1px,-0.5px)] motion-reduce:transition-none"
                    d="M30.4 21.2C36.2 20.5 40.2 17.8 45.3 13.5C42.5 20.2 38.7 24 31.5 25.3L30.4 21.2Z"
                />

                <g class="brand-monogram">
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
                </g>
                <path
                    class="fill-[var(--brand-mark-spark)] opacity-96"
                    d="M31.8 11.9L33 9.4L34.2 11.9L36.7 13.1L34.2 14.3L33 16.8L31.8 14.3L29.3 13.1L31.8 11.9Z"
                />
                <g
                    v-if="props.expression"
                    class="brand-face"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <g class="face-look">
                        <g class="face-pose">
                            <g class="face-eyes">
                                <ellipse
                                    cx="16"
                                    cy="24"
                                    rx="4.3"
                                    ry="5.2"
                                    class="eye-white"
                                />
                                <ellipse
                                    v-if="props.expression !== 'curious'"
                                    cx="29"
                                    cy="24"
                                    rx="4.3"
                                    ry="5.2"
                                    class="eye-white"
                                />
                                <g :clip-path="`url(#${eyeClipId})`">
                                    <g class="pupil-look">
                                        <ellipse
                                            cx="16"
                                            cy="24"
                                            rx="2"
                                            ry="2.8"
                                            class="eye-pupil"
                                        />
                                        <ellipse
                                            v-if="props.expression !== 'curious'"
                                            cx="29"
                                            cy="24"
                                            rx="2"
                                            ry="2.8"
                                            class="eye-pupil"
                                        />
                                        <circle
                                            cx="16.6"
                                            cy="23"
                                            r="0.65"
                                            class="eye-white"
                                        />
                                        <circle
                                            v-if="props.expression !== 'curious'"
                                            cx="29.6"
                                            cy="23"
                                            r="0.65"
                                            class="eye-white"
                                        />
                                    </g>
                                </g>
                                <path
                                    v-if="props.expression === 'curious'"
                                    d="M25 24Q29 20 33 24"
                                    class="face-line wink"
                                />
                            </g>
                            <path
                                class="face-line eyebrows"
                                :d="props.expression === 'curious' ? 'M11 16Q15 12 20 15M25 17L32 15' : props.expression === 'focused' ? 'M12 17L20 19M25 19L33 17' : props.expression === 'speaking' ? 'M12 17Q16 15 20 17M25 16Q29 14 33 16' : 'M12 17Q16 15 20 17M25 17Q29 15 33 17'"
                            />
                            <g
                                v-if="props.expression === 'focused'"
                                class="face-line spectacles"
                            >
                                <circle
                                    cx="16"
                                    cy="24"
                                    r="6"
                                />
                                <circle
                                    cx="29"
                                    cy="24"
                                    r="6"
                                />
                                <path d="M22 24H23M8 22L10 23M35 23L37 22" />
                            </g>
                            <ellipse
                                v-if="props.expression === 'speaking'"
                                cx="24"
                                cy="34"
                                rx="3.2"
                                ry="4"
                                class="face-line speaking-mouth"
                            />
                            <path
                                v-else-if="props.expression === 'curious'"
                                d="M17 32Q23 42 30 31Q23 35 17 32Z"
                                class="happy-mouth"
                            />
                            <path
                                v-else
                                class="face-line"
                                :d="props.expression === 'focused' ? 'M21 34H26' : 'M18 33Q23 38 28 33'"
                            />
                        </g>
                    </g>
                    <path
                        v-if="props.expression === 'curious'"
                        class="face-spark"
                        d="M7 10L8 7L9 10L12 11L9 12L8 15L7 12L4 11Z"
                    />
                    <g
                        v-if="props.expression === 'speaking'"
                        class="speech-bubble"
                    >
                        <path d="M31 5H42Q45 5 45 8V13Q45 16 42 16H37L34 19V16H31Q28 16 28 13V8Q28 5 31 5Z" />
                        <circle
                            cx="33"
                            cy="10.5"
                            r="0.8"
                        />
                        <circle
                            cx="37"
                            cy="10.5"
                            r="0.8"
                        />
                        <circle
                            cx="41"
                            cy="10.5"
                            r="0.8"
                        />
                    </g>
                </g>
            </g>
        </g>
    </svg>
</template>

<style scoped>
.brand-look {
    transform-origin: 24px 24px;
    transition: transform 140ms ease-out;
}

[data-expression] .brand-look {
    transform: perspective(220px) rotateY(calc(var(--look-x) * 8deg)) rotateX(calc(var(--look-y) * -5deg)) rotate(calc(var(--look-x) * 1.2deg));
}

.face-look {
    transform: translate(calc(var(--look-x) * 0.6px), calc(var(--look-y) * 0.6px));
    transition: transform 140ms ease-out;
}

.pupil-look {
    transform: translate(calc(var(--look-x) * 1.7px), calc(var(--look-y) * 1.4px));
    transition: transform 140ms ease-out;
}

.brand-monogram {
    transform-origin: 24px 25px;
    transition: opacity 260ms ease, transform 260ms ease;
}

[data-expression] .brand-monogram {
    opacity: 0;
    transform: scale(0.65);
}

[data-expression] .brand-body {
    transform: rotate(-3deg);
    transform-origin: 24px 26px;
    transition: transform 280ms ease;
}

[data-expression="curious"] .brand-body { transform: rotate(-8deg); }
[data-expression="speaking"] .brand-body { transform: rotate(2deg); }
[data-expression="focused"] .brand-body { transform: rotate(-1deg); }

.brand-face { color: var(--brand-mark-ink-start); }
.eye-white, .happy-mouth, .face-spark { fill: currentColor; }
.eye-pupil { fill: var(--brand-mark-base-start); }
.face-line { fill: none; stroke: currentColor; stroke-width: 1.8; }
.spectacles { stroke-width: 1.3; }
.face-pose { transform-origin: 24px 26px; transition: transform 280ms ease; }
[data-expression="idle"] .face-pose { animation: face-breathe 4s ease-in-out infinite; }
[data-expression="curious"] .face-pose { animation: face-bounce 1.8s ease-in-out infinite; }
[data-expression="speaking"] .face-pose { animation: face-talk-nod 1.6s ease-in-out infinite; }
[data-expression="focused"] .face-pose { animation: face-focus-nod 3.4s ease-in-out infinite; }
.speaking-mouth { transform-origin: 24px 34px; animation: face-talk 600ms ease-in-out infinite; }
.face-spark { animation: face-twinkle 1.8s ease-in-out infinite; transform-origin: 8px 11px; }
.speech-bubble path { fill: var(--brand-mark-ink-start); stroke: var(--brand-mark-base-start); stroke-width: 0.6; }
.speech-bubble circle { fill: var(--brand-mark-base-start); }
[data-paused="true"] .brand-face * { animation-play-state: paused; }

@keyframes face-breathe { 50% { transform: translateY(-0.6px); } }
@keyframes face-bounce { 35% { transform: translateY(-1.4px) rotate(-2deg); } 65% { transform: translateY(0.3px); } }
@keyframes face-talk-nod { 50% { transform: translateY(0.7px) rotate(2deg); } }
@keyframes face-focus-nod { 15% { transform: translateY(0.8px) rotate(1deg); } 30%, 100% { transform: none; } }
@keyframes face-talk { 50% { transform: scale(0.85, 0.45); } }
@keyframes face-twinkle { 50% { opacity: 0.5; transform: scale(0.8); } }

@media (prefers-reduced-motion: reduce) {
    [data-expression] .brand-look, .face-look, .pupil-look { transform: none; transition: none; }
    [data-expression] .brand-body, .brand-monogram, .face-pose { transition: none; }
    .brand-face * { animation: none !important; }
}
</style>
