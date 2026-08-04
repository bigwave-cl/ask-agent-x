import { skillCustomRootRemovalPlanSchema } from '@askx/module-skills/skill-types'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 自定义扫描来源移除应用请求。 */
const requestSchema = z.object({
  plan: skillCustomRootRemovalPlanSchema,
  consent: z.object({
    planHash: z.string().min(1),
    confirmedAt: z.string().datetime(),
  }),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.applyCustomRootRemoval(input.plan, input.consent)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
