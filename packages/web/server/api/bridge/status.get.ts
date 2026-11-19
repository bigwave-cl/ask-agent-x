import { bridgeServiceManager } from '../../utils/bridge.js'

export default defineEventHandler(async () => bridgeServiceManager.status())
