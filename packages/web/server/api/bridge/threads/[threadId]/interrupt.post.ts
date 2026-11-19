import { z } from 'zod'
import { bridgeThreadSessionManager } from '../../../../utils/bridge.js'

const bodySchema = z.object({ turnId: z.string().min(1).max(256).optional() }).default({})

export default defineEventHandler(async event => {
    const threadId = z.string().min(1).max(256).parse(getRouterParam(event, 'threadId'))
    const input = bodySchema.parse(await readBody(event).catch(() => ({})))
    try {
        await bridgeThreadSessionManager.interrupt(threadId, input.turnId)
        return { ok: true }
    }
    catch (error) {
        throw createError({ statusCode: 409, statusMessage: error instanceof Error ? error.message : 'Bridge chat unavailable' })
    }
})
