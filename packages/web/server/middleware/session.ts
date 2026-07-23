export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const sessionToken = config.askxSessionToken
  if (!sessionToken) throw createError({ statusCode: 503, statusMessage: 'Local session is not configured' })

  const host = getRequestHeader(event, 'host') ?? ''
  const origin = getRequestHeader(event, 'origin')
  if (!/^127\.0\.0\.1:\d+$/.test(host) || (origin && origin !== `http://${host}`)) {
    throw createError({ statusCode: 403, statusMessage: 'Origin not allowed' })
  }

  const token = getQuery(event).token ?? getRequestHeader(event, 'x-askx-token') ?? getCookie(event, 'askx_session')
  if (token !== sessionToken) throw createError({ statusCode: 401, statusMessage: 'Invalid local session' })

  if (getQuery(event).token === sessionToken) {
    setCookie(event, 'askx_session', sessionToken, { httpOnly: true, sameSite: 'strict', path: '/' })
  }
})

