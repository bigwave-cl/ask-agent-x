import { describe, expect, it } from 'vitest'
import {
  resolveSpecialButtonLabels,
  shouldRenderSpecialButtonIcon,
  splitSpecialButtonLabel,
} from './types'

describe('SpecialButton contract', () => {
  it('splits Unicode labels for character animation', () => {
    expect(splitSpecialButtonLabel('启🚀动')).toEqual(['启', '🚀', '动'])
  })

  it('falls back to the primary label when active label is absent', () => {
    expect(resolveSpecialButtonLabels('开始探索')).toEqual({
      primary: ['开', '始', '探', '索'],
      active: ['开', '始', '探', '索'],
    })
    expect(resolveSpecialButtonLabels('开始探索', '立即进入').active).toEqual(['立', '即', '进', '入'])
  })

  it('resolves icon slot and icon prop precedence', () => {
    expect(shouldRenderSpecialButtonIcon(false, 'askx-navigation:arrow-right')).toBe(true)
    expect(shouldRenderSpecialButtonIcon(false, null)).toBe(false)
    expect(shouldRenderSpecialButtonIcon(true, null)).toBe(true)
  })
})
