import { z } from 'zod'
import { bridgeThreadSessionManager } from '../../../../utils/bridge.js'

const querySchema = z.object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
})

export default defineEventHandler(async event => {
    const threadId = z.string().min(1).max(256).parse(getRouterParam(event, 'threadId'))
    try {
        const query = querySchema.parse(getQuery(event))
        return await bridgeThreadSessionManager.readThread(threadId, query.cursor, query.limit)
    }
    catch (error) {
        throw createError({ statusCode: 409, statusMessage: error instanceof Error ? error.message : 'Bridge chat unavailable' })
    }
})
