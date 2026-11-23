import { expect, test, vi } from 'vitest'
import { readFeishuProfile } from './feishu-profile.js'

test('caches true user names separately by SDK and sender, without confusing mentioned bot', async () => {
  const request = vi.fn(async ({ url }: Record<string, unknown>) => ({ code: 0, data: { user: { name: String(url).endsWith('alice') ? 'Alice' : 'Bob', avatar: { avatar_72: 'https://example.test/avatar' } } } }))
  const client = { request }
  expect(await readFeishuProfile(client, 'alice')).toMatchObject({ displayName: 'Alice' })
  expect(await readFeishuProfile(client, 'bob')).toMatchObject({ displayName: 'Bob' })
  await readFeishuProfile(client, 'alice')
  expect(request).toHaveBeenCalledTimes(2)
  await readFeishuProfile({ request }, 'alice')
  expect(request).toHaveBeenCalledTimes(3)
})

test('permission failure has no fabricated name and expires quickly; request timeout is bounded', async () => {
  vi.useFakeTimers()
  try {
    const request = vi.fn().mockResolvedValueOnce({ code: 999 }).mockResolvedValue({ code: 0, data: { user: { name: 'Recovered' } } })
    const client = { request }
    expect(await readFeishuProfile(client, 'sender')).toEqual({})
    await vi.advanceTimersByTimeAsync(5001)
    expect(await readFeishuProfile(client, 'sender')).toMatchObject({ displayName: 'Recovered' })
    const slow = readFeishuProfile({ request: () => new Promise(() => {}) }, 'slow', 20)
    await vi.advanceTimersByTimeAsync(21)
    expect(await slow).toEqual({})
  } finally { vi.useRealTimers() }
})

test('malformed profile fields are discarded at the protocol boundary', async () => {
  const client = { request: async () => ({ code: 0, data: { user: { name: 123, avatar: { avatar_72: ['https://example.test'] } } } }) }
  expect(await readFeishuProfile(client, 'sender')).toEqual({})
})
