import { z } from 'zod'
import { bridgeProjectService } from '../../utils/bridge.js'

/** 项目登记参数，只接受现有目录。 */
const requestSchema = z.object({ path: z.string().trim().min(1), name: z.string().trim().min(1).optional() }).strict()

export default defineEventHandler(async event => {
    try {
        const input = requestSchema.parse(await readBody(event))
        return await bridgeProjectService.createProject(input.path, input.name)
    }
    catch (error) {
        const message = error instanceof Error ? error.message : '项目路径校验失败。'
        throw createError({ statusCode: 400, statusMessage: message })
    }
})
