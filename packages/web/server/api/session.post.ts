import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const sessionRequestSchema = z.object({ token: z.string().min(1).max(512) })

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const expectedToken = config.askxSessionToken
  if (!expectedToken) throw createError({ statusCode: 503, statusMessage: 'Local session is not configured' })

  const body = sessionRequestSchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'A token is required' })

  const supplied = Buffer.from(body.data.token)
  const expected = Buffer.from(expectedToken)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid local session' })
  }

  setCookie(event, 'askx_session', expectedToken, { httpOnly: true, sameSite: 'strict', path: '/' })
  return { ok: true }
})
