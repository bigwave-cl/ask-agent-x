import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCopyText } from './useCopyText'

const clipboardCopy = vi.hoisted(() => vi.fn())

vi.mock('clipboard', () => ({
  default: { copy: clipboardCopy },
}))

describe('useCopyText', () => {
  beforeEach(() => {
    clipboardCopy.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not load clipboard during server rendering', async () => {
    await expect(useCopyText('server text')).resolves.toBe(false)
    expect(clipboardCopy).not.toHaveBeenCalled()
  })

  it('copies a string in the browser', async () => {
    vi.stubGlobal('document', { activeElement: null, querySelector: vi.fn() })
    clipboardCopy.mockReturnValue('bg-ds-brand-default')

    await expect(useCopyText('bg-ds-brand-default')).resolves.toBe(true)
    expect(clipboardCopy).toHaveBeenCalledWith('bg-ds-brand-default', undefined)
  })

  it('uses the closest dialog as the clipboard container', async () => {
    const dialog = { id: 'copy-dialog' } as unknown as Element
    const target = {
      closest: vi.fn((selector: string) => selector === '[role="dialog"]' ? dialog : null),
    } as unknown as Element
    vi.stubGlobal('document', { activeElement: null, querySelector: vi.fn() })
    clipboardCopy.mockReturnValue('dialog text')

    await expect(useCopyText({ text: 'dialog text', el: target })).resolves.toBe(true)
    expect(clipboardCopy).toHaveBeenCalledWith('dialog text', { container: dialog })
  })

  it('returns false when copying fails', async () => {
    vi.stubGlobal('document', { activeElement: null, querySelector: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    clipboardCopy.mockImplementation(() => { throw new Error('copy failed') })

    await expect(useCopyText('failed text')).resolves.toBe(false)
  })
})
