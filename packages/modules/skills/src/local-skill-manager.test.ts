import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { installBuiltinSkillManager } from './builtin-skill-manager.js'
import { applyLocalSkillMigrationPlan, createLocalSkillMigrationPlan } from './local-skill-manager.js'
import { SkillsManifestStore } from './manifest-store.js'
import {
  createSkillManagerMetadata,
  ensureAskxManagedDeclaration,
  fingerprintManagedSkill,
  inspectSkillManagerMetadata,
  writeSkillManagerMetadata,
} from './skill-manager-metadata.js'
import type { ManagedLocalSkillRecord } from './skill-types.js'

/** 当前测试创建的临时数据目录。 */
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

/** 创建包含一个 local-only Skill 的临时环境。 */
async function createFixture(): Promise<{ manifestStore: SkillsManifestStore; localSkill: ManagedLocalSkillRecord }> {
  const dataDir = await mkdtemp(join(tmpdir(), 'askx-local-skill-'))
  temporaryDirectories.push(dataDir)
  const canonicalRoot = join(dataDir, 'skills')
  const localPath = join(dataDir, 'local-skills', 'private-skill')
  await mkdir(localPath, { recursive: true })
  await writeFile(join(localPath, 'SKILL.md'), '---\nname: private-skill\ndescription: 本地专属测试\n---\n')
  await ensureAskxManagedDeclaration(localPath, true)
  const beforeMetadata = createSkillManagerMetadata((await fingerprintManagedSkill(localPath)).businessContentHash, true)
  await writeSkillManagerMetadata(localPath, beforeMetadata)
  const fingerprint = await fingerprintManagedSkill(localPath)
  const localSkill: ManagedLocalSkillRecord = {
    id: randomUUID(),
    name: 'private-skill',
    kind: 'user',
    canonicalPath: localPath,
    localPath,
    contentHash: fingerprint.contentHash,
    businessContentHash: fingerprint.businessContentHash,
    manager: {
      skillId: beforeMetadata.skill_id,
      version: beforeMetadata.version,
      localOnly: true,
      managedBy: beforeMetadata.managed_by,
      contentSha256: beforeMetadata.content_sha256,
    },
    updatedAt: new Date().toISOString(),
  }
  const systemSkill = await installBuiltinSkillManager(canonicalRoot)
  const manifestStore = new SkillsManifestStore(dataDir)
  await manifestStore.write({
    version: 3,
    revision: 0,
    initializedAt: new Date().toISOString(),
    lastScan: { scannedAt: new Date().toISOString(), fingerprint: 'fixture', platforms: ['claude'] },
    skills: [systemSkill],
    localSkills: [localSkill],
    platformBindings: [],
  }, 0)
  return { manifestStore, localSkill }
}

describe('本地专属 Skill 迁移', () => {
  it('经授权后迁移到共享源并保留身份和 usage', async () => {
    const { manifestStore, localSkill } = await createFixture()
    const plan = await createLocalSkillMigrationPlan(manifestStore, localSkill.id)
    const receipt = await applyLocalSkillMigrationPlan(manifestStore, plan, {
      planHash: plan.hash,
      confirmedAt: new Date().toISOString(),
    })
    const manifest = await manifestStore.read()
    const migrated = manifest?.skills.find(skill => skill.id === localSkill.id)
    const inspection = await inspectSkillManagerMetadata(receipt.destinationPath)
    const skillDocument = await readFile(join(receipt.destinationPath, 'SKILL.md'), 'utf8')

    expect(manifest?.localSkills).toEqual([])
    expect(migrated?.manager?.skillId).toBe(localSkill.manager?.skillId)
    expect(inspection.metadata?.local_only).toBe(false)
    expect(skillDocument).not.toContain('local-only skill')
  })

  it('来源在授权前变化时拒绝迁移且不创建共享副本', async () => {
    const { manifestStore, localSkill } = await createFixture()
    const plan = await createLocalSkillMigrationPlan(manifestStore, localSkill.id)
    await writeFile(join(localSkill.localPath, 'extra.txt'), 'changed')

    await expect(applyLocalSkillMigrationPlan(manifestStore, plan, {
      planHash: plan.hash,
      confirmedAt: new Date().toISOString(),
    })).rejects.toThrow('迁移来源或目标已经变化')
    expect((await manifestStore.read())?.localSkills).toHaveLength(1)
  })
})
