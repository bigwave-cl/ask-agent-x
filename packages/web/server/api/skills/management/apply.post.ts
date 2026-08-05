import { skillManagementPlanSchema } from '@askx/module-skills/skill-management-manager'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 统计页快捷管理执行请求。 */
const requestSchema = z.object({
  plan: skillManagementPlanSchema,
  consent: z.object({ planHash: z.string().min(1), confirmedAt: z.string().datetime() }),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.applySkillManagement(input.plan, input.consent)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
