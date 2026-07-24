import { describe, expect, it } from 'vitest'
import { parseSessionCredential } from './session-credential'

describe('parseSessionCredential', () => {
  it('accepts a raw token', () => {
    expect(parseSessionCredential('  askx-local-dev  ')).toEqual({ kind: 'token', token: 'askx-local-dev' })
  })

  it('extracts a token from an absolute startup URL', () => {
    expect(parseSessionCredential('http://127.0.0.1:4242/?token=askx-local-dev')).toEqual({ kind: 'url', token: 'askx-local-dev' })
  })

  it('extracts an encoded token from a localhost URL', () => {
    expect(parseSessionCredential('localhost:4242/?token=hello%20world')).toEqual({ kind: 'url', token: 'hello world' })
  })

  it('supports token parameters in hash routes', () => {
    expect(parseSessionCredential('http://localhost:4242/#/login?token=from-hash')).toEqual({ kind: 'url', token: 'from-hash' })
  })

  it('distinguishes an URL without a token', () => {
    expect(parseSessionCredential('http://localhost:4242/login')).toEqual({ kind: 'url-without-token', token: '' })
  })

  it('reports empty input', () => {
    expect(parseSessionCredential('  ')).toEqual({ kind: 'empty', token: '' })
  })
})
