import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applySystemSkillRepairPlan, createSystemSkillRepairPlan, inspectSystemSkillManager, installBuiltinSkillManager } from './builtin-skill-manager.js'
import { SkillsManifestStore } from './manifest-store.js'
import { SkillManagerRegistryStore } from './skill-manager-registry.js'
import type { ManagedSkillRecord } from './skill-types.js'

/** 当前测试创建的临时数据目录。 */
const temporaryDirectories: string[] = []

/** 创建带默认系统 Skill 的数据目录。 */
async function createStore(): Promise<{ store: SkillManagerRegistryStore; systemSkill: ManagedSkillRecord }> {
  const dataDir = await mkdtemp(join(tmpdir(), 'askx-manager-registry-'))
  temporaryDirectories.push(dataDir)
  await mkdir(join(dataDir, 'skills'), { recursive: true })
  const systemSkill = await installBuiltinSkillManager(join(dataDir, 'skills'))
  return { store: new SkillManagerRegistryStore(dataDir), systemSkill }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('Skill Manager Registry', () => {
  it('系统 Skill 业务内容漂移时标记为损坏', async () => {
    const { store } = await createStore()
    const skillPath = join(store.dataDir, 'skills', 'askx-skill-manager', 'SKILL.md')
    await writeFile(skillPath, `${await readFile(skillPath, 'utf8')}\n测试漂移\n`, 'utf8')
    const inspection = await inspectSystemSkillManager(store.dataDir)
    expect(inspection.health).toBe('corrupt')
    expect(inspection.issues).toContain('Skill 业务内容与声明指纹不一致。')
  })

  it('usage 只更新 Registry revision，不修改版本和业务指纹', async () => {
    const { store } = await createStore()
    const initial = await store.read()
    const saved = await store.write({
      ...initial!,
      skills: {
        skill_demo: { current_name: 'demo', aliases: [], version: '26.805.1', content_sha256: 'a'.repeat(64), usage_count: 0, targets: {} },
      },
    }, initial!.revision)
    const plan = await store.planUsage('demo')
    const receipt = await store.applyUsage(plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })
    const current = await store.read()
    expect(receipt.usageCount).toBe(1)
    expect(current?.revision).toBe(saved.revision + 1)
    expect(current?.skills.skill_demo?.version).toBe('26.805.1')
    expect(current?.skills.skill_demo?.content_sha256).toBe('a'.repeat(64))
  })

  it('系统 Skill 缺失时可从最新有效备份恢复 Registry', async () => {
    const { store, systemSkill } = await createStore()
    const current = await store.read()
    await store.write({ ...current!, skills: { skill_demo: { current_name: 'demo', aliases: [], version: '26.805.1', content_sha256: 'b'.repeat(64), usage_count: 7, targets: {} } } }, current!.revision)
    const backup = join(store.dataDir, 'backups', 'skills', 'fixture', 'askx-skill-manager')
    await mkdir(join(store.dataDir, 'backups', 'skills', 'fixture'), { recursive: true })
    await cp(join(store.dataDir, 'skills', 'askx-skill-manager'), backup, { recursive: true })
    const manifestStore = new SkillsManifestStore(store.dataDir)
    await manifestStore.write({
      version: 3,
      revision: 0,
      initializedAt: new Date().toISOString(),
      lastScan: { scannedAt: new Date().toISOString(), fingerprint: 'fixture', platforms: ['claude'] },
      skills: [systemSkill],
      localSkills: [],
      platformBindings: [],
    }, 0)
    await rm(join(store.dataDir, 'skills', 'askx-skill-manager'), { recursive: true, force: true })
    const plan = await createSystemSkillRepairPlan(manifestStore)
    expect(plan.preserveRegistry).toBe(true)
    await applySystemSkillRepairPlan(manifestStore, plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })
    expect((await new SkillManagerRegistryStore(store.dataDir).stats()).totalUsage).toBe(7)
  })
})
