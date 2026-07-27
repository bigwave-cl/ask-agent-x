import { describe, expect, it, vi } from 'vitest'
import {
  findResponsiveSelectOption,
  getResponsiveSelectDrawerOptions,
  responsiveSelectHiddenDrawerHandleClass,
  resolveResponsiveSelectCommit,
} from './types'

const options = [
  { value: 'codex', label: 'Codex' },
  { value: 'cursor', label: 'Cursor', disabled: true },
]

describe('ResponsiveSelect selection contract', () => {
  it('resolves a normal selection and its complete option', () => {
    expect(findResponsiveSelectOption(options, 'codex')).toEqual(options[0])
    expect(resolveResponsiveSelectCommit(options, 'codex', 'select')).toEqual({
      accepted: true,
      value: 'codex',
      option: options[0],
    })
  })

  it('rejects disabled controls, disabled options, and unknown values', () => {
    expect(resolveResponsiveSelectCommit(options, 'codex', 'select', true).accepted).toBe(false)
    expect(resolveResponsiveSelectCommit(options, undefined, 'clear', true).accepted).toBe(false)
    expect(resolveResponsiveSelectCommit(options, 'cursor', 'select').accepted).toBe(false)
    expect(resolveResponsiveSelectCommit(options, 'unknown', 'select').accepted).toBe(false)
    expect(resolveResponsiveSelectCommit([], 'codex', 'select').accepted).toBe(false)
  })

  it('accepts clear values without resolving an option', () => {
    expect(resolveResponsiveSelectCommit(options, undefined, 'clear')).toEqual({
      accepted: true,
      value: undefined,
      option: null,
    })
  })

  it('allows one change notification for one accepted commit', () => {
    const onChange = vi.fn()
    const result = resolveResponsiveSelectCommit(options, 'codex', 'select')
    if (result.accepted) onChange(result)

    expect(onChange).toHaveBeenCalledOnce()
  })

  it('hides the mobile handle and restricts dragging to an absent handle', () => {
    const drawer = getResponsiveSelectDrawerOptions({
      root: { direction: 'bottom', handleOnly: false },
      content: { class: 'max-h-96' },
    })

    expect(drawer.root).toMatchObject({
      direction: 'bottom',
      handleOnly: true,
    })
    expect(drawer.content?.class).toEqual([
      responsiveSelectHiddenDrawerHandleClass,
      'max-h-96',
    ])
  })
})
