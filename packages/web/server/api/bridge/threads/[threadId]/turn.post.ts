import { z } from 'zod'
import { bridgeThreadSessionManager } from '../../../../utils/bridge.js'

const bodySchema = z.object({ prompt: z.string().trim().min(1).max(20_000) })

export default defineEventHandler(async event => {
    const threadId = z.string().min(1).max(256).parse(getRouterParam(event, 'threadId'))
    const input = bodySchema.parse(await readBody(event))
    try {
        return await bridgeThreadSessionManager.startTurn(threadId, input.prompt)
    }
    catch (error) {
        throw createError({ statusCode: 409, statusMessage: error instanceof Error ? error.message : 'Bridge chat unavailable' })
    }
})
