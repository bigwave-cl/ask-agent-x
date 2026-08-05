import { customLinkActionSchema } from '@askx/module-skills/skill-types'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 自定义目录软链计划请求 schema。 */
const requestSchema = z.object({
  bindingId: z.string().min(1),
  action: customLinkActionSchema,
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.planCustomLink(input.bindingId, input.action)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
