import { customLinkPlanSchema } from '@askx/module-skills/skill-types'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 自定义目录软链应用请求 schema。 */
const requestSchema = z.object({
  plan: customLinkPlanSchema,
  consent: z.object({
    planHash: z.string().min(1),
    confirmedAt: z.string().datetime(),
  }),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.applyCustomLink(input.plan, input.consent)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
