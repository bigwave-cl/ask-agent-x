import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

const requestSchema = z.object({ skillId: z.string().min(1), targetScope: z.enum(['shared', 'local']).default('shared') })

export default defineEventHandler(async event => {
    try {
        const input = requestSchema.parse(await readBody(event))
        return await skillsManager.planLocalSkillMigration(input.skillId, input.targetScope)
    }
    catch (error) {
        throwSkillsApiError(error)
    }
})
