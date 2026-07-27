export const responsiveSelectTriggerClass = [
  'group box-border h-9 min-w-40 self-stretch rounded-lg border border-solid border-ds-border-subtle-5 data-[size=default]:h-9',
  'bg-ds-fill-bw-transparent-3 px-3 py-2 text-xs font-medium leading-4 text-ds-text-secondary shadow-none backdrop-blur-[8px]',
  'gap-2 transition-colors duration-150 hover:border-ds-border-subtle-5 hover:bg-ds-fill-bw-transparent-5 hover:text-ds-text-primary',
  'active:border-ds-border-subtle-5 active:bg-ds-fill-bw-transparent-5 active:text-ds-text-primary',
  'data-[state=open]:border-ds-border-subtle-5 data-[state=open]:bg-ds-fill-bw-transparent-5 data-[state=open]:text-ds-text-primary',
  'dark:bg-ds-fill-bw-transparent-3 dark:hover:bg-ds-fill-bw-transparent-5 dark:data-[state=open]:bg-ds-fill-bw-transparent-5',
  'focus-visible:border-ds-border-subtle-5 focus-visible:ring-0',
  'disabled:cursor-not-allowed disabled:border-ds-border-subtle-5 disabled:bg-ds-fill-bw-transparent-3 disabled:text-ds-text-disabled disabled:opacity-100 disabled:[&>*]:opacity-50',
  '*:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:overflow-hidden *:data-[slot=select-value]:text-ellipsis *:data-[slot=select-value]:whitespace-nowrap *:data-[slot=select-value]:p-0 *:data-[slot=select-value]:text-left *:data-[slot=select-value]:font-medium',
].join(' ')

export const responsiveSelectDefaultIconClass = '[&>svg:last-child]:hidden'

export const responsiveSelectTriggerLabelClass = 'min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap p-0 text-left font-medium'

export const responsiveSelectTriggerIconClass = [
  'size-4 shrink-0 text-ds-text-tertiary transition-[color,opacity,transform,rotate] duration-150',
  'group-hover:text-ds-text-primary',
].join(' ')

export const responsiveSelectClearClass = [
  'absolute right-3 top-1/2 z-10 size-4 -translate-y-1/2 rounded-none border-0 bg-transparent p-0 text-ds-text-tertiary shadow-none',
  'pointer-events-none opacity-0 transition-[color,opacity] duration-150 hover:bg-transparent hover:text-ds-text-primary',
  'group-hover/responsive-select:pointer-events-auto group-hover/responsive-select:opacity-100',
].join(' ')
