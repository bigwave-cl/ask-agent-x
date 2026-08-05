import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applySkillCopyBatchPlan, applySkillCopyPlan, createSkillCopyBatchPlan, createSkillCopyPlan } from './skill-copy-manager.js'
import { SkillsManifestStore } from './manifest-store.js'
import { hashSkillDirectory } from './scanner.js'

/** 当前测试创建的临时用户目录。 */
const temporaryDirectories: string[] = []

/** 创建一个仅包含单个统一源 Skill 的测试环境。 */
async function createFixture() {
  const homeDir = await mkdtemp(join(tmpdir(), 'askx-skill-copy-'))
  temporaryDirectories.push(homeDir)
  const dataDir = join(homeDir, '.askx')
  const skillId = randomUUID()
  const skillPath = join(dataDir, 'skills', 'demo-skill')
  await mkdir(skillPath, { recursive: true })
  await writeFile(join(skillPath, 'SKILL.md'), '---\nname: demo-skill\ndescription: 同步测试\n---\n\ncanonical\n')
  const contentHash = await hashSkillDirectory(skillPath)
  const manifestStore = new SkillsManifestStore(dataDir)
  await manifestStore.write({
    version: 2,
    revision: 0,
    initializedAt: new Date().toISOString(),
    lastScan: { scannedAt: new Date().toISOString(), fingerprint: 'fixture', platforms: ['claude'] },
    skills: [{ id: skillId, name: 'demo-skill', canonicalPath: skillPath, contentHash, updatedAt: new Date().toISOString() }],
    platformBindings: [],
  }, 0)
  return { homeDir, dataDir, skillId, skillPath, contentHash, manifestStore }
}

/** 向测试统一源追加一个受管 Skill。 */
async function addManagedSkill(fixture: Awaited<ReturnType<typeof createFixture>>, name: string): Promise<string> {
  const id = randomUUID()
  const canonicalPath = join(fixture.dataDir, 'skills', name)
  await mkdir(canonicalPath, { recursive: true })
  await writeFile(join(canonicalPath, 'SKILL.md'), `---\nname: ${name}\ndescription: 批量同步测试\n---\n\n${name}\n`)
  const contentHash = await hashSkillDirectory(canonicalPath)
  const manifest = (await fixture.manifestStore.read())!
  await fixture.manifestStore.write({
    ...manifest,
    skills: [...manifest.skills, { id, name, canonicalPath, contentHash, updatedAt: new Date().toISOString() }],
  }, manifest.revision)
  return id
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('单 Skill 安全同步', () => {
  it('将统一源 Skill 复制到一个本地容器目录并保存回执', async () => {
    const fixture = await createFixture()
    const targetRoot = join(fixture.homeDir, 'shared-skills')
    await mkdir(targetRoot)
    const context = { homeDir: fixture.homeDir, manifestStore: fixture.manifestStore }
    const plan = await createSkillCopyPlan(context, fixture.skillId, { kind: 'folder', path: targetRoot }, 'keep')

    expect(plan.targetState).toBe('missing')
    const receipt = await applySkillCopyPlan(context, plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })

    expect(receipt.status).toBe('applied')
    expect(await readFile(join(targetRoot, 'demo-skill', 'SKILL.md'), 'utf8')).toContain('canonical')
    expect(await readFile(join(fixture.dataDir, 'transactions', 'skill-copies', `${receipt.id}.json`), 'utf8')).toContain(receipt.planHash)
  })

  it('目标内容相同时幂等跳过且不创建备份', async () => {
    const fixture = await createFixture()
    const targetRoot = join(fixture.homeDir, 'shared-skills')
    const targetSkill = join(targetRoot, 'demo-skill')
    await mkdir(targetRoot)
    await mkdir(targetSkill)
    await writeFile(join(targetSkill, 'SKILL.md'), await readFile(join(fixture.skillPath, 'SKILL.md')))
    const context = { homeDir: fixture.homeDir, manifestStore: fixture.manifestStore }
    const plan = await createSkillCopyPlan(context, fixture.skillId, { kind: 'folder', path: targetRoot }, 'replace')

    expect(plan.targetState).toBe('identical')
    const receipt = await applySkillCopyPlan(context, plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })

    expect(receipt).toMatchObject({ status: 'skipped', contentHash: fixture.contentHash })
    expect(receipt).not.toHaveProperty('backup')
  })

  it('平台未通过软链接入时可以创建 Skills 根目录并复制单个 Skill', async () => {
    const fixture = await createFixture()
    const context = { homeDir: fixture.homeDir, manifestStore: fixture.manifestStore }
    const plan = await createSkillCopyPlan(context, fixture.skillId, { kind: 'platform', platform: 'claude' }, 'keep')

    expect(plan).toMatchObject({ targetState: 'missing', targetRoot: join(fixture.homeDir, '.claude', 'skills') })
    const receipt = await applySkillCopyPlan(context, plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })

    expect(receipt.status).toBe('applied')
    expect(await readdir(join(fixture.homeDir, '.claude', 'skills'))).toEqual(['demo-skill'])
    expect(await readFile(join(fixture.homeDir, '.claude', 'skills', 'demo-skill', 'SKILL.md'), 'utf8')).toContain('canonical')
  })

  it('目标冲突时默认保留，明确覆盖时先备份原目录', async () => {
    const fixture = await createFixture()
    const targetRoot = join(fixture.homeDir, 'shared-skills')
    const targetSkill = join(targetRoot, 'demo-skill')
    await mkdir(targetSkill, { recursive: true })
    await writeFile(join(targetSkill, 'SKILL.md'), 'target version\n')
    const context = { homeDir: fixture.homeDir, manifestStore: fixture.manifestStore }

    const keepPlan = await createSkillCopyPlan(context, fixture.skillId, { kind: 'folder', path: targetRoot }, 'keep')
    const keepReceipt = await applySkillCopyPlan(context, keepPlan, { planHash: keepPlan.hash, confirmedAt: new Date().toISOString() })
    expect(keepReceipt.status).toBe('skipped')
    expect(await readFile(join(targetSkill, 'SKILL.md'), 'utf8')).toBe('target version\n')

    const replacePlan = await createSkillCopyPlan(context, fixture.skillId, { kind: 'folder', path: targetRoot }, 'replace')
    const replaceReceipt = await applySkillCopyPlan(context, replacePlan, { planHash: replacePlan.hash, confirmedAt: new Date().toISOString() })
    expect(replaceReceipt.status).toBe('applied')
    expect(await readFile(join(targetSkill, 'SKILL.md'), 'utf8')).toContain('canonical')
    expect(await readFile(join(replaceReceipt.backup!.backupPath, 'SKILL.md'), 'utf8')).toBe('target version\n')
  })

  it('目标在确认前发生变化时拒绝写入', async () => {
    const fixture = await createFixture()
    const targetRoot = join(fixture.homeDir, 'shared-skills')
    await mkdir(targetRoot)
    const context = { homeDir: fixture.homeDir, manifestStore: fixture.manifestStore }
    const plan = await createSkillCopyPlan(context, fixture.skillId, { kind: 'folder', path: targetRoot }, 'keep')
    const targetSkill = join(targetRoot, 'demo-skill')
    await mkdir(targetSkill)
    await writeFile(join(targetSkill, 'SKILL.md'), 'external change\n')

    await expect(applySkillCopyPlan(context, plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })).rejects.toThrow('同步目标已经变化')
    expect(await readFile(join(targetSkill, 'SKILL.md'), 'utf8')).toBe('external change\n')
  })

  it('平台已通过根目录软链接入时拒绝重复复制', async () => {
    const fixture = await createFixture()
    const manifest = (await fixture.manifestStore.read())!
    const platformPath = join(fixture.homeDir, '.claude', 'skills')
    await fixture.manifestStore.write({
      ...manifest,
      platformBindings: [{ platform: 'claude', path: platformPath, target: join(fixture.dataDir, 'skills'), updatedAt: new Date().toISOString() }],
    }, manifest.revision)

    await expect(createSkillCopyPlan(
      { homeDir: fixture.homeDir, manifestStore: fixture.manifestStore },
      fixture.skillId,
      { kind: 'platform', platform: 'claude' },
      'keep',
    )).rejects.toThrow('已经通过软链使用统一源')
  })

  it('拒绝把 AskX 内部数据目录作为复制目标', async () => {
    const fixture = await createFixture()

    await expect(createSkillCopyPlan(
      { homeDir: fixture.homeDir, manifestStore: fixture.manifestStore },
      fixture.skillId,
      { kind: 'folder', path: fixture.dataDir },
      'keep',
    )).rejects.toThrow('AskX 内部数据目录')
  })
})

describe('批量 Skill 安全同步', () => {
  it('把多个 Skill 复制到多个目标且选择阶段保持只读', async () => {
    const fixture = await createFixture()
    const secondSkillId = await addManagedSkill(fixture, 'second-skill')
    const firstTarget = join(fixture.homeDir, 'first-target')
    const secondTarget = join(fixture.homeDir, 'second-target')
    await Promise.all([mkdir(firstTarget), mkdir(secondTarget)])
    const context = { homeDir: fixture.homeDir, manifestStore: fixture.manifestStore }
    const targets = [{ kind: 'folder' as const, path: firstTarget }, { kind: 'folder' as const, path: secondTarget }]
    const selections = [fixture.skillId, secondSkillId].flatMap((skillId) => targets.map((target) => ({ skillId, target, conflictStrategy: 'keep' as const })))

    const plan = await createSkillCopyBatchPlan(context, selections)

    expect(plan.units).toHaveLength(4)
    expect(await readdir(firstTarget)).toEqual([])
    expect(await readdir(secondTarget)).toEqual([])
    const receipt = await applySkillCopyBatchPlan(context, plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })
    expect(receipt.results.every((result) => result.status === 'applied')).toBe(true)
    expect(await readdir(firstTarget)).toEqual(['demo-skill', 'second-skill'])
    expect(await readdir(secondTarget)).toEqual(['demo-skill', 'second-skill'])
  })

  it('在计划中集中标记内容冲突和内容一致项', async () => {
    const fixture = await createFixture()
    const secondSkillId = await addManagedSkill(fixture, 'second-skill')
    const targetRoot = join(fixture.homeDir, 'shared-target')
    await mkdir(join(targetRoot, 'demo-skill'), { recursive: true })
    await writeFile(join(targetRoot, 'demo-skill', 'SKILL.md'), 'different\n')
    await mkdir(join(targetRoot, 'second-skill'))
    await writeFile(join(targetRoot, 'second-skill', 'SKILL.md'), await readFile(join(fixture.dataDir, 'skills', 'second-skill', 'SKILL.md')))
    const context = { homeDir: fixture.homeDir, manifestStore: fixture.manifestStore }
    const target = { kind: 'folder' as const, path: targetRoot }

    const plan = await createSkillCopyBatchPlan(context, [
      { skillId: fixture.skillId, target, conflictStrategy: 'keep' },
      { skillId: secondSkillId, target, conflictStrategy: 'keep' },
    ])

    expect(plan.units.map((unit) => [unit.skillName, unit.targetState])).toEqual([
      ['demo-skill', 'conflict'],
      ['second-skill', 'identical'],
    ])
    expect(await readFile(join(targetRoot, 'demo-skill', 'SKILL.md'), 'utf8')).toBe('different\n')
  })

  it('一个目标在确认前变化时只让对应组合失败', async () => {
    const fixture = await createFixture()
    const changedTarget = join(fixture.homeDir, 'changed-target')
    const stableTarget = join(fixture.homeDir, 'stable-target')
    await Promise.all([mkdir(changedTarget), mkdir(stableTarget)])
    const context = { homeDir: fixture.homeDir, manifestStore: fixture.manifestStore }
    const plan = await createSkillCopyBatchPlan(context, [
      { skillId: fixture.skillId, target: { kind: 'folder', path: changedTarget }, conflictStrategy: 'keep' },
      { skillId: fixture.skillId, target: { kind: 'folder', path: stableTarget }, conflictStrategy: 'keep' },
    ])
    await mkdir(join(changedTarget, 'demo-skill'))
    await writeFile(join(changedTarget, 'demo-skill', 'SKILL.md'), 'external change\n')

    const receipt = await applySkillCopyBatchPlan(context, plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })

    expect(receipt.results.map((result) => result.status)).toEqual(['failed', 'applied'])
    expect(await readFile(join(changedTarget, 'demo-skill', 'SKILL.md'), 'utf8')).toBe('external change\n')
    expect(await readFile(join(stableTarget, 'demo-skill', 'SKILL.md'), 'utf8')).toContain('canonical')
  })

  it('批量授权 hash 不匹配时不执行任何组合', async () => {
    const fixture = await createFixture()
    const targetRoot = join(fixture.homeDir, 'shared-target')
    await mkdir(targetRoot)
    const context = { homeDir: fixture.homeDir, manifestStore: fixture.manifestStore }
    const plan = await createSkillCopyBatchPlan(context, [{
      skillId: fixture.skillId,
      target: { kind: 'folder', path: targetRoot },
      conflictStrategy: 'keep',
    }])

    await expect(applySkillCopyBatchPlan(context, plan, { planHash: 'invalid', confirmedAt: new Date().toISOString() })).rejects.toThrow('批量同步计划或用户授权已经失效')
    expect(await readdir(targetRoot)).toEqual([])
  })
})
