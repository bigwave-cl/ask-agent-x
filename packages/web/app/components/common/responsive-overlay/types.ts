import type {
  DialogContentProps,
  DialogRootProps,
  PopoverContentProps,
  PopoverRootProps,
} from 'reka-ui'
import type { DrawerRootProps } from 'vaul-vue'
import type { HTMLAttributes } from 'vue'

export type ResponsiveOverlayMode = 'dialog' | 'drawer' | 'popover'
export type ResponsiveOverlayDesktopMode = Exclude<ResponsiveOverlayMode, 'drawer'>
export type ResponsiveOverlayPresentation = ResponsiveOverlayMode | 'pending'
export type ResponsiveOverlayClass = HTMLAttributes['class']

export type ResponsiveOverlayHeaderVisibility = boolean | {
  desktop?: boolean
  mobile?: boolean
}

export type ResponsiveOverlayCloseVisibility = boolean | {
  desktop?: boolean
  mobile?: boolean
}

type ControlledRootKeys = 'defaultOpen' | 'open'

export type ResponsiveOverlayDialogOptions = {
  root?: Omit<DialogRootProps, ControlledRootKeys>
  content?: Omit<DialogContentProps, 'class'> & { class?: ResponsiveOverlayClass }
}

export type ResponsiveOverlayDrawerOptions = {
  root?: Omit<DrawerRootProps, ControlledRootKeys>
  content?: Omit<DialogContentProps, 'class'> & { class?: ResponsiveOverlayClass }
}

export type ResponsiveOverlayPopoverOptions = {
  root?: Omit<PopoverRootProps, ControlledRootKeys>
  content?: Omit<PopoverContentProps, 'class'> & { class?: ResponsiveOverlayClass }
}

export type ResponsiveOverlaySlotProps = {
  close: () => void
  isMobile: boolean
  mode: ResponsiveOverlayMode
  open: boolean
  topLeft: () => void
}

export type ResponsiveOverlayShellProps = {
  mode: ResponsiveOverlayMode
  isMobile: boolean
  open: boolean
  title: string
  description?: string
  showHeader?: ResponsiveOverlayHeaderVisibility
  showTopLeft?: boolean
  topLeftDisabled?: boolean
  topLeftLabel?: string
  showClose?: ResponsiveOverlayCloseVisibility
  closeDisabled?: boolean
  closeLabel: string
  shellClass?: ResponsiveOverlayClass
  headerClass?: ResponsiveOverlayClass
  titleClass?: ResponsiveOverlayClass
  descriptionClass?: ResponsiveOverlayClass
  bodyClass?: ResponsiveOverlayClass
  footerClass?: ResponsiveOverlayClass
  topLeftButtonClass?: ResponsiveOverlayClass
  closeButtonClass?: ResponsiveOverlayClass
}

export type ResponsiveOverlayShellOptionProps = Omit<
  ResponsiveOverlayShellProps,
  'isMobile' | 'mode' | 'open'
>

export type ResponsiveOverlayShellDefaults = Partial<
  Omit<ResponsiveOverlayShellOptionProps, 'closeLabel' | 'title'>
>

export type ResponsiveOverlayDialogProps = ResponsiveOverlayShellOptionProps & {
  dialog?: ResponsiveOverlayDialogOptions
  dismissible?: boolean
  isMobile?: boolean
}

export type ResponsiveOverlayDrawerProps = ResponsiveOverlayShellOptionProps & {
  drawer?: ResponsiveOverlayDrawerOptions
  dismissible?: boolean
  isMobile?: boolean
}

export type ResponsiveOverlayPopoverProps = ResponsiveOverlayShellOptionProps & {
  popover?: ResponsiveOverlayPopoverOptions
  dismissible?: boolean
  isMobile?: boolean
}

export type ResponsiveOverlayWrapperProps = ResponsiveOverlayShellOptionProps & {
  desktopMode?: ResponsiveOverlayDesktopMode
  desktopQuery?: string
  dismissible?: boolean
  drawer?: ResponsiveOverlayDrawerOptions
}

export type ResponsiveOverlayDialogDrawerProps = ResponsiveOverlayShellOptionProps & {
  desktopQuery?: string
  dialog?: ResponsiveOverlayDialogOptions
  dismissible?: boolean
  drawer?: ResponsiveOverlayDrawerOptions
}

export type ResponsiveOverlayPopoverDrawerProps = ResponsiveOverlayShellOptionProps & {
  desktopQuery?: string
  dismissible?: boolean
  drawer?: ResponsiveOverlayDrawerOptions
  popover?: ResponsiveOverlayPopoverOptions
}

export function resolveResponsiveOverlayPresentation(
  mounted: boolean,
  isDesktop: boolean,
  desktopMode: ResponsiveOverlayDesktopMode,
): ResponsiveOverlayPresentation {
  if (!mounted) return 'pending'
  return isDesktop ? desktopMode : 'drawer'
}
