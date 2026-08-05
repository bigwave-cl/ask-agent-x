import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 统计页批量管理计划请求。 */
const requestSchema = z.object({
  selections: z.array(z.object({
    recordId: z.string().uuid(),
    action: z.enum(['manage', 'remove']),
  })).min(1).max(200),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.planSkillManagementBatch(input.selections)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
