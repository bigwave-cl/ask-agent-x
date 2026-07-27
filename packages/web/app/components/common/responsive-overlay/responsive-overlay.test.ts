import { describe, expect, it } from 'vitest'
import {
  getDialogOptions,
  getDrawerOptions,
  getPopoverOptions,
  responsiveOverlayClasses,
} from './overlayOptions'
import { resolveResponsiveOverlayPresentation } from './types'

describe('ResponsiveOverlay presentation', () => {
  it('uses a stable pending state before hydration', () => {
    expect(resolveResponsiveOverlayPresentation(false, false, 'dialog')).toBe('pending')
    expect(resolveResponsiveOverlayPresentation(false, true, 'popover')).toBe('pending')
  })

  it('maps desktop modes and mobile drawers', () => {
    expect(resolveResponsiveOverlayPresentation(true, true, 'dialog')).toBe('dialog')
    expect(resolveResponsiveOverlayPresentation(true, true, 'popover')).toBe('popover')
    expect(resolveResponsiveOverlayPresentation(true, false, 'dialog')).toBe('drawer')
    expect(resolveResponsiveOverlayPresentation(true, false, 'popover')).toBe('drawer')
  })
})

describe('ResponsiveOverlay options', () => {
  it('keeps Dialog defaults while accepting usage-side overrides', () => {
    const options = getDialogOptions({
      root: { modal: false },
      content: { class: 'max-w-2xl', disableOutsidePointerEvents: false },
    })

    expect(options.root).toMatchObject({ modal: false, unmountOnHide: true })
    expect(options.content.disableOutsidePointerEvents).toBe(false)
    expect(options.content.class).toContain('rounded-2xl')
    expect(options.content.class).not.toContain('max-w-xl')
    expect(options.content.class).toContain('max-w-2xl')
  })

  it('keeps Drawer behavior defaults and forwards Vaul options', () => {
    const options = getDrawerOptions({
      root: { direction: 'left', shouldScaleBackground: true },
      content: { class: 'w-80' },
    })

    expect(options.root).toMatchObject({
      direction: 'left',
      dismissible: true,
      modal: true,
      shouldScaleBackground: true,
    })
    expect(options.content.class).toContain(responsiveOverlayClasses.content.drawer)
    expect(options.content.class).toContain('w-80')
  })

  it('lets Popover positioning be configured at the usage layer', () => {
    const options = getPopoverOptions({
      root: { modal: true },
      content: { align: 'end', class: 'w-96', side: 'top', sideOffset: 16 },
    })

    expect(options.root.modal).toBe(true)
    expect(options.content).toMatchObject({
      align: 'end',
      collisionPadding: 12,
      side: 'top',
      sideOffset: 16,
    })
    expect(options.content.class).toContain('rounded-2xl')
    expect(options.content.class).not.toContain('w-88')
    expect(options.content.class).toContain('w-96')
  })
})
