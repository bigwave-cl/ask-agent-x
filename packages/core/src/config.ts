import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { ModuleContext } from './types.js'

export const localeSchema = z.enum(['zh-CN', 'en'])
export const themeColorSchema = z.enum(['cyan', 'rose'])

/** 桥接服务工作时间窗口。时间使用本地时区的 HH:mm。 */
export const bridgeWorkTimeWindowSchema = z.object({
  /** 窗口开始时间。 */
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '工作时间必须使用 HH:mm。'),
  /** 窗口结束时间。 */
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '工作时间必须使用 HH:mm。'),
}).superRefine((window, context) => {
  if (window.start === window.end) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['end'], message: '开始和结束时间不能相同；全天运行请使用 always 模式。' })
  }
})

/** 桥接服务的工作时间策略。兼容旧版 timezone/windows 输入并归一化。 */
export const bridgeWorkTimeSchema = z.preprocess(value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const input = value as Record<string, unknown>
  const legacyWindows = Array.isArray(input.windows) ? input.windows : undefined
  return {
    mode: input.mode,
    window: input.window ?? legacyWindows?.[0],
    outsideWindow: input.outsideWindow,
  }
}, z.object({
  /** 工作时间模式；always 表示全天运行。 */
  mode: z.enum(['windows', 'always']),
  /** 每天唯一的工作时间窗口。 */
  window: bridgeWorkTimeWindowSchema.optional(),
  /** 窗口外停止桥接 runtime。 */
  outsideWindow: z.literal('stop-service'),
}).superRefine((workTime, context) => {
  if (workTime.mode === 'windows' && !workTime.window) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['window'], message: '窗口模式必须设置工作时间。' })
  }
}))

/** 桥接服务的受管进程配置。 */
export const bridgeServiceSchema = z.object({
  /** LaunchAgent 标签。 */
  launchdLabel: z.string().min(1).default('com.askagentx.feishu-bridge'),
  /** 停止 runtime 时允许其收口的毫秒数。 */
  gracefulStopMs: z.number().int().min(0).max(10 * 60 * 1000).default(30_000),
})

/** 桥接运行所需的本地路径引用；凭据内容不进入此配置。 */
export const bridgePathsSchema = z.object({
  /** Codex 可执行文件路径。 */
  codexBinary: z.string().min(1),
  /** 桥接状态和日志目录。 */
  stateDir: z.string().min(1),
  /** 桥接专用 Codex 配置、凭据和 thread 存储目录。 */
  codexHome: z.string().min(1).default(join(homedir(), '.askx', 'bridge', 'codex-home')),
  /** 只读复用的 Codex API key 来源文件；内容不会写回该文件。 */
  authFile: z.string().min(1).default(join(homedir(), '.codex', 'auth.json')),
  /** 只读读取的 Codex 配置文件；仅提取模型提供商设置。 */
  configFile: z.string().min(1).default(join(homedir(), '.codex', 'config.toml')),
})

/** Feishu 群接入配置；不包含 App Secret。 */
export const bridgeFeishuSchema = z.object({
  /** 飞书身份来源；导入模式读取本机 OpenClaw。 */
  source: z.enum(['openclaw', 'custom']).default('openclaw'),
  /** 飞书应用 ID，未选择应用时为空。 */
  appId: z.string().default(''),
  /** 独立凭据存储中的不透明引用，不包含密钥。 */
  credentialRef: z.string().uuid().optional(),
  /** 通过私聊选择群组关联的管理员 Open ID。 */
  adminOpenId: z.string().regex(/^ou_[A-Za-z0-9]+$/).optional(),
})

/** Feishu-Codex 桥接模块配置。 */
export const bridgeConfigSchema = z.object({
  /** 服务生命周期配置。 */
  service: bridgeServiceSchema,
  /** 工作时间配置。 */
  workTime: bridgeWorkTimeSchema,
  /** 本地路径引用。 */
  paths: bridgePathsSchema,
  /** Feishu 群和注册权限配置。 */
  feishu: z.preprocess(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const legacy = value as Record<string, unknown>
    return {
      ...legacy,
      appId: legacy.appId ?? (typeof legacy.botAppId === 'string' && legacy.botAppId !== 'from-openclaw' ? legacy.botAppId : ''),
      adminOpenId: legacy.adminOpenId ?? legacy.registrationOwnerOpenId,
    }
  }, bridgeFeishuSchema),
})

export const configSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  updatedBy: z.enum(['cli', 'web', 'system']),
  cliLocale: localeSchema.optional(),
  locale: localeSchema.default('zh-CN'),
  themeColor: themeColorSchema.default('cyan'),
  skills: z.object({
    backupBeforeLink: z.boolean(),
    platforms: z.array(z.enum(['codex', 'claude', 'cursor'])),
  }),
  /** 与 Skills 平行的桥接模块配置域。 */
  bridge: bridgeConfigSchema.default(() => defaultBridgeConfig()),
})

const bridgeWorkTimePatchSchema = z.object({
  mode: z.enum(['windows', 'always']).optional(),
  window: bridgeWorkTimeWindowSchema.optional(),
  outsideWindow: z.literal('stop-service').optional(),
}).strict()

const bridgeServicePatchSchema = bridgeServiceSchema.partial().strict()
const bridgePathsPatchSchema = bridgePathsSchema.partial().strict()
const bridgeFeishuPatchSchema = bridgeFeishuSchema.partial().strict()
const bridgePatchSchema = z.object({
  service: bridgeServicePatchSchema.optional(),
  workTime: bridgeWorkTimePatchSchema.optional(),
  paths: bridgePathsPatchSchema.optional(),
  feishu: bridgeFeishuPatchSchema.optional(),
}).strict()

export const settingsPatchSchema = z
  .object({
    cliLocale: localeSchema.optional(),
    locale: localeSchema.optional(),
    themeColor: themeColorSchema.optional(),
    skills: configSchema.shape.skills.partial().optional(),
    bridge: bridgePatchSchema.optional(),
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
export type BridgeConfig = z.infer<typeof bridgeConfigSchema>
export type BridgeWorkTime = z.infer<typeof bridgeWorkTimeSchema>
export type BridgeWorkTimeWindow = z.infer<typeof bridgeWorkTimeWindowSchema>
export type BridgeServiceConfig = z.infer<typeof bridgeServiceSchema>
export type BridgePaths = z.infer<typeof bridgePathsSchema>
export type BridgeFeishuConfig = z.infer<typeof bridgeFeishuSchema>

/** 创建桥接模块的默认工作时间和服务配置。 */
export function defaultBridgeConfig(): BridgeConfig {
  return {
    service: {
      launchdLabel: 'com.askagentx.feishu-bridge',
      gracefulStopMs: 30_000,
    },
    workTime: {
      mode: 'windows',
      window: { start: '09:00', end: '19:00' },
      outsideWindow: 'stop-service',
    },
    paths: {
      codexBinary: 'codex',
      stateDir: join(homedir(), '.askx', 'bridge'),
      codexHome: join(homedir(), '.askx', 'bridge', 'codex-home'),
      authFile: join(homedir(), '.codex', 'auth.json'),
      configFile: join(homedir(), '.codex', 'config.toml'),
    },
    feishu: {
      source: 'openclaw',
      appId: '',
    },
  }
}

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
    bridge: defaultBridgeConfig(),
  }
}

export function defaultContext(homeDir = homedir()): ModuleContext {
  return { homeDir, dataDir: process.env.ASKX_DATA_DIR ?? join(homeDir, '.askx') }
}
