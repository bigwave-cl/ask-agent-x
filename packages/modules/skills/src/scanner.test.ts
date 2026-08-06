import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanSkills } from './scanner.js'

/** 写入测试 Skill。 */
async function writeSkill(path: string, body: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'SKILL.md'), `---\nname: demo\ndescription: 测试能力\n---\n\n${body}\n`)
}

describe('scanSkills', () => {
  it('未选择平台时只扫描 AskX 统一源', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-home-'))
    const data = join(home, '.askx')
    await writeSkill(join(data, 'skills', 'managed'), 'managed')
    await writeSkill(join(home, '.codex', 'skills', 'ignored'), 'ignored')

    const result = await scanSkills(home, data, [])

    expect(result.platforms).toEqual([])
    expect(result.locations.map((location) => location.name)).toEqual(['managed'])
    expect(result.locations[0]?.platform).toBe('askx')
  })

  it('按同名 Skill 检测内容冲突', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-home-'))
    const data = join(home, '.askx')
    await writeSkill(join(home, '.codex', 'skills', 'demo'), 'codex version')
    await writeSkill(join(home, '.claude', 'skills', 'demo'), 'claude version')

    const result = await scanSkills(home, data, ['codex', 'claude'])

    expect(result.locations).toHaveLength(2)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.status).toBe('conflict')
    expect(result.groups[0]?.recommendedAction).toBe('keep')
  })

  it('只扫描用户选择的平台并聚合相同内容', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-home-'))
    const data = join(home, '.askx')
    await writeSkill(join(home, '.codex', 'skills', 'demo'), 'same')
    await writeSkill(join(home, '.claude', 'skills', 'demo'), 'same')
    await writeSkill(join(home, '.cursor', 'skills', 'ignored'), 'ignored')

    const result = await scanSkills(home, data, ['codex', 'claude'])

    expect(result.platforms).toEqual(['codex', 'claude'])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.status).toBe('identical')
    expect(result.groups[0]?.recommendedAction).toBe('merge')
  })

  it('将缺少 SKILL.md 的目录标记为无效', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-home-'))
    const data = join(home, '.askx')
    await mkdir(join(home, '.codex', 'skills', 'invalid'), { recursive: true })

    const result = await scanSkills(home, data, ['codex'])

    expect(result.groups[0]?.status).toBe('invalid')
    expect(result.locations[0]?.metadata.valid).toBe(false)
  })

  it('忽略平台根目录中的隐藏管理目录', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-home-'))
    const data = join(home, '.askx')
    await mkdir(join(home, '.codex', 'skills', '.system'), { recursive: true })
    await writeSkill(join(home, '.codex', 'skills', 'visible'), 'visible')

    const result = await scanSkills(home, data, ['codex'])

    expect(result.locations.map((location) => location.name)).toEqual(['visible'])
  })

  it('扫描多个额外目录并同时支持单个 Skill 与父目录', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-home-'))
    const data = join(home, '.askx')
    const single = join(home, 'imports', 'single-skill')
    const collection = join(home, 'shared-skills')
    await writeSkill(single, 'single')
    await writeSkill(join(collection, 'alpha'), 'alpha')
    await writeSkill(join(collection, 'beta'), 'beta')

    const result = await scanSkills(home, data, ['codex'], [collection, single, collection])

    expect(result.customRoots.map((root) => root.path)).toEqual([single, collection].sort())
    expect(result.locations.filter((location) => location.platform === 'custom').map((location) => location.name).sort()).toEqual(['alpha', 'beta', 'single-skill'])
    expect(result.groups.map((group) => group.name).sort()).toEqual(['alpha', 'beta', 'single-skill'])
  })

  it('平台预设目录与自选目录使用同一目录扫描器并按绝对路径去重', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-home-'))
    const data = join(home, '.askx')
    const platformRoot = join(home, '.codex', 'skills')
    await writeSkill(join(platformRoot, 'demo'), 'same directory')

    const result = await scanSkills(home, data, ['codex'], [platformRoot])

    expect(result.customRoots).toMatchObject([{ name: 'skills', path: platformRoot }])
    expect(result.locations).toHaveLength(1)
    expect(result.locations[0]).toMatchObject({ platform: 'codex', name: 'demo' })
  })

  it('将额外目录中的无效 Skill 保留在扫描报告中', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-home-'))
    const data = join(home, '.askx')
    const invalid = join(home, 'invalid-skill')
    await mkdir(invalid, { recursive: true })
    await writeFile(join(invalid, 'SKILL.md'), 'missing frontmatter')

    const result = await scanSkills(home, data, ['codex'], [invalid])

    expect(result.groups[0]).toMatchObject({ name: 'invalid-skill', status: 'invalid' })
    expect(result.locations[0]?.platform).toBe('custom')
  })
})
