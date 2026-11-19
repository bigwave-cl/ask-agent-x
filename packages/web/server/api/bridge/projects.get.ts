import { bridgeProjectService } from '../../utils/bridge.js'

export default defineEventHandler(async () => ({ projects: await bridgeProjectService.listProjects() }))
