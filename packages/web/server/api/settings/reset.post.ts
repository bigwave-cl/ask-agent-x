import { SettingsConflictError } from '@askx/core'
import { z } from 'zod'
import { settingsStore } from '../../utils/settings.js'

const requestSchema = z.object({
  revision: z.number().int().nonnegative(),
  confirmed: z.literal(true),
})

export default defineEventHandler(async (event) => {
  const input = requestSchema.parse(await readBody(event))
  const current = await settingsStore.read()
  if (current.revision !== input.revision) {
    throw createError({ statusCode: 409, statusMessage: 'Settings changed', data: { current } })
  }
  const plan = await settingsStore.createResetPlan()
  try {
    return await settingsStore.applyResetPlan(plan, {
      planHash: plan.hash,
      confirmedAt: new Date().toISOString(),
    }, 'web')
  } catch (error) {
    if (error instanceof SettingsConflictError) {
      throw createError({ statusCode: 409, statusMessage: error.message, data: { current: error.current } })
    }
    throw error
  }
})
