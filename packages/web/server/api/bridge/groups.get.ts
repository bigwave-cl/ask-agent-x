import { getBridgeGroupService } from '../../utils/bridge-settings.js'

export default defineEventHandler(async () => (await getBridgeGroupService()).read())
