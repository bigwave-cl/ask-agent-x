import { z } from 'zod'
import type { SkillsRollbackPlan } from '@askx/module-skills/skill-types'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** Skills 回滚计划请求 schema。 */
const requestSchema = z.object({ receiptId: z.string().uuid() })

export default defineEventHandler(async (event): Promise<SkillsRollbackPlan> => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.planRollbackReceipt(input.receiptId)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
