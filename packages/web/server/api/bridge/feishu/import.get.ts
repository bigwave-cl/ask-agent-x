import { getFeishuImportAccounts } from '@askx/core/bridge-credentials'

export default defineEventHandler(async () => {
    try { return { accounts: await getFeishuImportAccounts() } }
    catch { throw createError({ statusCode: 400, statusMessage: 'No usable OpenClaw Feishu account was found' }) }
})
