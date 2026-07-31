import { access, lstat, mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stableHash } from '@askx/core'
import { describe, expect, it } from 'vitest'
import { SkillsManager } from './skills-module.js'

/** 创建结构有效的测试 Skill。 */
async function createSkill(home: string, platform: 'codex' | 'claude' | 'cursor', name: string, content: string): Promise<void> {
  const platformDirectory = platform === 'claude' ? '.claude' : `.${platform}`
  const path = join(home, platformDirectory, 'skills', name)
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'SKILL.md'), `---\nname: ${name}\ndescription: 测试 Skill\n---\n\n${content}\n`)
}

describe('SkillsManager', () => {
  it('扫描为空时也能通过空计划完成初始化', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-empty-home-'))
    const dataDir = join(homeDir, '.askx')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const plan = await manager.planOnboarding({ platforms: ['codex'], detectionFingerprint: report.fingerprint, settingsRevision: 0, decisions: [] })

    const receipt = await manager.applyOnboarding(plan, 0)
    const bootstrap = await manager.bootstrap()

    expect(receipt.results).toEqual([])
    expect(bootstrap.initialized).toBe(true)
    expect(bootstrap.canonicalSkillsDir).toBe(join(dataDir, 'skills'))
  })

  it('接管有效 Skill 并登记统一源', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-adopt-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'demo', 'demo body')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const source = report.groups[0]!.locations[0]!
    const plan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 2,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id, platforms: ['codex'] }],
    })

    const receipt = await manager.applyOnboarding(plan, 2)
    const bootstrap = await manager.bootstrap()

    expect(receipt.results[0]?.status).toBe('applied')
    expect(bootstrap.managedSkills[0]?.name).toBe('demo')
    expect(bootstrap.managedHealth[0]).toMatchObject({ drifted: false, brokenBindings: 0 })
    expect(await readFile(join(dataDir, 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain('demo body')
    expect((await lstat(join(dataDir, 'skills', 'demo'))).isDirectory()).toBe(true)
  })

  it('可以从额外目录接管 Skill，但不会归档原目录', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-custom-home-'))
    const dataDir = join(homeDir, '.askx')
    const customSkill = join(homeDir, 'imports', 'custom-demo')
    await mkdir(customSkill, { recursive: true })
    await writeFile(join(customSkill, 'SKILL.md'), '---\nname: custom-demo\ndescription: 自选来源\n---\n\ncustom body\n')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'], [customSkill])
    const source = report.groups[0]!.locations[0]!
    const plan = await manager.planOnboarding({
      platforms: ['codex'],
      customRoots: [customSkill],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id, platforms: ['codex'] }],
    })

    const receipt = await manager.applyOnboarding(plan, 0)

    expect(receipt.results[0]?.status).toBe('applied')
    expect(await readFile(join(customSkill, 'SKILL.md'), 'utf8')).toContain('custom body')
    expect(await readFile(join(dataDir, 'skills', 'custom-demo', 'SKILL.md'), 'utf8')).toContain('custom body')
  })

  it('拒绝将额外扫描目录直接移入备份区', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-custom-archive-home-'))
    const dataDir = join(homeDir, '.askx')
    const customSkill = join(homeDir, 'external-skill')
    await mkdir(customSkill, { recursive: true })
    await writeFile(join(customSkill, 'SKILL.md'), '---\nname: external-skill\n---\n')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'], [customSkill])

    await expect(manager.planOnboarding({
      platforms: ['codex'],
      customRoots: [customSkill],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'archive', locationIds: [report.locations[0]!.id] }],
    })).rejects.toThrow('不能归档')
  })

  it('计划生成后内容变化会拒绝应用', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-stale-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'demo', 'before')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const source = report.groups[0]!.locations[0]!
    const plan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id, platforms: ['codex'] }],
    })
    await writeFile(join(source.path, 'SKILL.md'), 'changed')

    await expect(manager.applyOnboarding(plan, 0)).rejects.toThrow('重新扫描')
  })

  it('单个 Skill 失败不会撤销其他成功单元', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-partial-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'alpha', 'alpha')
    await mkdir(join(homeDir, '.codex', 'skills'), { recursive: true })
    await symlink(join(homeDir, '.codex', 'skills', 'alpha'), join(homeDir, '.codex', 'skills', 'beta'), 'dir')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const alpha = report.groups.find((group) => group.name === 'alpha')!.locations[0]!
    const beta = report.groups.find((group) => group.name === 'beta')!.locations[0]!
    const plan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [
        { kind: 'archive', locationIds: [alpha.id] },
        { kind: 'adopt', sourceLocationId: beta.id, platforms: ['codex'] },
      ],
    })

    const receipt = await manager.applyOnboarding(plan, 0)

    expect(receipt.results.map((result) => result.status)).toContain('applied')
    expect(receipt.results.map((result) => result.status)).toContain('rolled-back')
    expect((await manager.bootstrap()).managedSkills).toEqual([])
  })

  it('计划要求每个扫描分组恰好提交一项决策', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-decisions-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'alpha', 'alpha')
    await createSkill(homeDir, 'codex', 'beta', 'beta')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const alpha = report.groups.find((group) => group.name === 'alpha')!.locations[0]!

    await expect(manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: alpha.id, platforms: ['codex'] }],
    })).rejects.toThrow('每个扫描分组')
  })

  it('执行前会拒绝重新计算 hash 的不完整计划', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-tampered-plan-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'alpha', 'alpha')
    await createSkill(homeDir, 'codex', 'beta', 'beta')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const plan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: report.groups.map((group) => ({ kind: 'keep' as const, groupId: group.id })),
    })
    const { hash: _hash, ...unsigned } = plan
    const incomplete = { ...unsigned, units: unsigned.units.slice(0, 1) }

    await expect(manager.applyOnboarding({ ...incomplete, hash: stableHash(incomplete) }, 0)).rejects.toThrow('每个扫描分组')
  })

  it('可以按批次回执恢复首次接管', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-rollback-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'demo', 'rollback body')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const source = report.groups[0]!.locations[0]!
    const plan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id, platforms: ['codex'] }],
    })
    const receipt = await manager.applyOnboarding(plan, 0)

    const rollback = await manager.rollbackReceipt(receipt.id)

    expect(rollback.rolledBack).toBe(true)
    expect((await manager.bootstrap()).initialized).toBe(false)
    await expect(access(join(dataDir, 'skills', 'demo'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('统一源被外部修改后拒绝恢复', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-drifted-rollback-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'demo', 'original body')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const source = report.groups[0]!.locations[0]!
    const plan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id, platforms: ['codex'] }],
    })
    const receipt = await manager.applyOnboarding(plan, 0)
    await writeFile(join(dataDir, 'skills', 'demo', 'SKILL.md'), 'user changed content')

    const rollback = await manager.rollbackReceipt(receipt.id)

    expect(rollback.rolledBack).toBe(false)
    expect(rollback.warnings.join('\n')).toContain('统一源内容已经变化')
    expect((await manager.bootstrap()).initialized).toBe(true)
  })
})
