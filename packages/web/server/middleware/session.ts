export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  const legacyDemoModule = ({
    '/demo/overview': 'overview',
    '/demo/button': 'button',
    '/demo/components': 'button',
    '/demo/theming': 'theming',
  } as const)[path as '/demo/overview' | '/demo/button' | '/demo/components' | '/demo/theming']

  if (legacyDemoModule && event.method === 'GET') {
    const query = new URLSearchParams(getRequestURL(event).searchParams)
    query.set('module', legacyDemoModule)
    query.delete('token')
    return sendRedirect(event, `/demo?${query.toString()}`, 302)
  }

  const isPublicDemo = path === '/demo' || path.startsWith('/demo/')
  if (isPublicDemo) return

  const config = useRuntimeConfig(event)
  const sessionToken = config.askxSessionToken
  if (!sessionToken) throw createError({ statusCode: 503, statusMessage: 'Local session is not configured' })

  const host = getRequestHeader(event, 'host') ?? ''
  const origin = getRequestHeader(event, 'origin')
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(host) || (origin && origin !== `http://${host}`)) {
    throw createError({ statusCode: 403, statusMessage: 'Origin not allowed' })
  }

  if (path === '/api/session' && event.method === 'POST') return

  const token = getQuery(event).token ?? getRequestHeader(event, 'x-askx-token') ?? getCookie(event, 'askx_session')
  if (token === sessionToken) {
    if (getQuery(event).token === sessionToken) {
      setCookie(event, 'askx_session', sessionToken, { httpOnly: true, sameSite: 'strict', path: '/' })
    }
    if (path === '/login' && event.method === 'GET') return sendRedirect(event, '/', 302)
    return
  }

  if (path.startsWith('/api/')) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid local session' })
  }

  const isPublicAsset = path.startsWith('/_nuxt/') || path.startsWith('/__nuxt') || /\.[a-z0-9]+$/i.test(path)
  if (!isPublicAsset && path !== '/login') return sendRedirect(event, '/login', 302)
})
