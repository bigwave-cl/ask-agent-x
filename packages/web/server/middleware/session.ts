import { legacyDemoRedirectLocation, localizePath, parseLocalizedPath } from '../utils/locale-path.js'
import { isPublicAssetRequest } from '../utils/publicAsset.js'

export default defineEventHandler((event) => {
  const requestUrl = getRequestURL(event)
  const requestPath = requestUrl.pathname
  const localized = parseLocalizedPath(requestPath)
  const legacyDemoLocation = legacyDemoRedirectLocation(requestUrl)

  if (legacyDemoLocation && event.method === 'GET') {
    return sendRedirect(event, legacyDemoLocation, 302)
  }

  const isPublicDemo = localized.path === '/demo' || localized.path.startsWith('/demo/')
  if (isPublicDemo) return

  const host = getRequestHeader(event, 'host') ?? ''
  const origin = getRequestHeader(event, 'origin')
  const isPublicAsset = isPublicAssetRequest(requestPath, event.method)
  const isInternalPublicAsset = isPublicAsset && !origin && /^(?:127\.0\.0\.1|localhost)$/.test(host)
  if ((!/^(?:127\.0\.0\.1|localhost):\d+$/.test(host) && !isInternalPublicAsset) || (origin && origin !== `http://${host}`)) {
    throw createError({ statusCode: 403, statusMessage: 'Origin not allowed' })
  }

  if (isPublicAsset) return

  const config = useRuntimeConfig(event)
  const sessionToken = config.askxSessionToken
  if (!sessionToken) throw createError({ statusCode: 503, statusMessage: 'Local session is not configured' })

  if (requestPath === '/api/session' && event.method === 'POST') return

  const token = getQuery(event).token ?? getRequestHeader(event, 'x-askx-token') ?? getCookie(event, 'askx_session')
  if (token === sessionToken) {
    if (getQuery(event).token === sessionToken) {
      setCookie(event, 'askx_session', sessionToken, { httpOnly: true, sameSite: 'strict', path: '/' })
    }
    if (localized.path === '/login' && event.method === 'GET') {
      return sendRedirect(event, localizePath('/', localized.locale), 302)
    }
    return
  }

  if (requestPath.startsWith('/api/')) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid local session' })
  }

  if (localized.path !== '/login') {
    return sendRedirect(event, localizePath('/login', localized.locale), 302)
  }
})
