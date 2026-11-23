import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SettingsConflictError, SettingsStore } from './settings-store.js'
import { configSchema } from './config.js'

describe('SettingsStore', () => {
  it('returns safe defaults before the first write', async () => {
    const store = new SettingsStore(await mkdtemp(join(tmpdir(), 'askx-settings-')))

    const settings = await store.read()

    expect(settings.revision).toBe(0)
    expect(settings.cliLocale).toBeUndefined()
    expect(settings.locale).toBe('zh-CN')
    expect(settings.themeColor).toBe('cyan')
    expect(settings.skills.backupBeforeLink).toBe(true)
    expect(settings.skills.platforms).toEqual([])
    expect(settings.bridge.workTime.window).toEqual({ start: '09:00', end: '19:00' })
    expect(settings.bridge.workTime.mode).toBe('windows')
    expect(settings.bridge.paths.codexHome).toMatch(/\.askx\/bridge\/codex-home$/)
  })

  it('deep merges bridge patches without resetting sibling settings', async () => {
    const store = new SettingsStore(await mkdtemp(join(tmpdir(), 'askx-settings-')))

    const updated = await store.update({ bridge: { workTime: { mode: 'always' } } }, { source: 'web', expectedRevision: 0 })

    expect(updated.bridge.workTime.mode).toBe('always')
    expect(updated.bridge.workTime.window).toEqual({ start: '09:00', end: '19:00' })
    expect(updated.bridge.paths.codexBinary).toBe('codex')
    expect(updated.bridge.paths.codexHome).toMatch(/\.askx\/bridge\/codex-home$/)
    expect(updated.bridge.paths).not.toHaveProperty('workspace')
  })

  it('rejects invalid bridge timezone and overlapping windows', () => {
    const base = {
      version: 1 as const,
      revision: 0,
      updatedAt: new Date(0).toISOString(),
      updatedBy: 'system' as const,
      locale: 'zh-CN' as const,
      themeColor: 'cyan' as const,
      skills: { backupBeforeLink: true, platforms: [] },
    }
    expect(() => configSchema.parse({ ...base, bridge: { ...defaultBridgeForTest(), workTime: { mode: 'windows', outsideWindow: 'stop-service' } } })).toThrow()
    expect(configSchema.parse({ ...base, bridge: { ...defaultBridgeForTest(), workTime: { mode: 'windows', timezone: 'Not/AZone', windows: [{ start: '09:00', end: '12:00' }, { start: '11:00', end: '13:00' }], outsideWindow: 'stop-service' } } }).bridge.workTime.window).toEqual({ start: '09:00', end: '12:00' })
  })

  it('persists an atomic revisioned update', async () => {
    const store = new SettingsStore(await mkdtemp(join(tmpdir(), 'askx-settings-')))

    const updated = await store.update(
      { skills: { backupBeforeLink: false, platforms: ['codex', 'cursor'] } },
      { source: 'cli', expectedRevision: 0 },
    )

    expect(updated).toMatchObject({ revision: 1, updatedBy: 'cli' })
    expect(JSON.parse(await readFile(store.path, 'utf8'))).toEqual(updated)
  })

  it('分别保存 CLI 语言和 Web 语言', async () => {
    const store = new SettingsStore(await mkdtemp(join(tmpdir(), 'askx-settings-')))

    const updated = await store.update({ cliLocale: 'en' }, { source: 'cli' })

    expect(updated.cliLocale).toBe('en')
    expect(updated.locale).toBe('zh-CN')
    expect(await store.read()).toMatchObject({ cliLocale: 'en', locale: 'zh-CN' })
  })

  it('persists one of the supported shared theme colors', async () => {
    const store = new SettingsStore(await mkdtemp(join(tmpdir(), 'askx-settings-')))

    const updated = await store.update({ themeColor: 'rose' }, { source: 'web' })

    expect(updated.themeColor).toBe('rose')
    expect((await store.read()).themeColor).toBe('rose')
  })

  it('rejects stale writes instead of silently overwriting', async () => {
    const store = new SettingsStore(await mkdtemp(join(tmpdir(), 'askx-settings-')))
    await store.update({ skills: { backupBeforeLink: false } }, { source: 'cli' })

    await expect(
      store.update({ skills: { backupBeforeLink: true } }, { source: 'web', expectedRevision: 0 }),
    ).rejects.toBeInstanceOf(SettingsConflictError)
  })

  it('按已授权计划恢复全部共享设置默认值', async () => {
    const store = new SettingsStore(await mkdtemp(join(tmpdir(), 'askx-settings-')))
    await store.update({ locale: 'en', themeColor: 'rose', skills: { backupBeforeLink: false, platforms: ['cursor'] } }, { source: 'web' })
    const plan = await store.createResetPlan()

    const updated = await store.applyResetPlan(plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() }, 'cli')

    expect(updated).toMatchObject({
      revision: 2,
      updatedBy: 'cli',
      locale: 'zh-CN',
      themeColor: 'cyan',
      skills: { backupBeforeLink: true, platforms: [] },
    })
  })

  it('拒绝配置变化后的过期重置计划', async () => {
    const store = new SettingsStore(await mkdtemp(join(tmpdir(), 'askx-settings-')))
    const plan = await store.createResetPlan()
    await store.update({ locale: 'en' }, { source: 'web' })

    await expect(store.applyResetPlan(plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() }, 'cli'))
      .rejects.toBeInstanceOf(SettingsConflictError)
  })
})

function defaultBridgeForTest() {
  return {
    enabled: false,
    service: { launchdLabel: 'com.askagentx.feishu-bridge', host: '127.0.0.1' as const, port: 38477, autoStart: true, gracefulStopMs: 30000 },
    workTime: { mode: 'windows' as const, window: { start: '09:00', end: '19:00' }, outsideWindow: 'stop-service' as const },
    paths: { workspace: '/tmp/workspace', openClawConfig: '/tmp/openclaw.json', codexBinary: 'codex', appExecutable: '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT', stateDir: '/tmp/bridge', projectRegistry: '/tmp/project.json', groupRegistry: '/tmp/group.json' },
    feishu: { botAppId: 'from-openclaw', chats: [] },
  }
}
