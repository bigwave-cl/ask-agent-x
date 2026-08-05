import { systemSkillRepairPlanSchema } from '@askx/module-skills/builtin-skill-manager'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

const requestSchema = z.object({
  plan: systemSkillRepairPlanSchema,
  consent: z.object({ planHash: z.string().min(1), confirmedAt: z.string().datetime() }),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.applySystemSkillRepair(input.plan, input.consent)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
