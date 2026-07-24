import { settingsStore } from '../utils/settings.js'

export default defineEventHandler(() => settingsStore.read())

