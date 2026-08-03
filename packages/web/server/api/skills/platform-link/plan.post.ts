import { platformLinkActionSchema, skillPlatformIdSchema } from '@askx/module-skills/skill-types'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 平台软链计划请求 schema。 */
const requestSchema = z.object({
  platform: skillPlatformIdSchema,
  action: platformLinkActionSchema,
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.planPlatformLink(input.platform, input.action)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
