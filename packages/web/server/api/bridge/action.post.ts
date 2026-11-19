import { z } from 'zod'
import { publicBridgeSettings } from '@askx/core/bridge-settings'
import { settingsStore } from '../../utils/settings.js'
import { bridgeModule, bridgeServiceManager, bridgeThreadSessionManager } from '../../utils/bridge.js'

/** 服务按钮的即时命令，只消费已经保存的配置版本。 */
const requestSchema = z.object({
    action: z.enum(['start', 'stop', 'restart', 'update']),
    revision: z.number().int().nonnegative().optional(),
    confirmation: z.literal(true),
})

export default defineEventHandler(async event => {
    const input = requestSchema.parse(await readBody(event))
    try {
        const plan = await bridgeModule.plan(input.action, { expectedRevision: input.revision })
        await bridgeModule.apply(plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })
        const status = await bridgeServiceManager.status()
        if (input.action !== 'start') bridgeThreadSessionManager.stop()
        return { operationId: status.operationId, status }
    }
    catch (error) {
        if (error instanceof Error && error.message.startsWith('Settings changed at revision')) {
            throw createError({ statusCode: 409, statusMessage: error.message, data: { current: publicBridgeSettings(await settingsStore.read()) } })
        }
        throw createError({ statusCode: 400, statusMessage: 'Bridge action failed; check the saved settings and service status' })
    }
})
