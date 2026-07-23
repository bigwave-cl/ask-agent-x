import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanSkills } from './scanner.js'

describe('scanSkills', () => {
  it('detects same-name content conflicts', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-home-'))
    const data = join(home, '.askx')
    await mkdir(join(home, '.codex', 'skills', 'demo'), { recursive: true })
    await mkdir(join(home, '.claude', 'skills', 'demo'), { recursive: true })
    await writeFile(join(home, '.codex', 'skills', 'demo', 'SKILL.md'), 'codex version')
    await writeFile(join(home, '.claude', 'skills', 'demo', 'SKILL.md'), 'claude version')

    const result = await scanSkills(home, data)

    expect(result.skills).toHaveLength(2)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]?.name).toBe('demo')
  })
})

