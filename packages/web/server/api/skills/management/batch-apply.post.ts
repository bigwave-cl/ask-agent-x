import type { SkillManagementBatchPlan } from '@askx/module-skills/skill-management-manager'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 统计页批量管理执行请求。 */
const requestSchema = z.object({
  plan: z.unknown(),
  consent: z.object({ planHash: z.string().min(1), confirmedAt: z.string().datetime() }),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.applySkillManagementBatch(
      input.plan as SkillManagementBatchPlan,
      input.consent,
    )
  } catch (error) {
    throwSkillsApiError(error)
  }
})
