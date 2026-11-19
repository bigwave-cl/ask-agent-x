import { describe, expect, it } from 'vitest'
import { getWorkTimeStatus, normalizeWorkTime } from './work-time.js'

describe('bridge work time', () => {
  it('supports the default continuous window', () => {
    const windows = normalizeWorkTime({ mode: 'windows', window: { start: '09:00', end: '19:00' }, outsideWindow: 'stop-service' })
    expect(windows).toEqual([{ startMinute: 540, endMinute: 1140 }])
  })

  it('supports all-day mode without a break', () => {
    expect(getWorkTimeStatus({ mode: 'always', outsideWindow: 'stop-service' }).insideWindow).toBe(true)
  })

  it('supports a cross-midnight window', () => {
    const config = { mode: 'windows' as const, window: { start: '22:00', end: '06:00' }, outsideWindow: 'stop-service' as const }
    expect(getWorkTimeStatus(config, new Date('2026-11-13T16:00:00.000Z')).insideWindow).toBe(true)
  })
})
