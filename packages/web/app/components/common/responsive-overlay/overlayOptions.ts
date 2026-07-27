import { cn } from '../../../lib/utils'
import type {
  ResponsiveOverlayDialogOptions,
  ResponsiveOverlayDrawerOptions,
  ResponsiveOverlayPopoverOptions,
  ResponsiveOverlayShellDefaults,
} from './types'

export const responsiveOverlayShellDefaults = {
  description: undefined,
  showHeader: true,
  showTopLeft: false,
  topLeftDisabled: false,
  topLeftLabel: undefined,
  showClose: true,
  closeDisabled: false,
  shellClass: undefined,
  headerClass: undefined,
  titleClass: undefined,
  descriptionClass: undefined,
  bodyClass: undefined,
  footerClass: undefined,
  topLeftButtonClass: undefined,
  closeButtonClass: undefined,
} satisfies ResponsiveOverlayShellDefaults

export const responsiveOverlayClasses = {
  content: {
    dialog: 'flex max-h-[min(46rem,calc(100dvh-2rem))] max-w-xl gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl',
    drawer: 'max-h-[min(42rem,88dvh)] overflow-hidden rounded-t-2xl',
    popover: 'w-88 max-h-[min(38rem,var(--reka-popover-content-available-height))] gap-0 overflow-hidden rounded-2xl p-0 shadow-xl',
  },
  shell: {
    root: 'relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[inherit] bg-ds-bg-inverse text-ds-text-primary',
    header: 'relative flex shrink-0 items-center justify-center px-4 pb-3 pt-4 md:justify-between md:gap-4 md:px-6 md:py-5',
    heading: 'flex min-h-9 min-w-0 flex-1 items-center justify-center gap-3 md:justify-start',
    title: 'm-0 min-w-0 truncate text-[18px] font-semibold not-italic leading-[26px] text-ds-text-primary',
    topLeftArea: 'absolute left-4 top-[22px] z-30 flex shrink-0 items-center md:static md:z-auto',
    topLeftButton: 'h-6 w-6 shrink-0 rounded-[8px] p-0 md:h-9 md:w-9',
    closeButton: 'absolute right-4 top-[22px] z-30 h-6 w-6 rounded-[8px] p-0 md:right-6 md:h-8 md:w-8',
    body: {
      dialog: 'p-5',
      drawer: 'p-5',
      popover: 'p-4',
    },
    viewport: {
      dialog: 'max-h-[calc(100dvh-12rem)]',
      drawer: 'max-h-[calc(88dvh-11rem)]',
      popover: 'max-h-[min(26rem,calc(100dvh-12rem))]',
    },
    footer: {
      dialog: 'flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/30 p-4 sm:flex-row sm:justify-end',
      drawer: 'flex shrink-0 flex-col gap-2 border-t bg-muted/30 p-4',
      popover: 'flex shrink-0 justify-end gap-2 border-t bg-muted/30 p-3',
    },
  },
} as const

export function getDialogOptions(options?: ResponsiveOverlayDialogOptions) {
  return {
    root: {
      modal: true,
      unmountOnHide: true,
      ...options?.root,
    },
    content: {
      ...options?.content,
      class: cn(responsiveOverlayClasses.content.dialog, options?.content?.class),
    },
  } satisfies Required<ResponsiveOverlayDialogOptions>
}

export function getDrawerOptions(options?: ResponsiveOverlayDrawerOptions) {
  return {
    root: {
      dismissible: true,
      modal: true,
      shouldScaleBackground: false,
      ...options?.root,
    },
    content: {
      ...options?.content,
      class: cn(responsiveOverlayClasses.content.drawer, options?.content?.class),
    },
  } satisfies Required<ResponsiveOverlayDrawerOptions>
}

export function getPopoverOptions(options?: ResponsiveOverlayPopoverOptions) {
  return {
    root: {
      modal: false,
      ...options?.root,
    },
    content: {
      align: 'center',
      alignOffset: 0,
      collisionPadding: 12,
      side: 'bottom',
      sideOffset: 8,
      ...options?.content,
      class: cn(responsiveOverlayClasses.content.popover, options?.content?.class),
    },
  } satisfies Required<ResponsiveOverlayPopoverOptions>
}
