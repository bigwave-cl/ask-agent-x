import { platformLinkPlanSchema } from '@askx/module-skills/skill-types'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 平台软链应用请求 schema。 */
const requestSchema = z.object({
  plan: platformLinkPlanSchema,
  consent: z.object({
    planHash: z.string().min(1),
    confirmedAt: z.string().datetime(),
  }),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.applyPlatformLink(input.plan, input.consent)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
