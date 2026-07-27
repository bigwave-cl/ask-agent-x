import type {
  ResponsiveOverlayClass,
  ResponsiveOverlayDrawerOptions,
} from '../responsive-overlay/types'

export interface ResponsiveSelectOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

export interface ResponsiveSelectChangeEvent {
  originalEvent: Event
  value: string | undefined
  option: ResponsiveSelectOption | null
}

export interface ResponsiveSelectValueSlotProps {
  isMobile: boolean
  open: boolean
  option: ResponsiveSelectOption | null
  placeholder: string
  value: string | undefined
}

export interface ResponsiveSelectItemSlotProps {
  isMobile: boolean
  option: ResponsiveSelectOption
  selected: boolean
}

export interface ResponsiveSelectProps {
  options: ResponsiveSelectOption[]
  title: string
  placeholder: string
  closeLabel: string
  emptyText: string
  clearLabel: string
  description?: string
  disabled?: boolean
  clearable?: boolean
  clearValue?: string
  name?: string
  desktopQuery?: string
  triggerClass?: ResponsiveOverlayClass
  contentClass?: ResponsiveOverlayClass
  drawer?: ResponsiveOverlayDrawerOptions
}

export interface ResponsiveSelectCommitResult {
  accepted: boolean
  value: string | undefined
  option: ResponsiveSelectOption | null
}

export const responsiveSelectHiddenDrawerHandleClass = '[&>div:first-child]:hidden'

export function getResponsiveSelectDrawerOptions(
  drawer?: ResponsiveOverlayDrawerOptions,
): ResponsiveOverlayDrawerOptions {
  return {
    root: {
      ...drawer?.root,
      handleOnly: true,
    },
    content: {
      ...drawer?.content,
      class: [responsiveSelectHiddenDrawerHandleClass, drawer?.content?.class],
    },
  }
}

export function findResponsiveSelectOption(
  options: ResponsiveSelectOption[],
  value: string | undefined,
): ResponsiveSelectOption | null {
  return options.find(option => option.value === value) ?? null
}

export function resolveResponsiveSelectCommit(
  options: ResponsiveSelectOption[],
  value: string | undefined,
  source: 'clear' | 'select',
  disabled = false,
): ResponsiveSelectCommitResult {
  const option = source === 'select' ? findResponsiveSelectOption(options, value) : null
  const accepted = !disabled && (source === 'clear' || Boolean(option && !option.disabled))

  return { accepted, value, option }
}
