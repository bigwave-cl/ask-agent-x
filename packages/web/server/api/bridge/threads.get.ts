import { z } from 'zod'
import { bridgeThreadSessionManager } from '../../utils/bridge.js'

/** 项目会话查询参数。 */
const querySchema = z.object({ projectPath: z.string().min(1), cursor: z.string().min(1).max(512).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) })

export default defineEventHandler(async event => {
    try {
        const query = querySchema.parse(getQuery(event))
        return await bridgeThreadSessionManager.listThreads(query.cursor, query.limit, query.projectPath)
    }
    catch (error) {
        throw createError({ statusCode: 409, statusMessage: error instanceof Error ? error.message : 'Bridge chat unavailable' })
    }
})
