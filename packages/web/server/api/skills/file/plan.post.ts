import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** Skill 文件更新计划请求。 */
const requestSchema = z.object({
  skillId: z.string().uuid(),
  path: z.string().min(1),
  nextContent: z.string().max(524_288),
  previousContentHash: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.planSkillFileUpdate(input.skillId, input.path, input.nextContent, input.previousContentHash)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
