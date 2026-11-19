import { SettingsConflictError } from '@askx/core'
import { publicBridgeSettings } from '@askx/core/bridge-settings'
import { bridgeSettingsService } from '../../utils/bridge-settings.js'
import { bridgeServiceManager, bridgeThreadSessionManager } from '../../utils/bridge.js'

export default defineEventHandler(async event => {
    try {
        const updated = await bridgeSettingsService.save(await readBody(event))
        const response = publicBridgeSettings(updated)
        // 保存成功后应用新设置，保持用户之前的启停意图。
        bridgeThreadSessionManager.stop()
        try {
            const before = await bridgeServiceManager.status()
            if (before.desiredState === 'enabled') await bridgeServiceManager.restart(updated.revision)
            return response
        }
        catch {
            return { ...response, applicationError: 'saved-but-runtime-failed' }
        }
    }
    catch (error) {
        if (error instanceof SettingsConflictError) {
            throw createError({ statusCode: 409, statusMessage: 'Settings changed; reload before saving', data: { current: publicBridgeSettings(error.current) } })
        }
        throw createError({ statusCode: 400, statusMessage: 'Could not save bridge settings; check the fields and credential store' })
    }
})
