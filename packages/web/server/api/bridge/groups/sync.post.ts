import { BridgeRelationsConflictError } from '@askx/core/bridge-relations'
import { getBridgeGroupService } from '../../../utils/bridge-settings.js'
import { settingsStore } from '../../../utils/settings.js'

export default defineEventHandler(async () => {
    try { return await (await getBridgeGroupService()).sync((await settingsStore.read()).bridge.feishu) }
    catch (error) {
        if (error instanceof BridgeRelationsConflictError) throw createError({ statusCode: 409, statusMessage: error.message })
        throw createError({ statusCode: 400, statusMessage: 'Could not load Feishu groups; check bot permissions' })
    }
})
