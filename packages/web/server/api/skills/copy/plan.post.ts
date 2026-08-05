import { MAX_SKILL_COPY_UNITS, skillCopySelectionSchema } from '@askx/module-skills/skill-types'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 批量 Skill 同步计划请求。 */
const requestSchema = z.object({
  selections: z.array(skillCopySelectionSchema).min(1).max(MAX_SKILL_COPY_UNITS),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.planSkillCopyBatch(input.selections)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
