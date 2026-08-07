import { describe, expect, it } from 'vitest'
import { resolveConfirmationInput } from './confirmation-key.js'

describe('写计划确认按键', () => {
  it('回车确认，Esc 或 Q 放弃', () => {
    expect(resolveConfirmationInput('', { return: true, escape: false })).toBe(true)
    expect(resolveConfirmationInput('', { return: false, escape: true })).toBe(false)
    expect(resolveConfirmationInput('q', { return: false, escape: false })).toBe(false)
  })

  it('旧的 Y/N 输入不再触发确认结果', () => {
    expect(resolveConfirmationInput('y', { return: false, escape: false })).toBeUndefined()
    expect(resolveConfirmationInput('n', { return: false, escape: false })).toBeUndefined()
  })
})
