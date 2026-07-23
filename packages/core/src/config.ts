import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { ModuleContext } from './types.js'

export const configSchema = z.object({
  version: z.literal(1),
  dataDir: z.string().min(1),
})

export const stateSchema = z.object({
  version: z.literal(1),
  activeTransactionId: z.string().uuid().nullable(),
  updatedAt: z.string().datetime(),
})

export type AskXConfig = z.infer<typeof configSchema>
export type AskXState = z.infer<typeof stateSchema>

export function defaultContext(homeDir = homedir()): ModuleContext {
  return { homeDir, dataDir: join(homeDir, '.askx') }
}

