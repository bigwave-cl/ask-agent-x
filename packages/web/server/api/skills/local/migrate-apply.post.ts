import { localSkillMigrationPlanSchema } from '@askx/module-skills/local-skill-manager'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

const requestSchema = z.object({
  plan: localSkillMigrationPlanSchema,
  consent: z.object({ planHash: z.string().min(1), confirmedAt: z.string().datetime() }),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.applyLocalSkillMigration(input.plan, input.consent)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
