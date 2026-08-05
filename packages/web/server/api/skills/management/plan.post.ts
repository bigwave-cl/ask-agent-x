import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 统计页快捷管理计划请求。 */
const requestSchema = z.object({
  recordId: z.string().uuid(),
  action: z.enum(['manage', 'remove']),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.planSkillManagement(input.recordId, input.action)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
