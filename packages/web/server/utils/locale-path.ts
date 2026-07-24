export type WebLocale = 'zh-CN' | 'en'

export interface LocalizedPath {
  locale: WebLocale
  path: string
  prefix: '' | '/en'
}

const legacyDemoModules: Record<string, string> = {
  '/demo/overview': 'overview',
  '/demo/button': 'components',
  '/demo/components': 'components',
  '/demo/theming': 'theming',
}

export function parseLocalizedPath(pathname: string): LocalizedPath {
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    return {
      locale: 'en',
      path: pathname.slice(3) || '/',
      prefix: '/en',
    }
  }

  return { locale: 'zh-CN', path: pathname, prefix: '' }
}

export function localizePath(path: string, locale: WebLocale): string {
  if (locale === 'zh-CN') return path
  return path === '/' ? '/en' : `/en${path}`
}

export function legacyDemoRedirectLocation(url: URL): string | undefined {
  const localized = parseLocalizedPath(url.pathname)
  const moduleId = legacyDemoModules[localized.path]
  if (!moduleId) return

  const query = new URLSearchParams(url.searchParams)
  query.set('module', moduleId)
  query.delete('token')
  return `${localizePath('/demo', localized.locale)}?${query.toString()}`
}
