import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../utils/skills.js'

/** Skill 详情查询参数。 */
const querySchema = z.object({ skillId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  try {
    const input = querySchema.parse(getQuery(event))
    return await skillsManager.inspectSkill(input.skillId)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
