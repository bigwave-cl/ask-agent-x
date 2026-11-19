import { z } from 'zod'
import { bridgeThreadSessionManager } from '../../../../utils/bridge.js'

export default defineEventHandler(async event => {
    const threadId = z.string().min(1).max(256).parse(getRouterParam(event, 'threadId'))
    try {
        return { active: await bridgeThreadSessionManager.isTurnActive(threadId) }
    }
    catch (error) {
        throw createError({ statusCode: 409, statusMessage: error instanceof Error ? error.message : 'Bridge chat unavailable' })
    }
})
