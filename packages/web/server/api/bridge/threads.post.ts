import { z } from 'zod'
import { bridgeThreadSessionManager } from '../../utils/bridge.js'
import { getBridgeGroupService } from '../../utils/bridge-settings.js'

/** 新会话必须显式选择项目目录。 */
const bodySchema = z.object({ projectPath: z.string().min(1), chatId: z.string().min(1) })

export default defineEventHandler(async event => {
    try {
        const input = bodySchema.parse(await readBody(event))
        return await (await getBridgeGroupService()).createThread(input.chatId, input.projectPath, path => bridgeThreadSessionManager.startThread(path))
    }
    catch (error) {
        throw createError({ statusCode: 409, statusMessage: error instanceof Error ? error.message : 'Bridge chat unavailable' })
    }
})
