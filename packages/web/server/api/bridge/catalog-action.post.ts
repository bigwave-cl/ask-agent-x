import { z } from 'zod'
import { bridgeCatalogActions } from '../../utils/bridge.js'

/** 所有目录写入必须明确确认，不接受额外字段。 */
const requestSchema = z.object({
    action: z.enum(['rename-project', 'remove-project', 'rename-thread', 'archive-thread']),
    projectPath: z.string().min(1),
    threadId: z.string().min(1).max(256).optional(),
    name: z.string().trim().min(1).max(256).optional(),
    confirmation: z.literal(true),
}).strict()

export default defineEventHandler(async event => {
    try {
        /** 已经过请求边界校验的用户输入。 */
        const { confirmation: _confirmation, ...input } = requestSchema.parse(await readBody(event))
        /** 模块 owner 的检测与计划结果。 */
        const plan = await bridgeCatalogActions.plan(input)
        await bridgeCatalogActions.apply(plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })
        return { ok: true }
    }
    catch (error) {
        throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Catalog action failed / 目录操作失败' })
    }
})
