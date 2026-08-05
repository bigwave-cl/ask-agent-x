import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SkillsManifestStore } from './manifest-store.js'
import {
  applySkillManagementBatchPlan,
  applySkillManagementPlan,
  createSkillManagementBatchPlan,
  createSkillManagementPlan,
  inspectSkillManagementOverview,
} from './skill-management-manager.js'
import { inspectSkillManagerMetadata } from './skill-manager-metadata.js'
import { SkillManagerRegistryStore } from './skill-manager-registry.js'
import type { SkillsManifest } from './skill-types.js'

const temporaryRoots: string[] = []

/** 创建隔离的 AskX 数据目录。 */
async function createFixture(): Promise<{ root: string; dataDir: string; skillPath: string; manifestStore: SkillsManifestStore }> {
  const root = await mkdtemp(join(tmpdir(), 'askx-skill-management-'))
  temporaryRoots.push(root)
  const dataDir = join(root, '.askx')
  const skillPath = join(dataDir, 'skills', 'demo-skill')
  await mkdir(skillPath, { recursive: true })
  await writeFile(join(skillPath, 'SKILL.md'), '# Demo Skill\n\n保留这段业务内容。\n', 'utf8')
  const manifestStore = new SkillsManifestStore(dataDir)
  const manifest: SkillsManifest = {
    version: 3,
    revision: 0,
    initializedAt: new Date().toISOString(),
    lastScan: { scannedAt: new Date().toISOString(), fingerprint: 'fixture', platforms: ['claude'] },
    skills: [{
      id: '10000000-0000-4000-8000-000000000001',
      name: 'demo-skill',
      kind: 'user',
      canonicalPath: skillPath,
      contentHash: 'initial',
      updatedAt: new Date().toISOString(),
    }],
    localSkills: [],
    customRoots: [],
    platformBindings: [],
    customLinkBindings: [],
  }
  await manifestStore.write(manifest, 0)
  await new SkillManagerRegistryStore(dataDir).createEmpty()
  return { root, dataDir, skillPath, manifestStore }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('Skill 统计页快捷管理事务', () => {
  it('展示未纳入项，并可纳入后再无损移除管理', async () => {
    const fixture = await createFixture()
    const platformSkills = join(fixture.root, '.claude', 'skills')
    await mkdir(join(fixture.root, '.claude'), { recursive: true })
    await symlink(join(fixture.dataDir, 'skills'), platformSkills, 'dir')

    const before = await inspectSkillManagementOverview(fixture.manifestStore)
    expect(before.managed).toHaveLength(0)
    expect(before.unmanaged.map(item => item.name)).toEqual(['demo-skill'])

    const managePlan = await createSkillManagementPlan(fixture.manifestStore, '10000000-0000-4000-8000-000000000001', 'manage')
    await applySkillManagementPlan(fixture.manifestStore, managePlan, { planHash: managePlan.hash, confirmedAt: new Date().toISOString() })
    const managed = await inspectSkillManagementOverview(fixture.manifestStore)
    expect(managed.managed).toHaveLength(1)
    expect(managed.managed[0]).toMatchObject({ name: 'demo-skill', registryRegistered: true, canRemove: true })
    expect((await inspectSkillManagerMetadata(fixture.skillPath)).state).toBe('askx-managed')

    const removePlan = await createSkillManagementPlan(fixture.manifestStore, '10000000-0000-4000-8000-000000000001', 'remove')
    await applySkillManagementPlan(fixture.manifestStore, removePlan, { planHash: removePlan.hash, confirmedAt: new Date().toISOString() })
    const removed = await inspectSkillManagementOverview(fixture.manifestStore)
    expect(removed.managed).toHaveLength(0)
    expect(removed.unmanaged).toHaveLength(1)
    expect((await inspectSkillManagerMetadata(fixture.skillPath)).state).toBe('unmanaged')
    expect(await readFile(join(fixture.skillPath, 'SKILL.md'), 'utf8')).toBe('# Demo Skill\n\n保留这段业务内容。\n')
    expect(await readFile(platformSkills + '/demo-skill/SKILL.md', 'utf8')).toContain('保留这段业务内容')
    expect(Object.keys((await new SkillManagerRegistryStore(fixture.dataDir).read())!.skills)).toHaveLength(0)
    expect((await fixture.manifestStore.read())!.skills[0]!.manager).toBeUndefined()
  })

  it('计划生成后内容变化会拒绝执行', async () => {
    const fixture = await createFixture()
    const plan = await createSkillManagementPlan(fixture.manifestStore, '10000000-0000-4000-8000-000000000001', 'manage')
    await writeFile(join(fixture.skillPath, 'extra.txt'), 'changed', 'utf8')
    await expect(applySkillManagementPlan(fixture.manifestStore, plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() }))
      .rejects.toThrow('Skill 内容已经变化')
    expect((await inspectSkillManagerMetadata(fixture.skillPath)).state).toBe('unmanaged')
  })

  it('Manifest 写入失败时恢复目录内容和 Registry', async () => {
    const fixture = await createFixture()
    const plan = await createSkillManagementPlan(fixture.manifestStore, '10000000-0000-4000-8000-000000000001', 'manage')
    const originalWrite = fixture.manifestStore.write.bind(fixture.manifestStore)
    fixture.manifestStore.write = async (...args: Parameters<SkillsManifestStore['write']>) => {
      fixture.manifestStore.write = originalWrite
      throw new Error(`模拟 Manifest 写入失败：${args[1]}`)
    }
    await expect(applySkillManagementPlan(fixture.manifestStore, plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() }))
      .rejects.toThrow('模拟 Manifest 写入失败')
    expect(await readFile(join(fixture.skillPath, 'SKILL.md'), 'utf8')).toBe('# Demo Skill\n\n保留这段业务内容。\n')
    expect((await inspectSkillManagerMetadata(fixture.skillPath)).state).toBe('unmanaged')
    expect(Object.keys((await new SkillManagerRegistryStore(fixture.dataDir).read())!.skills)).toHaveLength(0)
  })

  it('一份批量计划可以同时纳入和移除，并让失败项保持原状', async () => {
    const fixture = await createFixture()
    const secondPath = join(fixture.dataDir, 'skills', 'second-skill')
    await mkdir(secondPath, { recursive: true })
    await writeFile(join(secondPath, 'SKILL.md'), '# Second Skill\n', 'utf8')
    const manifest = (await fixture.manifestStore.read())!
    await fixture.manifestStore.write({
      ...manifest,
      skills: [...manifest.skills, {
        id: '20000000-0000-4000-8000-000000000002',
        name: 'second-skill',
        kind: 'user',
        canonicalPath: secondPath,
        contentHash: 'initial',
        updatedAt: new Date().toISOString(),
      }],
    }, manifest.revision)
    const secondManagePlan = await createSkillManagementPlan(fixture.manifestStore, '20000000-0000-4000-8000-000000000002', 'manage')
    await applySkillManagementPlan(fixture.manifestStore, secondManagePlan, { planHash: secondManagePlan.hash, confirmedAt: new Date().toISOString() })

    const batchPlan = await createSkillManagementBatchPlan(fixture.manifestStore, [
      { recordId: '10000000-0000-4000-8000-000000000001', action: 'manage' },
      { recordId: '20000000-0000-4000-8000-000000000002', action: 'remove' },
    ])
    await writeFile(join(fixture.skillPath, 'changed-after-plan.txt'), 'changed', 'utf8')
    const receipt = await applySkillManagementBatchPlan(fixture.manifestStore, batchPlan, { planHash: batchPlan.hash, confirmedAt: new Date().toISOString() })
    expect(receipt.results).toEqual([
      expect.objectContaining({ skillName: 'demo-skill', status: 'failed' }),
      expect.objectContaining({ skillName: 'second-skill', status: 'applied' }),
    ])
    const overview = await inspectSkillManagementOverview(fixture.manifestStore)
    expect(overview.managed).toHaveLength(0)
    expect(overview.unmanaged.map(item => item.name)).toEqual(['demo-skill', 'second-skill'])
    expect(await readFile(join(fixture.skillPath, 'changed-after-plan.txt'), 'utf8')).toBe('changed')
    expect(await readFile(join(secondPath, 'SKILL.md'), 'utf8')).toBe('# Second Skill\n')
  })
})
