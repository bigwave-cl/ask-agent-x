import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyCanonicalSourceMutationPlan,
  createCanonicalSourceMutationPlan,
  listCanonicalSkillsBackups,
} from './canonical-source-manager.js'
import { installBuiltinSkillManager } from './builtin-skill-manager.js'
import { SkillsManifestStore } from './manifest-store.js'
import { hashSkillDirectory } from './scanner.js'

/** 当前测试创建的临时数据目录。 */
const temporaryDirectories: string[] = []

/** 创建已经初始化的统一源测试环境。 */
async function createFixture(withSkill = true, withBinding = true) {
  const dataDir = await mkdtemp(join(tmpdir(), 'askx-canonical-source-'))
  temporaryDirectories.push(dataDir)
  const canonicalRoot = join(dataDir, 'skills')
  await mkdir(canonicalRoot, { recursive: true })
  const manifestStore = new SkillsManifestStore(dataDir)
  const skills = [await installBuiltinSkillManager(canonicalRoot)]
  if (withSkill) {
    const skillPath = join(canonicalRoot, 'demo-skill')
    await mkdir(skillPath)
    await writeFile(join(skillPath, 'SKILL.md'), '---\nname: demo-skill\nversion: 1.0.0\n---\n\n初始内容\n')
    skills.push({
      id: randomUUID(),
      name: 'demo-skill',
      canonicalPath: skillPath,
      contentHash: await hashSkillDirectory(skillPath),
      updatedAt: new Date('2026-08-01T08:00:00.000Z').toISOString(),
    })
  }
  if (withBinding) await symlink(canonicalRoot, join(dataDir, 'claude-skills'), 'dir')
  await manifestStore.write({
    version: 3,
    revision: 0,
    initializedAt: new Date('2026-08-01T08:00:00.000Z').toISOString(),
    lastScan: { scannedAt: new Date('2026-08-01T08:00:00.000Z').toISOString(), fingerprint: 'fixture', platforms: ['claude'] },
    skills,
    localSkills: [],
    platformBindings: withBinding ? [{
      platform: 'claude',
      path: join(dataDir, 'claude-skills'),
      target: canonicalRoot,
      updatedAt: new Date('2026-08-01T08:00:00.000Z').toISOString(),
    }] : [],
  }, 0)
  return { dataDir, canonicalRoot, manifestStore }
}

/** 在测试环境中加入一个本地专属 Skill。 */
async function addLocalSkill(fixture: Awaited<ReturnType<typeof createFixture>>, name = 'private-skill') {
  const localPath = join(fixture.dataDir, 'local-skills', name)
  await mkdir(localPath, { recursive: true })
  await writeFile(join(localPath, 'SKILL.md'), `---\nname: ${name}\n---\n\n本地内容\n`)
  const manifest = await fixture.manifestStore.read()
  if (!manifest) throw new Error('测试 manifest 缺失。')
  await fixture.manifestStore.write({
    ...manifest,
    localSkills: [{
      id: randomUUID(),
      name,
      kind: 'user',
      canonicalPath: localPath,
      localPath,
      contentHash: await hashSkillDirectory(localPath),
      updatedAt: new Date('2026-08-01T08:00:00.000Z').toISOString(),
    }],
  }, manifest.revision)
  return localPath
}

/** 为计划创建匹配的用户确认。 */
function consent(plan: { hash: string }) {
  return { planHash: plan.hash, confirmedAt: new Date().toISOString() }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('统一 Skill 来源备份管理', () => {
  it('清空非空统一源前按年月日次数创建长期备份', async () => {
    const fixture = await createFixture()
    const now = new Date('2026-08-03T12:00:00.000Z')
    const firstPlan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'clear', undefined, now)
    expect(firstPlan.backupRequired).toBe(true)
    expect(firstPlan.backupVersion).toBe('2026-08-03-01')
    expect(firstPlan.backupLabel).toBe('2026-08-03-01')
    const firstReceipt = await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, firstPlan, consent(firstPlan))
    expect(firstReceipt.createdBackup?.version).toBe('2026-08-03-01')
    expect(firstReceipt.createdBackup?.label).toBe('2026-08-03-01')
    expect(firstReceipt.clearBackupSummary).toMatchObject({
      links: [{ name: 'claude', status: 'backed-up' }],
      skills: { cleared: 1, notCleared: 0, backedUp: 1, notBackedUp: 0, failed: 0 },
      linkSummary: {
        cleared: [{ name: 'claude' }],
        notCleared: [],
        backedUp: [{ name: 'claude' }],
        notBackedUp: [],
      },
      backupVersion: '2026-08-03-01',
    })
    expect(firstReceipt.clearBackupSummary?.backupPath).toBe(join(fixture.dataDir, 'backups', 'skills-source', '2026-08-03-01'))
    expect(await readdir(fixture.canonicalRoot)).toEqual(['askx-skill-manager'])
    expect((await fixture.manifestStore.read())?.skills.map((skill) => skill.name)).toEqual(['askx-skill-manager'])

    await mkdir(join(fixture.canonicalRoot, 'later-skill'))
    await writeFile(join(fixture.canonicalRoot, 'later-skill', 'SKILL.md'), '# 后续内容\n')
    const secondPlan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'clear', undefined, now)
    expect(secondPlan.backupVersion).toBe('2026-08-03-02')
    await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, secondPlan, consent(secondPlan))
    expect((await listCanonicalSkillsBackups({ manifestStore: fixture.manifestStore })).map((backup) => backup.version)).toEqual([
      '2026-08-03-02',
      '2026-08-03-01',
    ])
  })

  it('保存用户自定义备份名称并拒绝重复名称', async () => {
    const fixture = await createFixture()
    const now = new Date('2026-08-03T12:00:00.000Z')
    const plan = await createCanonicalSourceMutationPlan(
      { manifestStore: fixture.manifestStore },
      'clear',
      undefined,
      now,
      ['links', 'skills'],
      true,
      '调整 Skill 配置前',
    )
    expect(plan.backupLabel).toBe('调整 Skill 配置前')
    const receipt = await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, plan, consent(plan))
    expect(receipt.createdBackup?.label).toBe('调整 Skill 配置前')
    expect(receipt.clearBackupSummary?.backupLabel).toBe('调整 Skill 配置前')

    await mkdir(join(fixture.canonicalRoot, 'later-skill'))
    await writeFile(join(fixture.canonicalRoot, 'later-skill', 'SKILL.md'), '# 后续内容\n')
    await expect(createCanonicalSourceMutationPlan(
      { manifestStore: fixture.manifestStore },
      'clear',
      undefined,
      now,
      ['skills'],
      true,
      '调整 Skill 配置前',
    )).rejects.toThrow('备份名称已存在')
  })

  it('统一源没有内容时直接幂等跳过且不创建备份', async () => {
    const fixture = await createFixture(false, false)
    const plan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'clear', undefined, new Date('2026-08-03T12:00:00.000Z'))
    expect(plan.backupRequired).toBe(false)
    expect(plan.backupVersion).toBeUndefined()
    const receipt = await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, plan, consent(plan))
    expect(receipt.status).toBe('skipped')
    expect(receipt.clearBackupSummary).toEqual({
      links: [],
      skills: { cleared: 0, notCleared: 0, backedUp: 0, notBackedUp: 0, failed: 0 },
      linkSummary: { cleared: [], notCleared: [], backedUp: [], notBackedUp: [] },
    })
    expect(await listCanonicalSkillsBackups({ manifestStore: fixture.manifestStore })).toEqual([])
  })

  it('用户取消备份后清空数据但不创建长期备份', async () => {
    const fixture = await createFixture()
    const plan = await createCanonicalSourceMutationPlan(
      { manifestStore: fixture.manifestStore },
      'clear',
      undefined,
      new Date('2026-08-03T12:00:00.000Z'),
      ['links', 'skills'],
      false,
    )
    expect(plan.backupRequested).toBe(false)
    expect(plan.backupRequired).toBe(false)
    expect(plan.backupVersion).toBeUndefined()
    const receipt = await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, plan, consent(plan))
    expect(receipt.createdBackup).toBeUndefined()
    expect(receipt.clearBackupSummary).toMatchObject({
      links: [],
      skills: { cleared: 1, notCleared: 0, backedUp: 0, notBackedUp: 1, failed: 0 },
      linkSummary: { cleared: [{ name: 'claude' }], notCleared: [], backedUp: [], notBackedUp: [{ name: 'claude' }] },
    })
    expect(await listCanonicalSkillsBackups({ manifestStore: fixture.manifestStore })).toEqual([])
    expect(await readdir(fixture.canonicalRoot)).toEqual(['askx-skill-manager'])
  })

  it('清空 Skill 时一并备份并清除本地专属 Skill', async () => {
    const fixture = await createFixture()
    const localPath = await addLocalSkill(fixture)
    const plan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'clear', undefined, new Date('2026-08-03T12:00:00.000Z'))
    expect(plan.currentSkillCount).toBe(2)
    const receipt = await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, plan, consent(plan))
    expect(receipt.clearBackupSummary?.skills).toEqual({ cleared: 2, notCleared: 0, backedUp: 2, notBackedUp: 0, failed: 0 })
    expect(await readdir(join(fixture.dataDir, 'local-skills'))).toEqual([])
    expect((await fixture.manifestStore.read())?.localSkills).toEqual([])
    await expect(readFile(join(localPath, 'SKILL.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

    const restorePlan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'restore', '2026-08-03-01')
    await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, restorePlan, consent(restorePlan))
    expect(await readFile(join(localPath, 'SKILL.md'), 'utf8')).toContain('本地内容')
    expect((await fixture.manifestStore.read())?.localSkills?.map(skill => skill.name)).toEqual(['private-skill'])
  })

  it('仅清空 Skill 时保留现有软链配置', async () => {
    const fixture = await createFixture()
    const plan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'clear', undefined, new Date('2026-08-03T12:00:00.000Z'), ['skills'])
    expect(plan.clearModules).toEqual(['skills'])
    expect(plan.linkBindings).toEqual([])
    await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, plan, consent(plan))
    expect((await fixture.manifestStore.read())?.platformBindings.map((binding) => binding.platform)).toEqual(['claude'])
    expect(await readFile(join(fixture.dataDir, 'claude-skills', 'askx-skill-manager', 'SKILL.md'), 'utf8')).toContain('askx-skill-manager')
  })

  it('仅清空软链时保留用户 Skill 并删除绑定配置', async () => {
    const fixture = await createFixture()
    const plan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'clear', undefined, new Date('2026-08-03T12:00:00.000Z'), ['links'])
    expect(plan.clearModules).toEqual(['links'])
    const receipt = await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, plan, consent(plan))
    expect(receipt.clearBackupSummary?.skills).toEqual({ cleared: 0, notCleared: 1, backedUp: 0, notBackedUp: 1, failed: 0 })
    expect((await fixture.manifestStore.read())?.platformBindings).toEqual([])
    expect(await readFile(join(fixture.canonicalRoot, 'demo-skill', 'SKILL.md'), 'utf8')).toContain('初始内容')
  })

  it('从备份恢复统一源和 Skill 清单且不自动重建已清空的软链', async () => {
    const fixture = await createFixture()
    const clearPlan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'clear', undefined, new Date('2026-08-03T12:00:00.000Z'))
    await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, clearPlan, consent(clearPlan))
    const restorePlan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'restore', '2026-08-03-01')
    const receipt = await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, restorePlan, consent(restorePlan))
    expect(receipt.restoredBackupVersion).toBe('2026-08-03-01')
    expect(await readFile(join(fixture.canonicalRoot, 'demo-skill', 'SKILL.md'), 'utf8')).toContain('初始内容')
    const manifest = await fixture.manifestStore.read()
    expect(manifest?.skills.map((skill) => skill.name)).toEqual(['askx-skill-manager', 'demo-skill'])
    expect(manifest?.platformBindings).toEqual([])
  })

  it('永久删除备份后无法再次恢复', async () => {
    const fixture = await createFixture()
    const clearPlan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'clear', undefined, new Date('2026-08-03T12:00:00.000Z'))
    await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, clearPlan, consent(clearPlan))
    const deletePlan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'delete-backup', '2026-08-03-01')
    const receipt = await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, deletePlan, consent(deletePlan))
    expect(receipt.deletedBackupVersion).toBe('2026-08-03-01')
    expect(await listCanonicalSkillsBackups({ manifestStore: fixture.manifestStore })).toEqual([])
    await expect(createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'restore', '2026-08-03-01')).rejects.toThrow('不存在')
  })

  it('统一源在确认前发生变化时拒绝执行过期计划', async () => {
    const fixture = await createFixture()
    const plan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'clear', undefined, new Date('2026-08-03T12:00:00.000Z'))
    await writeFile(join(fixture.canonicalRoot, 'demo-skill', 'SKILL.md'), '# 外部修改\n')
    await expect(applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, plan, consent(plan))).rejects.toThrow('已经变化')
  })
})
