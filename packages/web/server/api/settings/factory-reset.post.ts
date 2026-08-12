import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { SettingsConflictError } from '@askx/core'
import { z } from 'zod'
import { settingsStore } from '../../utils/settings.js'
import { skillsManager, throwSkillsApiError } from '../../utils/skills.js'

/** 恢复初始状态请求校验。 */
const requestSchema = z.object({
    revision: z.number().int().nonnegative(),
    confirmation: z.literal('我确认重置'),
})

/** 恢复初始状态后返回的共享设置。 */
export default defineEventHandler(async (event) => {
    const input = requestSchema.parse(await readBody(event))
    const current = await settingsStore.read()
    if (current.revision !== input.revision) {
        throw createError({ statusCode: 409, statusMessage: 'Settings changed', data: { current } })
    }

    try {
        const manifest = await skillsManager.manifestStore.read()
        if (manifest?.initializedAt) {
            const clearPlan = await skillsManager.planCanonicalSource('clear', undefined, ['links', 'skills'], false)
            await skillsManager.applyCanonicalSource(clearPlan, {
                planHash: clearPlan.hash,
                confirmedAt: new Date().toISOString(),
            })
        }

        const dataDir = skillsManager.context.dataDir
        await Promise.all([
            rm(join(dataDir, 'skills'), { recursive: true, force: true }),
            rm(join(dataDir, 'local-skills'), { recursive: true, force: true }),
            rm(join(dataDir, 'backups'), { recursive: true, force: true }),
            rm(join(dataDir, 'transactions'), { recursive: true, force: true }),
            rm(join(dataDir, 'skills-manifest.json'), { force: true }),
        ])

        const resetPlan = await settingsStore.createResetPlan()
        return await settingsStore.applyResetPlan(resetPlan, {
            planHash: resetPlan.hash,
            confirmedAt: new Date().toISOString(),
        }, 'web')
    }
    catch (error) {
        if (error instanceof SettingsConflictError) {
            throw createError({ statusCode: 409, statusMessage: error.message, data: { current: error.current } })
        }
        throwSkillsApiError(error)
    }
})
