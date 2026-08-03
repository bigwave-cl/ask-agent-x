import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SkillsManifestStore } from './manifest-store.js'
import { applySkillFileUpdatePlan, createSkillFileUpdatePlan, inspectManagedSkillDetail, readManagedSkillFile } from './skill-file-manager.js'
import { hashSkillDirectory } from './scanner.js'

/** 当前测试创建的临时数据目录。 */
const temporaryDirectories: string[] = []

/** 创建一个带版本元数据的受管 Skill 测试环境。 */
async function createFixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'askx-skill-files-'))
  temporaryDirectories.push(dataDir)
  const skillId = randomUUID()
  const skillPath = join(dataDir, 'skills', 'demo-skill')
  await mkdir(join(skillPath, 'references'), { recursive: true })
  await writeFile(join(skillPath, 'SKILL.md'), '---\nname: demo-skill\ndescription: 用于验证资源编辑\nversion: 1.2.3\n---\n\n旧内容\n')
  await writeFile(join(skillPath, 'references', 'guide.md'), '# 指南\n')
  await writeFile(join(skillPath, '.skill-manager.json'), '{"version":"2.0.0"}\n')
  await writeFile(join(skillPath, 'config.local.json.example'), '{"endpoint":"http://127.0.0.1"}\n')
  const contentHash = await hashSkillDirectory(skillPath)
  const manifestStore = new SkillsManifestStore(dataDir)
  await manifestStore.write({
    version: 2,
    revision: 0,
    initializedAt: new Date().toISOString(),
    lastScan: { scannedAt: new Date().toISOString(), fingerprint: 'fixture', platforms: ['codex'] },
    skills: [{ id: skillId, name: 'demo-skill', canonicalPath: skillPath, contentHash, updatedAt: new Date().toISOString() }],
    platformBindings: [],
  }, 0)
  return { dataDir, skillId, skillPath, manifestStore }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('Skill 文件管理', () => {
  it('展示版本、描述和不跟随软链接的目录树', async () => {
    const fixture = await createFixture()
    const detail = await inspectManagedSkillDetail({ manifestStore: fixture.manifestStore }, fixture.skillId)
    expect(detail.version).toBe('2.0.0')
    expect(detail.description).toBe('用于验证资源编辑')
    expect(detail.fileCount).toBe(4)
    expect(detail.tree.map((node) => node.name)).toContain('references')
  })

  it('允许查看和编辑带模板后缀的已知文本文件', async () => {
    const fixture = await createFixture()
    const detail = await inspectManagedSkillDetail({ manifestStore: fixture.manifestStore }, fixture.skillId)
    const templateNode = detail.tree.find((node) => node.name === 'config.local.json.example')
    expect(templateNode?.editable).toBe(true)

    const current = await readManagedSkillFile({ manifestStore: fixture.manifestStore }, fixture.skillId, 'config.local.json.example')
    expect(current.language).toBe('json')
    const nextContent = current.content.replace('127.0.0.1', 'localhost')
    const plan = await createSkillFileUpdatePlan({ manifestStore: fixture.manifestStore }, fixture.skillId, current.path, nextContent, current.contentHash)
    await applySkillFileUpdatePlan({ manifestStore: fixture.manifestStore }, plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })
    expect(await readFile(join(fixture.skillPath, 'config.local.json.example'), 'utf8')).toContain('localhost')
  })

  it('经过计划和授权后原子更新文件并推进 manifest revision', async () => {
    const fixture = await createFixture()
    const current = await readManagedSkillFile({ manifestStore: fixture.manifestStore }, fixture.skillId, 'SKILL.md')
    const nextContent = current.content.replace('旧内容', '新内容')
    const plan = await createSkillFileUpdatePlan({ manifestStore: fixture.manifestStore }, fixture.skillId, 'SKILL.md', nextContent, current.contentHash)
    const receipt = await applySkillFileUpdatePlan({ manifestStore: fixture.manifestStore }, plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })
    expect(await readFile(join(fixture.skillPath, 'SKILL.md'), 'utf8')).toContain('新内容')
    expect(receipt.manifestRevision).toBe(2)
    expect((await fixture.manifestStore.read())?.skills[0]?.contentHash).toBe(receipt.skillContentHash)
  })

  it('拒绝路径穿越和基于过期指纹保存', async () => {
    const fixture = await createFixture()
    await expect(readManagedSkillFile({ manifestStore: fixture.manifestStore }, fixture.skillId, '../skills-manifest.json')).rejects.toThrow('路径无效')
    const current = await readManagedSkillFile({ manifestStore: fixture.manifestStore }, fixture.skillId, 'SKILL.md')
    await writeFile(join(fixture.skillPath, 'SKILL.md'), `${current.content}\n外部修改`)
    await expect(createSkillFileUpdatePlan({ manifestStore: fixture.manifestStore }, fixture.skillId, 'SKILL.md', '新内容', current.contentHash)).rejects.toThrow('Skill 内容已经变化')
  })
})
