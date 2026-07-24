import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SettingsConflictError, SettingsStore } from './settings-store.js'

describe('SettingsStore', () => {
  it('returns safe defaults before the first write', async () => {
    const store = new SettingsStore(await mkdtemp(join(tmpdir(), 'askx-settings-')))

    const settings = await store.read()

    expect(settings.revision).toBe(0)
    expect(settings.locale).toBe('zh-CN')
    expect(settings.themeColor).toBe('cyan')
    expect(settings.skills.backupBeforeLink).toBe(true)
    expect(settings.skills.platforms).toEqual(['codex', 'claude', 'cursor'])
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

  it('shares the selected locale across clients', async () => {
    const store = new SettingsStore(await mkdtemp(join(tmpdir(), 'askx-settings-')))

    const updated = await store.update({ locale: 'en' }, { source: 'web' })

    expect(updated.locale).toBe('en')
    expect((await store.read()).locale).toBe('en')
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
})
