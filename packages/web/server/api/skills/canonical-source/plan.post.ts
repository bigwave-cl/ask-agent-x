import { canonicalSourceActionSchema, clearModuleSchema } from '@askx/module-skills/canonical-source-manager'
import type { CanonicalSourceMutationPlan } from '@askx/module-skills/canonical-source-manager'
import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 统一源二次操作计划请求 schema。 */
const requestSchema = z.object({
    action: canonicalSourceActionSchema,
    backupVersion: z.string().min(1).optional(),
    clearModules: z.array(clearModuleSchema).min(1).max(2).optional(),
    createBackup: z.boolean().optional(),
    backupLabel: z.string().min(1).max(80).optional(),
})

export default defineEventHandler(async (event): Promise<CanonicalSourceMutationPlan> => {
    try {
        const input = requestSchema.parse(await readBody(event))
        return await skillsManager.planCanonicalSource(input.action, input.backupVersion, input.clearModules, input.createBackup, input.backupLabel)
    }
    catch (error) {
        throwSkillsApiError(error)
    }
})
