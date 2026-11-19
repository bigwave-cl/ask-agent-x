import { z } from 'zod'
import { bridgeFeishuSchema } from '@askx/core/config'
import { testBridgeFeishuConnection } from '@askx/module-feishu-bridge/group-service'
import { settingsStore } from '../../../utils/settings.js'

/** 测试只接收身份和一次性密钥，不允许客户端指定钥匙串引用。 */
const inputSchema = bridgeFeishuSchema.omit({ credentialRef: true }).extend({ appSecret: z.string().max(4096).optional() }).strict()

export default defineEventHandler(async event => {
    const input = inputSchema.parse(await readBody(event))
    const saved = (await settingsStore.read()).bridge.feishu
    try {
        await testBridgeFeishuConnection({ ...input, credentialRef: saved.appId === input.appId ? saved.credentialRef : undefined }, input.appSecret)
        return { ok: true }
    }
    catch { throw createError({ statusCode: 400, statusMessage: 'Feishu connection failed; check credentials and permissions' }) }
})
