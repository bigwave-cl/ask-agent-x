import { z } from 'zod'
import { localOpenTargetIds } from '../../../shared/local-open.js'
import { openLocalPath } from '../../utils/localPathOpener.js'

/** 本地路径打开请求校验。 */
const requestSchema = z.object({
  path: z.string().min(1).max(4096),
  target: z.enum(localOpenTargetIds),
})

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return { path: await openLocalPath(input.target, input.path), target: input.target }
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法打开本地路径。'
    throw createError({ statusCode: 400, statusMessage: message })
  }
})
