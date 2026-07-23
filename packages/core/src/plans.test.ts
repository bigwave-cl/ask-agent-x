import { describe, expect, it } from 'vitest'
import { assertConsent, createActionPlan } from './plans.js'

describe('action plan consent', () => {
  it('accepts consent bound to the immutable plan hash', () => {
    const plan = createActionPlan({
      moduleId: 'skills',
      action: 'link',
      detectionFingerprint: 'detected-state',
      input: { platforms: ['codex'] },
    })

    expect(() => assertConsent(plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })).not.toThrow()
  })

  it('rejects a mutated plan', () => {
    const plan = createActionPlan({
      moduleId: 'skills',
      action: 'link',
      detectionFingerprint: 'detected-state',
      input: {},
    })
    plan.action = 'unlink'

    expect(() => assertConsent(plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })).toThrow(
      'Plan content changed',
    )
  })
})

