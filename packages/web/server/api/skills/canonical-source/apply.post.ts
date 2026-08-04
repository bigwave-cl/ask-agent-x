import { canonicalSourceMutationPlanSchema } from '@askx/module-skills/canonical-source-manager'
import type { CanonicalSourceMutationReceipt } from '@askx/module-skills/canonical-source-manager'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 统一源二次操作执行请求 schema。 */
const requestSchema = z.object({
  plan: canonicalSourceMutationPlanSchema,
  consent: z.object({
    planHash: z.string().min(1),
    confirmedAt: z.string().datetime(),
  }),
})

export default defineEventHandler(async (event): Promise<CanonicalSourceMutationReceipt> => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.applyCanonicalSource(input.plan, input.consent)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
