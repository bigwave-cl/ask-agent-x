import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../utils/skills.js'

const requestSchema = z.object({
  plan: z.object({
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    receiptId: z.string().uuid(),
    receiptPlanHash: z.string().min(1),
    manifestRevision: z.number().int().nonnegative(),
    hash: z.string().min(1),
  }),
  consent: z.object({
    planHash: z.string().min(1),
    confirmedAt: z.string().datetime(),
  }),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.applyRollbackReceipt(input.plan, input.consent)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
