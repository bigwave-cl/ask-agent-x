import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSkillsScanFingerprint, scanSkills } from './scanner.js'

/** 写入测试 Skill。 */
async function writeSkill(path: string, body: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'SKILL.md'), `---\nname: demo\ndescription: 测试能力\n---\n\n${body}\n`)
}

describe('scanSkills', () => {
  it('平台版本探测波动不会改变 Skill 安全指纹', () => {
    const base = {
      platforms: ['claude' as const],
      customRoots: [],
      locations: [],
      groups: [],
    }
    const first = createSkillsScanFingerprint({
      ...base,
      platformStatuses: [{ id: 'claude', name: 'Claude Code', skillsDir: '/tmp/.claude/skills', installed: true, skillsDirExists: true, skillsPathKind: 'directory', version: '1.0.0', linkSupported: true, notes: ['CLI'] }],
    })
    const second = createSkillsScanFingerprint({
      ...base,
      platformStatuses: [{ id: 'claude', name: 'Claude Code', skillsDir: '/tmp/.claude/skills', installed: true, skillsDirExists: true, skillsPathKind: 'directory', version: '2.0.0', linkSupported: true, notes: ['Desktop'] }],
    })

    expect(second).toBe(first)
  })

  it('未选择平台时扫描 AskX 共享与本地专属目录', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-home-'))
    const data = join(home, '.askx')
    await writeSkill(join(data, 'skills', 'managed'), 'managed')
    await writeSkill(join(data, 'local-skills', 'private'), 'private')
    await writeSkill(join(home, '.codex', 'skills', 'ignored'), 'ignored')

    const result = await scanSkills(home, data, [])

    expect(result.platforms).toEqual([])
    expect(result.locations.map(location => location.name).sort()).toEqual(['managed', 'private'])
    expect(result.locations.every(location => location.platform === 'askx')).toBe(true)
    expect(result.locations.find(location => location.name === 'managed')?.importScope).toBe('shared')
    expect(result.locations.find(location => location.name === 'private')?.importScope).toBe('local')
  })

  it('添加 Skill 时将外部来源与已有本地专属同名 Skill 合并比较', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-home-'))
    const data = join(home, '.askx')
    await writeSkill(join(data, 'local-skills', 'demo'), 'local version')
    await writeSkill(join(home, '.codex', 'skills', 'demo'), 'external version')

    const result = await scanSkills(home, data, ['codex'])
    const group = result.groups.find(entry => entry.name === 'demo')

    expect(group?.status).toBe('conflict')
    expect(group?.locations).toHaveLength(2)
    expect(group?.locations.find(location => location.platform === 'askx')?.importScope).toBe('local')
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

  it('将额外目录第一层 local 子目录中的 Skill 标记为本地范围', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-home-'))
    const data = join(home, '.askx')
    const collection = join(home, 'import-skills')
    await writeSkill(join(collection, 'shared-demo'), 'shared')
    await writeSkill(join(collection, 'local', 'private-demo'), 'private')

    const result = await scanSkills(home, data, [], [collection])
    const customLocations = result.locations.filter(location => location.platform === 'custom')

    expect(customLocations.map(location => location.name).sort()).toEqual(['private-demo', 'shared-demo'])
    expect(customLocations.find(location => location.name === 'shared-demo')?.importScope).toBe('shared')
    expect(customLocations.find(location => location.name === 'private-demo')?.importScope).toBe('local')
    expect(result.groups.some(group => group.name === 'local')).toBe(false)
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
