import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { bridgeConfigSchema, defaultBridgeConfig, ModuleRegistry, type AskXConfig, type AskXLocale, type SettingsPatch, SettingsStore } from '@askx/core'
import { createFeishuBridgeModule } from '@askx/module-feishu-bridge'
import { BridgeServiceManager } from '@askx/module-feishu-bridge/service-manager'

/** 注册 bridge 独立模块的 CLI 命令树。 */
export function registerBridgeCommands(program: Command, settingsStore: SettingsStore, locale: AskXLocale): ModuleRegistry {
  const manager = new BridgeServiceManager({ read: () => settingsStore.read() }, undefined, resolveBridgeRuntimeEntry())
  const moduleRegistry = new ModuleRegistry()
  const bridgeModule = createFeishuBridgeModule(manager)
  moduleRegistry.register(bridgeModule)
  const bridge = program.command('bridge').description(locale === 'zh-CN' ? '管理 Feishu-Codex 桥接模块' : 'Manage the Feishu-Codex bridge module')
  const output = (value: unknown, json: boolean): void => {
    if (json) console.log(JSON.stringify(value, null, 2))
    else console.log(renderHuman(value, locale))
  }
  const requireConfirmation = (yes: boolean | undefined): void => {
    if (!yes) throw new Error(locale === 'zh-CN' ? '桥接写操作需要 --yes 明确确认。' : 'Bridge write actions require explicit --yes confirmation.')
  }

  const service = bridge.command('service').description(locale === 'zh-CN' ? '控制桥接服务生命周期' : 'Control bridge service lifecycle')
  service.command('status').option('--json').action(async ({ json }: { json?: boolean }) => output(await manager.status(), Boolean(json)))
  for (const action of ['start', 'stop', 'restart', 'update'] as const) {
    service.command(action).option('--json').option('--yes').action(async ({ json, yes }: { json?: boolean; yes?: boolean }) => {
      requireConfirmation(yes)
      const current = await settingsStore.read()
      const plan = await bridgeModule.plan(action, { expectedRevision: current.revision })
      await bridgeModule.apply(plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })
      output(await manager.status(), Boolean(json))
    })
  }
  service.command('logs').option('--json').option('--tail <lines>').action(async ({ json, tail }: { json?: boolean; tail?: string }) => {
    const config = await settingsStore.read()
    const file = `${config.bridge.paths.stateDir}/bridge.log`
    let lines: string[] = []
    try { lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const count = Math.min(Math.max(Number.parseInt(tail ?? '40', 10) || 40, 1), 500)
    output({ file, lines: lines.slice(-count) }, Boolean(json))
  })

  const config = bridge.command('config').description(locale === 'zh-CN' ? '读取和更新桥接配置' : 'Read and update bridge configuration')
  config.command('show').option('--json').action(async ({ json }: { json?: boolean }) => {
    const current = await settingsStore.read()
    output({ revision: current.revision, bridge: current.bridge }, Boolean(json))
  })
  config.command('validate').option('--json').action(async ({ json }: { json?: boolean }) => {
    const current = await settingsStore.read()
    output({ valid: true, revision: current.revision, bridge: current.bridge }, Boolean(json))
  })
  config.command('set').requiredOption('--patch <json>').option('--revision <revision>').option('--json').option('--yes').action(async ({ patch, revision, json, yes }: { patch: string; revision?: string; json?: boolean; yes?: boolean }) => {
    requireConfirmation(yes)
    const current = await settingsStore.read()
    const parsed = JSON.parse(patch) as SettingsPatch['bridge']
    const updated = await settingsStore.update({ bridge: parsed } as SettingsPatch, { source: 'cli', expectedRevision: revision === undefined ? current.revision : Number(revision) })
    output({ revision: updated.revision, bridge: updated.bridge }, Boolean(json))
  })
  config.command('import').requiredOption('--file <path>').option('--json').option('--yes').action(async ({ file, json, yes }: { file: string; json?: boolean; yes?: boolean }) => {
    requireConfirmation(yes)
    const imported = JSON.parse(await readFile(file, 'utf8')) as Partial<AskXConfig> & { bridge?: SettingsPatch['bridge'] }
    const current = await settingsStore.read()
    const patch = imported.bridge ? bridgeConfigSchema.parse(imported.bridge) : legacyBridgePatch(imported)
    const updated = await settingsStore.update({ bridge: patch } as SettingsPatch, { source: 'cli', expectedRevision: current.revision })
    output({ revision: updated.revision, bridge: updated.bridge }, Boolean(json))
  })

  const workTime = bridge.command('work-time').description(locale === 'zh-CN' ? '设置桥接工作时间' : 'Configure bridge work time')
  workTime.command('show').option('--json').action(async ({ json }: { json?: boolean }) => {
    const current = await settingsStore.read()
    output({ revision: current.revision, workTime: current.bridge.workTime }, Boolean(json))
  })
  workTime.command('set').requiredOption('--mode <mode>').option('--window <window>').option('--revision <revision>').option('--json').option('--yes').action(async ({ mode, window, revision, json, yes }: { mode: 'windows' | 'always'; window?: string; revision?: string; json?: boolean; yes?: boolean }) => {
    requireConfirmation(yes)
    if (mode !== 'windows' && mode !== 'always') throw new Error('mode must be windows or always')
    const current = await settingsStore.read()
    const windowValue = window ?? '09:00-19:00'
    const parsedWindow = (() => {
      if (mode === 'always') return undefined
      const value = windowValue
      const [start, end] = value.split('-')
      if (!start || !end) throw new Error(`Invalid work time window: ${value}`)
      return { start, end }
    })()
    const updated = await settingsStore.update({ bridge: { workTime: { mode, window: parsedWindow, outsideWindow: 'stop-service' } } } as SettingsPatch, { source: 'cli', expectedRevision: revision === undefined ? current.revision : Number(revision) })
    output({ revision: updated.revision, workTime: updated.bridge.workTime }, Boolean(json))
  })
  return moduleRegistry
}

/**
 * 解析 CLI 能实际启动的桥接 runtime 入口。
 *
 * 发布版会把 runtime 复制到 CLI 自身的 dist 目录；源码仓库运行时保留
 * 模块 dist 作为回退，避免服务管理器根据被打包后的 import.meta.url 推导出错误路径。
 */
function resolveBridgeRuntimeEntry(): string {
  const cliDirectory = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(cliDirectory, '../../modules/feishu-bridge/dist/runtime-entry.js'),
    resolve(process.cwd(), 'packages/modules/feishu-bridge/dist/runtime-entry.js'),
    join(cliDirectory, 'bridge-runtime', 'runtime-entry.js'),
  ]
  const found = candidates.find(path => {
    // 这里是同步的启动前探测，避免把无效路径交给异步子进程。
    return existsSync(path)
  })
  // CLI 的其他命令不应因为 bridge 资源尚未构建而无法显示帮助或执行只读操作；
  // 由 service manager 在真正启动时报告缺失的 runtime。
  return found ?? candidates[0]!
}

/** 将旧 bundle 的 config.json 归一化为 Core bridge 配置补丁。 */
function legacyBridgePatch(imported: Partial<AskXConfig> & Record<string, unknown>): SettingsPatch['bridge'] {
  const defaults = defaultBridgeConfig()
  const paths = imported.paths && typeof imported.paths === 'object' ? imported.paths as Record<string, unknown> : {}
  return bridgeConfigSchema.parse({
    service: defaults.service,
    workTime: defaults.workTime,
    feishu: {
      source: defaults.feishu.source,
      botAppId: imported.botAppId,
      registrationOwnerOpenId: imported.registrationOwnerOpenId,
    },
    paths: {
      codexBinary: typeof imported.codexBinary === 'string' ? imported.codexBinary : typeof paths.codexBinary === 'string' ? paths.codexBinary : defaults.paths.codexBinary,
      stateDir: typeof imported.stateDir === 'string' ? imported.stateDir : typeof paths.stateDir === 'string' ? paths.stateDir : defaults.paths.stateDir,
      codexHome: typeof imported.codexHome === 'string' ? imported.codexHome : typeof paths.codexHome === 'string' ? paths.codexHome : defaults.paths.codexHome,
    },
  })
}

function renderHuman(value: unknown, locale: AskXLocale): string {
  if (typeof value !== 'object' || value === null) return String(value)
  const record = value as Record<string, unknown>
  if ('runtimeStatus' in record) return `${locale === 'zh-CN' ? '桥接状态' : 'Bridge status'}: ${String(record.runtimeStatus)}${record.lastError ? ` · ${String(record.lastError)}` : ''}`
  if ('workTime' in record) return `${locale === 'zh-CN' ? '工作时间' : 'Work time'}: ${JSON.stringify(record.workTime)}`
  if ('bridge' in record) return `${locale === 'zh-CN' ? '配置版本' : 'Config revision'}: ${String(record.revision)}`
  if ('lines' in record) return (record.lines as string[]).join('\n')
  return JSON.stringify(value, null, 2)
}

/** 提供 CLI 测试使用的默认 bridge 配置。 */
export function defaultBridgePatch(): SettingsPatch['bridge'] {
  return defaultBridgeConfig()
}
