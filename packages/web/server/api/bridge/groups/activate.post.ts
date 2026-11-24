import { z } from 'zod'
import { BridgeRelationsConflictError } from '@askx/core/bridge-relations'
import { BridgeAssociationValidationError } from '@askx/module-feishu-bridge/group-service'
import { getBridgeGroupService } from '../../../utils/bridge-settings.js'

/** 项目激活状态请求；旧调用缺省仍表示激活。 */
const inputSchema = z.object({ chatId: z.string().min(1), projectPath: z.string().min(1), revision: z.number().int().nonnegative(), active: z.boolean().default(true) }).strict()

/** 统一提交项目激活状态，保留关联和历史会话。 */
export default defineEventHandler(async event => {
    /** 边界归一化后的开关意图。 */
    const input = inputSchema.parse(await readBody(event))
    try {
        return await (await getBridgeGroupService()).setProjectActive(input.chatId, input.projectPath, input.active, input.revision)
    }
    catch (error) {
        if (error instanceof BridgeRelationsConflictError) throw createError({ statusCode: 409, statusMessage: error.message })
        if (error instanceof BridgeAssociationValidationError) {
            throw createError({ statusCode: 400, statusMessage: error.message, data: { code: error.code, projectPath: error.projectPath, threadId: error.threadId } })
        }
        throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Could not update project activation' })
    }
})
