import { z } from 'zod'
import { BridgeRelationsConflictError } from '@askx/core/bridge-relations'
import { getBridgeGroupService } from '../../../utils/bridge-settings.js'

/** 当前项目切换请求。 */
const inputSchema = z.object({ chatId: z.string().min(1), projectPath: z.string().min(1), revision: z.number().int().nonnegative() }).strict()

/** 将一个历史项目激活为群组当前项目。 */
export default defineEventHandler(async event => {
    const input = inputSchema.parse(await readBody(event))
    try {
        return await (await getBridgeGroupService()).activateProject(input.chatId, input.projectPath, input.revision)
    }
    catch (error) {
        if (error instanceof BridgeRelationsConflictError) throw createError({ statusCode: 409, statusMessage: error.message })
        throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Could not activate project' })
    }
})
