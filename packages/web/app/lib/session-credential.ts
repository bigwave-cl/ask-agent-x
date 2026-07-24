export type SessionCredentialKind = 'empty' | 'token' | 'url' | 'url-without-token'

export interface SessionCredential {
  kind: SessionCredentialKind
  token: string
}

function toSessionUrl(value: string): URL | null {
  const localAddress = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(value)
  const explicitUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
  if (!localAddress && !explicitUrl) return null

  try {
    return new URL(localAddress ? `http://${value}` : value)
  } catch {
    return null
  }
}

function tokenFromHash(hash: string): string {
  const value = hash.replace(/^#/, '')
  const query = value.includes('?') ? value.slice(value.indexOf('?') + 1) : value
  return new URLSearchParams(query).get('token')?.trim() ?? ''
}

export function parseSessionCredential(input: string): SessionCredential {
  const value = input.trim()
  if (!value) return { kind: 'empty', token: '' }

  const url = toSessionUrl(value)
  if (!url) return { kind: 'token', token: value }

  const token = url.searchParams.get('token')?.trim() || tokenFromHash(url.hash)
  return token
    ? { kind: 'url', token }
    : { kind: 'url-without-token', token: '' }
}
