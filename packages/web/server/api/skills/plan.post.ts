import { MAX_CUSTOM_SKILL_DIRECTORIES, skillDecisionSchema, skillManagementChoiceSchema, skillPlatformIdSchema, skillsBatchModeSchema } from '@askx/module-skills/skill-types'
import { z } from 'zod'
import { settingsStore } from '../../utils/settings.js'
import { skillsManager, throwSkillsApiError } from '../../utils/skills.js'

const requestSchema = z.object({
    platforms: z.array(skillPlatformIdSchema).max(3),
    customRoots: z.array(z.string().min(1)).max(MAX_CUSTOM_SKILL_DIRECTORIES).default([]),
    detectionFingerprint: z.string().min(1),
    settingsRevision: z.number().int().nonnegative(),
    decisions: z.array(skillDecisionSchema),
    managementChoices: z.array(skillManagementChoiceSchema).default([]),
    mode: skillsBatchModeSchema.default('connect'),
    configurationStrategy: z.enum(['replace', 'merge', 'preserve']).default('replace'),
    linkPlatforms: z.array(skillPlatformIdSchema).max(3).default([]),
    takeoverPlatforms: z.array(skillPlatformIdSchema).max(3).default([]),
    linkCustomRoots: z.array(z.string().min(1)).max(MAX_CUSTOM_SKILL_DIRECTORIES).default([]),
}).superRefine((input, context) => {
    if (!input.platforms.length && !input.customRoots.length && !input.linkPlatforms.length && !input.linkCustomRoots.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['platforms'], message: '扫描来源或软链目标至少需要一项。' })
    }
})

export default defineEventHandler(async event => {
    try {
        const input = requestSchema.parse(await readBody(event))
        const settings = await settingsStore.read()
        if (settings.revision !== input.settingsRevision) throw new Error('共享设置已经变化，请重新扫描。')
        return await skillsManager.planOnboarding(input)
    }
    catch (error) {
        throwSkillsApiError(error)
    }
})
