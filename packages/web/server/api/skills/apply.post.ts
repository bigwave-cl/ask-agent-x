import { skillsBatchPlanSchema } from '@askx/module-skills/skill-types'
import { z } from 'zod'
import { settingsStore } from '../../utils/settings.js'
import { skillsManager, throwSkillsApiError } from '../../utils/skills.js'

const requestSchema = z.object({
  plan: skillsBatchPlanSchema,
  consent: z.object({
    planHash: z.string().min(1),
    confirmedAt: z.string().datetime(),
  }),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    if (input.consent.planHash !== input.plan.hash) throw new Error('用户授权与当前计划不匹配。')
    const settings = await settingsStore.read()
    return await skillsManager.applyOnboarding(input.plan, settings.revision)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
