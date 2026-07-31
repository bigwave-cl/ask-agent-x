import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 border border-transparent bg-clip-padding text-sm font-semibold focus-visible:ring-3 aria-invalid:ring-3 [&_svg:not([class*=size-])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-colors duration-150 outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-ds-brand-default text-ds-text-white hover:bg-ds-brand-hover active:bg-ds-brand-active',
        primary: 'bg-ds-brand-default text-ds-text-white hover:bg-ds-brand-hover active:bg-ds-brand-active',
        outline: 'border-ds-border-subtle-10 bg-ds-bg-surface text-ds-text-secondary hover:border-ds-border-subtle-20 hover:bg-ds-fill-bw-transparent-3 active:border-ds-border-subtle-20 active:bg-ds-fill-bw-transparent-5',
        outlined: 'border-ds-border-subtle-10 bg-ds-bg-surface text-ds-text-secondary hover:border-ds-border-subtle-20 hover:bg-ds-fill-bw-transparent-3 active:border-ds-border-subtle-20 active:bg-ds-fill-bw-transparent-5',
        secondary: 'bg-ds-text-primary text-ds-text-inverse hover:bg-ds-text-secondary active:bg-ds-text-tertiary',
        'secondary-subtle': 'bg-ds-fill-bw-transparent-5 text-ds-text-secondary hover:bg-ds-fill-bw-transparent-10 active:bg-ds-fill-bw-transparent-20',
        tertiary: 'border-ds-fill-brand-transparent-20 bg-ds-fill-brand-transparent-5 text-ds-text-brand hover:bg-ds-fill-brand-transparent-10 active:bg-ds-fill-brand-transparent-20',
        soft: 'bg-ds-fill-brand-transparent-10 text-ds-text-brand hover:bg-ds-fill-brand-transparent-20 active:bg-ds-fill-brand-transparent-20',
        ghost: 'bg-transparent text-ds-text-tertiary hover:bg-ds-fill-bw-transparent-3 active:bg-ds-fill-bw-transparent-5',
        destructive: 'bg-ds-danger-default text-ds-text-white hover:bg-ds-danger-hover active:bg-ds-danger-active focus-visible:border-ds-danger-default focus-visible:ring-ds-danger-default/20',
        link: 'text-ds-text-brand underline-offset-4 hover:underline',
      },
      size: {
        'default': 'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        'xs': 'h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*=size-])]:size-3',
        'sm': 'h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*=size-])]:size-3.5',
        'lg': 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        'xl': 'h-11 gap-2 rounded-xl px-4 text-sm has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5',
        '36': 'h-9 gap-2 px-4 text-sm',
        '40': 'h-10 gap-2 px-4 text-sm',
        '48': 'h-12 gap-2 px-5 text-sm',
        '52': 'h-[52px] gap-2 px-5 text-sm',
        'icon': 'size-8',
        'icon-xs': 'size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*=size-])]:size-3',
        'icon-sm': 'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
      shape: {
        regular: 'rounded-xl',
        pill: 'rounded-full',
      },
      square: {
        true: 'aspect-square px-0',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
      shape: 'regular',
      square: false,
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
