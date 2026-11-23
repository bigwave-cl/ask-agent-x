import { BridgeRelationsStore } from '@askx/core/bridge-relations'
import { bridgeSessionCatalogService } from '../../utils/bridge.js'
import { settingsStore } from '../../utils/settings.js'

/** 读取群组为根的当前项目、历史项目和会话目录。 */
export default defineEventHandler(async () => {
    const config = await settingsStore.read()
    const relations = await new BridgeRelationsStore(config.bridge.paths.stateDir).read()
    return bridgeSessionCatalogService.build(relations)
})
