import { describe, expect, it } from 'vitest'
import { parseLocalIconRequest } from './localIcon'

describe('parseLocalIconRequest', () => {
  it('parses an exact local collection request', () => {
    expect(parseLocalIconRequest('/_askx/icon/askx-actions.json', 'GET', 'copy,external-link,copy')).toEqual({
      category: 'actions',
      prefix: 'askx-actions',
      icons: ['copy', 'external-link'],
    })
  })

  it('parses the local platform logo collection', () => {
    expect(parseLocalIconRequest('/_askx/icon/askx-platforms.json', 'GET', 'chatgpt-codex,claude-code,cursor')).toEqual({
      category: 'platforms',
      prefix: 'askx-platforms',
      icons: ['chatgpt-codex', 'claude-code', 'cursor'],
    })
  })

  it.each([
    ['/api/settings', 'GET', 'copy'],
    ['/_askx/icon/askx-actions.json', 'POST', 'copy'],
    ['/_askx/icon/lucide.json', 'GET', 'copy'],
    ['/_askx/icon/askx-actions.json', 'GET', '../copy'],
    ['/_askx/icon/askx-actions.json', 'GET', undefined],
  ])('rejects %s %s', (path, method, icons) => {
    expect(parseLocalIconRequest(path, method, icons)).toBeNull()
  })
})
