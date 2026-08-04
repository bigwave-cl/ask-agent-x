import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../utils/skills.js'

/** Skill 可预览文本文件的读取查询参数。 */
const querySchema = z.object({
  skillId: z.string().uuid(),
  path: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  try {
    const input = querySchema.parse(getQuery(event))
    return await skillsManager.readSkillFile(input.skillId, input.path)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
