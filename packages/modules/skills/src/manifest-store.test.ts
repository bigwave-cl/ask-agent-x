import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SkillsManifestConflictError, SkillsManifestStore } from './manifest-store.js'

describe('SkillsManifestStore', () => {
  it('原子创建 manifest 并递增 revision', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'askx-manifest-'))
    const store = new SkillsManifestStore(dataDir)
    const now = new Date().toISOString()
    const saved = await store.write({
      version: 2,
      revision: 0,
      initializedAt: now,
      lastScan: { scannedAt: now, fingerprint: 'fingerprint', platforms: ['codex'] },
      skills: [],
      platformBindings: [],
    }, 0)

    expect(saved.revision).toBe(1)
    await expect(store.write(saved, 0)).rejects.toBeInstanceOf(SkillsManifestConflictError)
  })
})
