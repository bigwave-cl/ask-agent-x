import { skillUsagePlanSchema } from '@askx/module-skills/skill-manager-registry'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

const requestSchema = z.object({
  plan: skillUsagePlanSchema,
  consent: z.object({ planHash: z.string().min(1), confirmedAt: z.string().datetime() }),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.applyUsage(input.plan, input.consent)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
