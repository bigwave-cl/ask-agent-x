import { canonicalSourceActionSchema } from '@askx/module-skills/canonical-source-manager'
import type { CanonicalSourceMutationPlan } from '@askx/module-skills/canonical-source-manager'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 统一源二次操作计划请求 schema。 */
const requestSchema = z.object({
  action: canonicalSourceActionSchema,
  backupVersion: z.string().min(1).optional(),
})

export default defineEventHandler(async (event): Promise<CanonicalSourceMutationPlan> => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.planCanonicalSource(input.action, input.backupVersion)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
