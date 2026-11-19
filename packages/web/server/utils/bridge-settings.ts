import { BridgeSettingsService } from '@askx/core/bridge-settings'
import { BridgeRelationsStore } from '@askx/core/bridge-relations'
import { BridgeGroupService } from '@askx/module-feishu-bridge/group-service'
import { settingsStore } from './settings.js'
import { bridgeProjectService, bridgeThreadSessionManager } from './bridge.js'

/** 配置与凭据事务的唯一服务实例。 */
export const bridgeSettingsService = new BridgeSettingsService(settingsStore)
/** 每次请求定位当前数据目录，群关联文件名由 Core 固定。 */
export async function getBridgeGroupService(): Promise<BridgeGroupService> {
    const config = await settingsStore.read()
    return new BridgeGroupService(new BridgeRelationsStore(config.bridge.paths.stateDir), bridgeProjectService, bridgeThreadSessionManager)
}
