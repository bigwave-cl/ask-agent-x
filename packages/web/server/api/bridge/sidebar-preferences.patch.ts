import { BridgeRelationsConflictError, BridgeSidebarPreferenceValidationError, bridgeSidebarPreferenceChangeSchema } from '@askx/core/bridge-relations'
import { z } from 'zod'
import { getBridgeGroupService } from '../../utils/bridge-settings.js'

/** 客户端只提交一个显示操作及其依据的版本。 */
const inputSchema = z.object({
    revision: z.number().int().nonnegative(),
    operation: bridgeSidebarPreferenceChangeSchema,
}).strict()

/** 通过关系服务原子保存偏好。冲突由客户端重新读取后处理。 */
export default defineEventHandler(async event => {
    const input = await readValidatedBody(event, body => inputSchema.parse(body))
    try {
        const { revision, sidebarPreferences } = await (await getBridgeGroupService()).updateSidebarPreferences(input.operation, input.revision)
        return { revision, preferences: sidebarPreferences ?? null }
    }
    catch (error) {
        if (error instanceof BridgeRelationsConflictError) throw createError({ statusCode: 409, statusMessage: error.message })
        if (error instanceof BridgeSidebarPreferenceValidationError) throw createError({ statusCode: 400, statusMessage: error.message })
        throw error
    }
})
