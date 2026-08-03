import { listLocalOpenOptions } from '../../../utils/localPathOpener.js'

export default defineEventHandler(async () => ({ options: await listLocalOpenOptions() }))
