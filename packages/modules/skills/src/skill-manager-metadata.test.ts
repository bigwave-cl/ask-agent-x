import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  compareManagerVersions,
  ensureAskxManagedDeclaration,
  fingerprintManagedSkill,
  nextManagerVersion,
} from './skill-manager-metadata.js'

/** 当前测试创建的临时目录。 */
const temporaryDirectories: string[] = []

/** 创建一个最小 Skill。 */
async function createSkill(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'askx-manager-metadata-'))
  temporaryDirectories.push(root)
  await writeFile(join(root, 'SKILL.md'), '# Demo\n')
  return root
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('Skill Manager 元数据', () => {
  it('按 Asia/Shanghai 日期生成并递增 YY.MDD.N 版本', () => {
    const sameDay = new Date('2026-08-05T15:59:59.000Z')
    const nextDay = new Date('2026-08-05T16:00:00.000Z')
    expect(nextManagerVersion(undefined, sameDay)).toBe('26.805.1')
    expect(nextManagerVersion('26.805.1', sameDay)).toBe('26.805.2')
    expect(nextManagerVersion('26.805.9', nextDay)).toBe('26.806.1')
    expect(compareManagerVersions('26.806.1', '26.805.9')).toBeGreaterThan(0)
    expect(compareManagerVersions('invalid', '26.805.1')).toBeUndefined()
  })

  it('业务 Hash 排除 manager 元数据，系统 Skill 同时排除 Registry', async () => {
    const root = await createSkill()
    const before = await fingerprintManagedSkill(root)
    await writeFile(join(root, '.skill-manager.json'), '{}\n')
    const afterMetadata = await fingerprintManagedSkill(root)
    expect(afterMetadata.businessContentHash).toBe(before.businessContentHash)
    expect(afterMetadata.contentHash).not.toBe(before.contentHash)

    const systemRoot = join(root, 'askx-skill-manager')
    await mkdir(join(systemRoot, 'registry'), { recursive: true })
    await writeFile(join(systemRoot, 'SKILL.md'), '# Manager\n')
    await writeFile(join(systemRoot, 'registry', 'skills.json'), '{}\n')
    const systemBefore = await fingerprintManagedSkill(systemRoot)
    await writeFile(join(systemRoot, 'registry', 'skills.json'), '{"revision":1}\n')
    expect(await fingerprintManagedSkill(systemRoot)).toEqual(systemBefore)
  })

  it('托管声明重复执行时只保留一份并迁移旧声明', async () => {
    const root = await createSkill()
    await ensureAskxManagedDeclaration(root, false)
    await ensureAskxManagedDeclaration(root, false)
    const content = await readFile(join(root, 'SKILL.md'), 'utf8')
    expect(content.match(/## Managed By/g)).toHaveLength(1)
    expect(content).toContain('askx-skill-manager')
  })
})
