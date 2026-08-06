import { MAX_CUSTOM_SKILL_DIRECTORIES, skillPlatformIdSchema } from '@askx/module-skills/skill-types'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../utils/skills.js'

const requestSchema = z.object({
  platforms: z.array(skillPlatformIdSchema),
  customRoots: z.array(z.string().min(1)).max(MAX_CUSTOM_SKILL_DIRECTORIES).default([]),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.scan(input.platforms, input.customRoots)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
