import { randomUUID } from 'node:crypto'
import { stableHash } from './hash.js'
import type { ActionPlan, FileOperation, UserConsent } from './types.js'

export type PlanDraft<T> = Omit<ActionPlan<T>, 'id' | 'createdAt' | 'hash' | 'operations'> & {
  operations?: FileOperation[]
}

export function createActionPlan<T>(draft: PlanDraft<T>): ActionPlan<T> {
  const unsigned = {
    id: randomUUID(),
    moduleId: draft.moduleId,
    action: draft.action,
    createdAt: new Date().toISOString(),
    detectionFingerprint: draft.detectionFingerprint,
    operations: draft.operations ?? [],
    input: draft.input,
  }
  return { ...unsigned, hash: stableHash(unsigned) }
}

export function assertConsent(plan: ActionPlan, consent: UserConsent): void {
  const { hash: _hash, ...unsigned } = plan
  if (stableHash(unsigned) !== plan.hash) throw new Error('Plan content changed after it was created')
  if (consent.planHash !== plan.hash) throw new Error('Consent does not match this plan')
}
