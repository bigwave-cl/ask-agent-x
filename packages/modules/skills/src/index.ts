import { randomUUID } from 'node:crypto'
import {
  createActionPlan,
  stableHash,
  type ActionPlan,
  type ActionReceipt,
  type AskXModule,
  type DetectionReport,
  type ModuleContext,
  type RollbackResult,
  type UserConsent,
} from '@askx/core'
import { scanSkills, type SkillsTopology } from './scanner.js'

export * from './scanner.js'

export class SkillsModule implements AskXModule {
  readonly id = 'skills'
  readonly name = 'Skills'

  async detect(context: ModuleContext): Promise<DetectionReport<SkillsTopology>> {
    const topology = await scanSkills(context.homeDir, context.dataDir)
    const issues = [
      ...topology.conflicts.map((conflict) => ({
        code: 'SKILL_CONTENT_CONFLICT',
        message: `Skill ${conflict.name} has different content across platforms.`,
      })),
      ...topology.brokenLinks.map((path) => ({ code: 'BROKEN_SKILL_LINK', message: 'Broken Skill link.', path })),
    ]
    return {
      moduleId: this.id,
      status: issues.length ? 'warning' : 'ok',
      observedAt: new Date().toISOString(),
      fingerprint: topology.fingerprint,
      issues,
      data: topology,
    }
  }

  async plan(action: string, input: unknown): Promise<ActionPlan> {
    return createActionPlan({
      moduleId: this.id,
      action,
      detectionFingerprint: stableHash(input),
      input,
    })
  }

  async apply(_plan: ActionPlan, _consent: UserConsent): Promise<ActionReceipt> {
    throw new Error('Skills write operations are not enabled in this foundation release.')
  }

  async rollback(receipt: ActionReceipt): Promise<RollbackResult> {
    return { receiptId: receipt.id || randomUUID(), rolledBack: false, restoredPaths: [], warnings: ['Nothing was applied.'] }
  }
}

