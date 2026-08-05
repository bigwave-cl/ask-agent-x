import { skillCopyBatchPlanSchema } from '@askx/module-skills/skill-types'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 批量 Skill 同步应用请求。 */
const requestSchema = z.object({
  plan: skillCopyBatchPlanSchema,
  consent: z.object({
    planHash: z.string().min(1),
    confirmedAt: z.string().datetime(),
  }),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.applySkillCopyBatch(input.plan, input.consent)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
