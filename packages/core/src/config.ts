import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { ModuleContext } from './types.js'

export const localeSchema = z.enum(['zh-CN', 'en'])
export const themeColorSchema = z.enum(['cyan', 'rose'])

export const configSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  updatedBy: z.enum(['cli', 'web', 'system']),
  locale: localeSchema.default('zh-CN'),
  themeColor: themeColorSchema.default('cyan'),
  skills: z.object({
    backupBeforeLink: z.boolean(),
    platforms: z.array(z.enum(['codex', 'claude', 'cursor'])),
  }),
})

export const settingsPatchSchema = z
  .object({
    locale: localeSchema.optional(),
    themeColor: themeColorSchema.optional(),
    skills: configSchema.shape.skills.partial().optional(),
  })
  .strict()

export const stateSchema = z.object({
  version: z.literal(1),
  activeTransactionId: z.string().uuid().nullable(),
  updatedAt: z.string().datetime(),
})

export type AskXConfig = z.infer<typeof configSchema>
export type AskXLocale = z.infer<typeof localeSchema>
export type AskXThemeColor = z.infer<typeof themeColorSchema>
export type SettingsPatch = z.infer<typeof settingsPatchSchema>
export type ManagedPlatformId = AskXConfig['skills']['platforms'][number]
export type AskXState = z.infer<typeof stateSchema>

export function defaultConfig(): AskXConfig {
  return {
    version: 1,
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    updatedBy: 'system',
    locale: 'zh-CN',
    themeColor: 'cyan',
    skills: {
      backupBeforeLink: true,
      platforms: [],
    },
  }
}

export function defaultContext(homeDir = homedir()): ModuleContext {
  return { homeDir, dataDir: process.env.ASKX_DATA_DIR ?? join(homeDir, '.askx') }
}
