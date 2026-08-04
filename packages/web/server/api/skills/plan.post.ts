import { MAX_CUSTOM_SKILL_DIRECTORIES, skillDecisionSchema, skillPlatformIdSchema, skillsBatchModeSchema } from '@askx/module-skills/skill-types'
import { z } from 'zod'
import { settingsStore } from '../../utils/settings.js'
import { skillsManager, throwSkillsApiError } from '../../utils/skills.js'

const requestSchema = z.object({
  platforms: z.array(skillPlatformIdSchema).min(1),
  customRoots: z.array(z.string().min(1)).max(MAX_CUSTOM_SKILL_DIRECTORIES).default([]),
  detectionFingerprint: z.string().min(1),
  settingsRevision: z.number().int().nonnegative(),
  decisions: z.array(skillDecisionSchema),
  mode: skillsBatchModeSchema.default('connect'),
  linkPlatforms: z.array(skillPlatformIdSchema).max(3).default([]),
  linkCustomRoots: z.array(z.string().min(1)).max(MAX_CUSTOM_SKILL_DIRECTORIES).default([]),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    const settings = await settingsStore.read()
    if (settings.revision !== input.settingsRevision) throw new Error('共享设置已经变化，请重新扫描。')
    return await skillsManager.planOnboarding(input)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
