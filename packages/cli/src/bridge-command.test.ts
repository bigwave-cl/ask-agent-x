import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Command } from 'commander'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig, settingsPatchSchema, type SettingsStore } from '@askx/core'
import { FeishuBridgeModule } from '@askx/module-feishu-bridge'
import { BridgeServiceManager } from '@askx/module-feishu-bridge/service-manager'
import { registerBridgeCommands } from './bridge-command.js'

afterEach(() => vi.restoreAllMocks())

describe('bridge CLI safety boundaries', () => {
  it.each(['flat', 'full'])('normalizes %s legacy imports through the Core schema', async format => {
    const directory = await mkdtemp(join(tmpdir(), 'askx-cli-import-'))
    const current = defaultConfig()
    const legacy = format === 'flat' ? { botAppId: 'from-openclaw', cwd: '/legacy', paths: { codexBinary: 'codex', stateDir: directory } } : { bridge: { ...current.bridge, enabled: true, paths: { ...current.bridge.paths, workspace: '/legacy', projectRegistry: '/legacy.json' }, service: { ...current.bridge.service, autoStart: true }, feishu: { botAppId: 'from-openclaw', chats: [] } } }
    const file = join(directory, 'config.json')
    await writeFile(file, JSON.stringify(legacy))
    const update = vi.fn(async patch => { settingsPatchSchema.parse(patch); return { ...current, bridge: patch.bridge } })
    const program = new Command()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    registerBridgeCommands(program, { read: async () => current, update } as unknown as SettingsStore, 'en')
    try {
      await program.parseAsync(['bridge', 'config', 'import', '--file', file, '--yes', '--json'], { from: 'user' })
      expect(update.mock.calls[0]?.[0].bridge.feishu.appId).toBe('')
      expect(update.mock.calls[0]?.[0].bridge.feishu.source).toBe('openclaw')
      expect(update.mock.calls[0]?.[0].bridge.paths).not.toHaveProperty('workspace')
      expect(update.mock.calls[0]?.[0].bridge).not.toHaveProperty('enabled')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('routes confirmed service actions through module plan and consent', async () => {
    const current = defaultConfig()
    const status = { runtimeStatus: 'stopped', healthy: true }
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(BridgeServiceManager.prototype, 'status').mockResolvedValue(status as Awaited<ReturnType<BridgeServiceManager['status']>>)
    const start = vi.spyOn(BridgeServiceManager.prototype, 'start').mockResolvedValue(status as Awaited<ReturnType<BridgeServiceManager['start']>>)
    const plan = vi.spyOn(FeishuBridgeModule.prototype, 'plan')
    const apply = vi.spyOn(FeishuBridgeModule.prototype, 'apply')
    const program = new Command()
    registerBridgeCommands(program, { read: async () => current } as unknown as SettingsStore, 'en')
    await program.parseAsync(['bridge', 'service', 'start', '--yes', '--json'], { from: 'user' })
    expect(plan).toHaveBeenCalledWith('start', { expectedRevision: current.revision })
    expect(apply).toHaveBeenCalledTimes(1)
    const [planned, consent] = apply.mock.calls[0]!
    expect(consent.planHash).toBe(planned.hash)
    expect(start).toHaveBeenCalledWith(current.revision)
  })
})
