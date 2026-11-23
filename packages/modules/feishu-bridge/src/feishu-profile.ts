/** 飞书用户展示资料；缺失昵称时由调用方使用稳定 senderId。 */
export interface FeishuProfile {
  /** 已成功查询到的真实昵称。 */
  displayName?: string
  /** 已校验的 HTTPS 头像地址。 */
  avatarUrl?: string
}
/** 当前 SDK 应用身份，不将凭据复制到缓存。 */
interface ProfileClient {
  /** 使用既有权限查询资料。 */
  request(options: Record<string, unknown>): Promise<unknown>
}
/** 按 SDK 实例和用户隔离，失败只短暂缓存。 */
const profiles = new WeakMap<ProfileClient, Map<string, { until: number; promise: Promise<FeishuProfile> }>>()
/** 使用有界请求查询真实用户；权限失败不扩大权限也不伪造昵称。 */
export function readFeishuProfile(client: ProfileClient, senderId: string, timeoutMs = 1500): Promise<FeishuProfile> {
  if (!senderId) return Promise.resolve({})
  const cache = profiles.get(client) ?? new Map<string, { until: number; promise: Promise<FeishuProfile> }>()
  profiles.set(client, cache)
  const existing = cache.get(senderId)
  if (existing && existing.until > Date.now()) return existing.promise
  const entry = { until: Date.now() + timeoutMs + 5000, promise: Promise.resolve({}) as Promise<FeishuProfile> }
  entry.promise = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const request = client.request({ url: `/open-apis/contact/v3/users/${encodeURIComponent(senderId)}`, method: 'GET', params: { user_id_type: 'open_id' } })
      const result = await Promise.race([request, new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), timeoutMs) })]) as { code?: number; data?: { user?: { name?: string; avatar?: { avatar_72?: string } } } } | undefined
      const user = result?.code === 0 ? result.data?.user : undefined
      /** 外部字段只在此边界归一化，消费方始终收到有界字符串。 */
      const displayName = typeof user?.name === 'string' ? user.name.trim().slice(0, 256) : ''
      const avatarUrl = typeof user?.avatar?.avatar_72 === 'string' ? user.avatar.avatar_72 : ''
      const profile: FeishuProfile = { ...(displayName ? { displayName } : {}), ...(avatarUrl.startsWith('https://') ? { avatarUrl } : {}) }
      entry.until = Date.now() + (profile.displayName || profile.avatarUrl ? 3600000 : 5000)
      return profile
    } catch { entry.until = Date.now() + 5000; return {} }
    finally { if (timer) clearTimeout(timer) }
  })()
  if (cache.size >= 500) cache.delete(cache.keys().next().value!)
  cache.set(senderId, entry)
  return entry.promise
}
