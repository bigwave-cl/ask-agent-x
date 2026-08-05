import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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
async function createFixture(withSkill = true) {
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
  await manifestStore.write({
    version: 3,
    revision: 0,
    initializedAt: new Date('2026-08-01T08:00:00.000Z').toISOString(),
    lastScan: { scannedAt: new Date('2026-08-01T08:00:00.000Z').toISOString(), fingerprint: 'fixture', platforms: ['claude'] },
    skills,
    localSkills: [],
    platformBindings: [{
      platform: 'claude',
      path: join(dataDir, 'claude-skills'),
      target: canonicalRoot,
      updatedAt: new Date('2026-08-01T08:00:00.000Z').toISOString(),
    }],
  }, 0)
  return { dataDir, canonicalRoot, manifestStore }
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
    const firstReceipt = await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, firstPlan, consent(firstPlan))
    expect(firstReceipt.createdBackup?.version).toBe('2026-08-03-01')
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

  it('统一源没有内容时直接幂等跳过且不创建备份', async () => {
    const fixture = await createFixture(false)
    const plan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'clear', undefined, new Date('2026-08-03T12:00:00.000Z'))
    expect(plan.backupRequired).toBe(false)
    expect(plan.backupVersion).toBeUndefined()
    const receipt = await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, plan, consent(plan))
    expect(receipt.status).toBe('skipped')
    expect(await listCanonicalSkillsBackups({ manifestStore: fixture.manifestStore })).toEqual([])
  })

  it('从备份恢复统一源和 Skill 清单并保留当前平台绑定', async () => {
    const fixture = await createFixture()
    const clearPlan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'clear', undefined, new Date('2026-08-03T12:00:00.000Z'))
    await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, clearPlan, consent(clearPlan))
    const restorePlan = await createCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, 'restore', '2026-08-03-01')
    const receipt = await applyCanonicalSourceMutationPlan({ manifestStore: fixture.manifestStore }, restorePlan, consent(restorePlan))
    expect(receipt.restoredBackupVersion).toBe('2026-08-03-01')
    expect(await readFile(join(fixture.canonicalRoot, 'demo-skill', 'SKILL.md'), 'utf8')).toContain('初始内容')
    const manifest = await fixture.manifestStore.read()
    expect(manifest?.skills.map((skill) => skill.name)).toEqual(['askx-skill-manager', 'demo-skill'])
    expect(manifest?.platformBindings.map((binding) => binding.platform)).toEqual(['claude'])
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
