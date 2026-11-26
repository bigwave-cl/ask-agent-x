import { getBridgeGroupService } from '../../utils/bridge-settings.js'

/** 仅读取当前关系版本及共享偏好，旧文件返回 null 供客户端判断是否迁移。 */
export default defineEventHandler(async () => {
    const { revision, sidebarPreferences } = await (await getBridgeGroupService()).read()
    return { revision, preferences: sidebarPreferences ?? null }
})
