import { z } from 'zod'
import { bridgeFeishuSchema, bridgeWorkTimeSchema, type AskXConfig } from './config.js'
import { FeishuCredentialStore, feishuCredentialsSchema, resolveFeishuCredentials } from './bridge-credentials.js'
import { SettingsConflictError, SettingsStore } from './settings-store.js'

/** Web 设置只允许修改产品字段，不接受内部目录和凭据引用。 */
export const bridgeSettingsRequestSchema = z.object({
  /** 草稿基于的配置版本。 */
  revision: z.number().int().nonnegative(),
  /** 用户明确保存的配置。 */
  patch: z.object({
    /** 工作时间策略。 */
    workTime: bridgeWorkTimeSchema.optional(),
    /** 飞书身份和私聊管理员。 */
    feishu: bridgeFeishuSchema.omit({ credentialRef: true }).strict().optional(),
  }).strict(),
  /** 仅此请求携带的新密钥；省略或为空表示不替换。 */
  appSecret: z.string().max(4096).optional(),
}).strict()
/** 返回可展示的设置，不把凭据引用暴露给浏览器。 */
export function publicBridgeSettings(settings: AskXConfig) {
  const { credentialRef, ...feishu } = settings.bridge.feishu
  return { revision: settings.revision, bridge: { ...settings.bridge, feishu: { ...feishu, hasSecret: Boolean(credentialRef) } } }
}
/** 保存凭据与配置的单一事务入口。 */
export class BridgeSettingsService {
  /** 注入共享配置和独立凭据存储。 */
  constructor(private readonly settings: SettingsStore, private readonly credentials = new FeishuCredentialStore()) {}
  /** 验证身份后持久化配置；冲突时回滚本次创建的凭据。 */
  async save(raw: unknown): Promise<AskXConfig> {
    const input = bridgeSettingsRequestSchema.parse(raw)
    const current = await this.settings.read()
    if (current.revision !== input.revision) throw new SettingsConflictError(current)
    let createdRef: string | undefined
    try {
      // 飞书表单整体提交；清空管理员时必须覆盖旧值，不能被 patch 合并保留。
      const feishu = input.patch.feishu ? { ...input.patch.feishu, adminOpenId: input.patch.feishu.adminOpenId } : undefined
      let credentialRef = current.bridge.feishu.credentialRef
      if (feishu) {
        if (feishu.source === 'custom') {
          if (input.appSecret) {
            const credential = feishuCredentialsSchema.safeParse({ appId: feishu.appId, appSecret: input.appSecret })
            if (!credential.success) throw new Error('Invalid Feishu application ID or secret')
            createdRef = await this.credentials.put(credential.data)
            credentialRef = createdRef
          }
          await resolveFeishuCredentials({ ...feishu, credentialRef }, this.credentials)
        } else {
          const credential = await resolveFeishuCredentials(feishu)
          feishu.appId = credential.appId
          credentialRef = undefined
        }
      }
      return await this.settings.update({ bridge: {
        ...(input.patch.workTime ? { workTime: input.patch.workTime } : {}),
        ...(feishu ? { feishu: { ...feishu, credentialRef } } : {}),
      } }, { source: 'web', expectedRevision: input.revision })
    } catch (error) {
      if (createdRef) await this.credentials.remove(createdRef).catch(() => {})
      throw error
    }
  }
}
