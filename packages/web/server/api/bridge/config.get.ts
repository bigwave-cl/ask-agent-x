import { publicBridgeSettings } from '@askx/core/bridge-settings'
import { settingsStore } from '../../utils/settings.js'

export default defineEventHandler(async () => publicBridgeSettings(await settingsStore.read()))
