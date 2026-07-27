import { describe, expect, it } from 'vitest'
import { isPublicAssetRequest } from './publicAsset'

describe('isPublicAssetRequest', () => {
  it.each([
    '/_nuxt/app.js',
    '/__nuxt_error',
    '/_i18n/build/zh-CN/messages.json',
    '/_askx/icon/askx-actions.json',
    '/favicon.ico',
  ])('allows GET %s', (path) => {
    expect(isPublicAssetRequest(path, 'GET')).toBe(true)
  })

  it.each([
    ['POST', '/_askx/icon/askx-actions.json'],
    ['GET', '/_askx/icons/askx-actions.json'],
    ['GET', '/_askx/icon-malicious/askx-actions.json'],
    ['GET', '/api/settings'],
  ])('rejects %s %s', (method, path) => {
    expect(isPublicAssetRequest(path, method)).toBe(false)
  })
})
