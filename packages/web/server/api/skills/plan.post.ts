import { skillDecisionSchema, skillPlatformIdSchema } from '@askx/module-skills/skill-types'
import { z } from 'zod'
import { settingsStore } from '../../utils/settings.js'
import { skillsManager, throwSkillsApiError } from '../../utils/skills.js'

const requestSchema = z.object({
  platforms: z.array(skillPlatformIdSchema).min(1),
  customRoots: z.array(z.string().min(1)).max(20).default([]),
  detectionFingerprint: z.string().min(1),
  settingsRevision: z.number().int().nonnegative(),
  decisions: z.array(skillDecisionSchema),
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
