import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 自定义扫描来源移除计划请求。 */
const requestSchema = z.object({ rootId: z.string().min(1) })

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.planCustomRootRemoval(input.rootId)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
