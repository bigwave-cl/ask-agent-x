import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

/** TabsList 的布局与视觉变体。 */
export const tabsListVariants = cva(
    'group/tabs-list relative inline-flex max-w-full items-center justify-start text-ds-text-tertiary',
    {
        variants: {
            variant: {
                line: 'gap-10 bg-transparent aria-[orientation=vertical]:flex-col',
                tag: 'gap-2 bg-transparent',
                segment: 'isolate gap-[3px] bg-ds-fill-bw-transparent-5 p-[3px] aria-[orientation=vertical]:flex-col aria-[orientation=vertical]:items-stretch',
            },
            shape: {
                regular: 'data-[variant=segment]:rounded-xl',
                pill: 'data-[variant=segment]:rounded-full',
            },
            scrollable: {
                false: 'w-fit overflow-hidden',
                true: 'w-full touch-pan-x overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            },
        },
        defaultVariants: {
            variant: 'line',
            shape: 'pill',
            scrollable: false,
        },
    },
)

/** TabsList 变体参数类型。 */
export type TabsListVariants = VariantProps<typeof tabsListVariants>

/** 共享指示条使用 Reka 的物理坐标与尺寸，随滚动内容移动，RTL 下无需反转。 */
export const tabsIndicatorVariants = cva(
    'pointer-events-none absolute left-0 translate-x-[var(--reka-tabs-indicator-position)] transition-[transform,translate,width,height] duration-200 ease-out motion-reduce:transition-none',
    {
        variants: {
            variant: {
                line: [
                    'bottom-0 h-0.5 w-[var(--reka-tabs-indicator-size)] bg-ds-brand-default',
                    'group-aria-[orientation=vertical]/tabs-list:top-0 group-aria-[orientation=vertical]/tabs-list:left-auto group-aria-[orientation=vertical]/tabs-list:right-0',
                    'group-aria-[orientation=vertical]/tabs-list:h-[var(--reka-tabs-indicator-size)] group-aria-[orientation=vertical]/tabs-list:w-0.5',
                    'group-aria-[orientation=vertical]/tabs-list:translate-x-0 group-aria-[orientation=vertical]/tabs-list:translate-y-[var(--reka-tabs-indicator-position)]',
                ].join(' '),
                segment: [
                    'top-[calc((100%_-_var(--reka-tabs-indicator-thickness))/2)] h-[var(--reka-tabs-indicator-thickness)] w-[var(--reka-tabs-indicator-size)] bg-ds-bg-surface shadow-sm',
                    'group-data-[shape=regular]/tabs-list:rounded-xl group-data-[shape=pill]/tabs-list:rounded-full',
                    'group-aria-[orientation=vertical]/tabs-list:top-0 group-aria-[orientation=vertical]/tabs-list:left-[calc((100%_-_var(--reka-tabs-indicator-thickness))/2)]',
                    'group-aria-[orientation=vertical]/tabs-list:h-[var(--reka-tabs-indicator-size)] group-aria-[orientation=vertical]/tabs-list:w-[var(--reka-tabs-indicator-thickness)]',
                    'group-aria-[orientation=vertical]/tabs-list:translate-x-0 group-aria-[orientation=vertical]/tabs-list:translate-y-[var(--reka-tabs-indicator-position)]',
                ].join(' '),
                tag: '',
            },
        },
        defaultVariants: {
            variant: 'line',
        },
    },
)

/** TabsTrigger 共享 PG 视觉规则。 */
export const tabsTriggerClass = [
    'relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap border border-transparent font-semibold outline-none',
    'transition-[color,background-color,border-color,box-shadow] duration-150',
    'focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ds-brand-default/20',
    'disabled:pointer-events-none disabled:border-ds-border-subtle-5 disabled:bg-transparent disabled:text-ds-text-disabled',
    'group-data-[size=28]/tabs-list:h-7 group-data-[size=28]/tabs-list:px-3 group-data-[size=28]/tabs-list:text-xs',
    'group-data-[size=36]/tabs-list:h-9 group-data-[size=36]/tabs-list:px-4 group-data-[size=36]/tabs-list:text-sm',
    'group-data-[size=40]/tabs-list:h-10 group-data-[size=40]/tabs-list:px-4 group-data-[size=40]/tabs-list:text-sm',
    'group-data-[size=44]/tabs-list:h-11 group-data-[size=44]/tabs-list:px-4 group-data-[size=44]/tabs-list:text-base',
    'group-data-[shape=regular]/tabs-list:rounded-xl group-data-[shape=pill]/tabs-list:rounded-full',
    'group-data-[variant=line]/tabs-list:px-0 group-data-[variant=line]/tabs-list:text-ds-text-helper',
    'group-data-[variant=line]/tabs-list:disabled:border-transparent group-data-[variant=line]/tabs-list:disabled:bg-transparent',
    'group-data-[variant=line]/tabs-list:hover:text-ds-text-primary group-data-[variant=line]/tabs-list:data-active:text-ds-text-primary',
    'group-data-[variant=tag]/tabs-list:border-ds-border-subtle-10 group-data-[variant=tag]/tabs-list:text-ds-text-helper',
    'group-data-[variant=tag]/tabs-list:hover:border-ds-border-subtle-20 group-data-[variant=tag]/tabs-list:hover:bg-ds-fill-bw-transparent-3 group-data-[variant=tag]/tabs-list:hover:text-ds-text-secondary',
    'group-data-[variant=tag]/tabs-list:data-active:border-ds-fill-brand-transparent-20 group-data-[variant=tag]/tabs-list:data-active:bg-ds-fill-brand-transparent-10 group-data-[variant=tag]/tabs-list:data-active:text-ds-text-brand',
    'group-data-[variant=segment]/tabs-list:z-1 group-data-[variant=segment]/tabs-list:text-ds-text-tertiary group-data-[variant=segment]/tabs-list:data-[state=inactive]:hover:bg-ds-fill-bw-transparent-3 group-data-[variant=segment]/tabs-list:hover:text-ds-text-primary',
    'group-data-[variant=segment]/tabs-list:data-active:text-ds-text-primary',
    '[&_svg:not([class*=size-])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0',
].join(' ')
