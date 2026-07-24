import { SettingsConflictError, settingsPatchSchema } from '@askx/core'
import { z } from 'zod'
import { settingsStore } from '../utils/settings.js'

const requestSchema = z.object({
  revision: z.number().int().nonnegative(),
  patch: settingsPatchSchema,
})

export default defineEventHandler(async (event) => {
  const input = requestSchema.parse(await readBody(event))
  try {
    return await settingsStore.update(input.patch, { source: 'web', expectedRevision: input.revision })
  } catch (error) {
    if (error instanceof SettingsConflictError) {
      throw createError({ statusCode: 409, statusMessage: error.message, data: { current: error.current } })
    }
    throw error
  }
})

