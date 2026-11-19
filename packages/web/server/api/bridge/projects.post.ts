import { z } from 'zod'
import { bridgeProjectService } from '../../utils/bridge.js'

/** 项目登记参数，只接受现有目录。 */
const requestSchema = z.object({ path: z.string().min(1), name: z.string().trim().min(1).optional() })

export default defineEventHandler(async event => {
    const input = requestSchema.parse(await readBody(event))
    return bridgeProjectService.createProject(input.path, input.name)
})
