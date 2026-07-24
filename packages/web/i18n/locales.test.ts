import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

function messageKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value)
    .flatMap(([key, child]) => messageKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort()
}

describe('Nuxt i18n locale resources', () => {
  it('keeps English and Simplified Chinese message keys in sync', () => {
    expect(messageKeys(en)).toEqual(messageKeys(zhCN))
  })
})
