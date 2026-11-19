import { z } from 'zod'
import { BridgeRelationsConflictError, bridgeRelationsInputSchema } from '@askx/core/bridge-relations'
import { getBridgeGroupService } from '../../utils/bridge-settings.js'

/** 允许客户端提交版本头，关系集合仍由 Core 验证。 */
const inputSchema = z.object({ version: z.literal(1).optional(), revision: z.number().int().nonnegative(), groups: z.unknown(), projectGroups: z.unknown(), threadGroups: z.unknown() }).strict()
export default defineEventHandler(async event => {
    const input = inputSchema.parse(await readBody(event))
    const relations = bridgeRelationsInputSchema.parse({ groups: input.groups, projectGroups: input.projectGroups, threadGroups: input.threadGroups })
    try { return await (await getBridgeGroupService()).save(relations, input.revision) }
    catch (error) {
        if (error instanceof BridgeRelationsConflictError) throw createError({ statusCode: 409, statusMessage: error.message })
        throw createError({ statusCode: 400, statusMessage: 'Could not save associations; reload projects and sessions' })
    }
})
