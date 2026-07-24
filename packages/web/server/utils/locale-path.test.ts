import { describe, expect, it } from 'vitest'
import { legacyDemoRedirectLocation, localizePath, parseLocalizedPath } from './locale-path.js'

describe('localized Web paths', () => {
  it.each([
    ['/', 'zh-CN', '/', ''],
    ['/demo', 'zh-CN', '/demo', ''],
    ['/en', 'en', '/', '/en'],
    ['/en/login', 'en', '/login', '/en'],
    ['/english/demo', 'zh-CN', '/english/demo', ''],
    ['/api/settings', 'zh-CN', '/api/settings', ''],
    ['/_nuxt/app.js', 'zh-CN', '/_nuxt/app.js', ''],
  ] as const)('parses %s', (input, locale, path, prefix) => {
    expect(parseLocalizedPath(input)).toEqual({ locale, path, prefix })
  })

  it('adds only the English prefix', () => {
    expect(localizePath('/', 'zh-CN')).toBe('/')
    expect(localizePath('/settings', 'zh-CN')).toBe('/settings')
    expect(localizePath('/', 'en')).toBe('/en')
    expect(localizePath('/settings', 'en')).toBe('/en/settings')
  })

  it('redirects localized legacy Demo routes and strips token values', () => {
    expect(legacyDemoRedirectLocation(new URL('http://127.0.0.1/demo/button?foo=1&token=secret')))
      .toBe('/demo?foo=1&module=components')
    expect(legacyDemoRedirectLocation(new URL('http://127.0.0.1/en/demo/theming?secKey=color')))
      .toBe('/en/demo?secKey=color&module=theming')
  })

  it('ignores current and unknown Demo paths', () => {
    expect(legacyDemoRedirectLocation(new URL('http://127.0.0.1/demo?module=components'))).toBeUndefined()
    expect(legacyDemoRedirectLocation(new URL('http://127.0.0.1/fr/demo/button'))).toBeUndefined()
  })
})
