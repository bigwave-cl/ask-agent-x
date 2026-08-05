import { access, lstat, mkdtemp, mkdir, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stableHash, type UserConsent } from '@askx/core'
import { describe, expect, it, vi } from 'vitest'
import { SkillsManager } from './skills-module.js'

/** 创建结构有效的测试 Skill。 */
async function createSkill(home: string, platform: 'codex' | 'claude' | 'cursor', name: string, content: string): Promise<void> {
  const platformDirectory = platform === 'claude' ? '.claude' : `.${platform}`
  const path = join(home, platformDirectory, 'skills', name)
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'SKILL.md'), `---\nname: ${name}\ndescription: 测试 Skill\n---\n\n${content}\n`)
}

/** 为测试计划创建与 hash 绑定的用户授权。 */
function consent(plan: { hash: string }): UserConsent {
  return { planHash: plan.hash, confirmedAt: new Date().toISOString() }
}

describe('SkillsManager', () => {
  it('旧版逐 Skill manifest 会要求迁移为平台根目录代理', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-legacy-home-'))
    const dataDir = join(homeDir, '.askx')
    const now = new Date().toISOString()
    await mkdir(dataDir, { recursive: true })
    await writeFile(join(dataDir, 'skills-manifest.json'), `${JSON.stringify({
      version: 1,
      revision: 3,
      initializedAt: now,
      lastScan: { scannedAt: now, fingerprint: 'legacy', platforms: ['codex'] },
      skills: [],
    })}\n`)

    const bootstrap = await new SkillsManager({ homeDir, dataDir }).bootstrap()

    expect(bootstrap.initialized).toBe(false)
    expect(bootstrap.manifestRevision).toBe(3)
    expect(bootstrap.platformBindings).toEqual([])
  })

  it('扫描为空时也能通过空计划完成初始化', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-empty-home-'))
    const dataDir = join(homeDir, '.askx')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const plan = await manager.planOnboarding({ platforms: ['codex'], detectionFingerprint: report.fingerprint, settingsRevision: 0, decisions: [] })

    const receipt = await manager.applyOnboarding(plan, 0, consent(plan))
    const bootstrap = await manager.bootstrap()

    expect(receipt.results).toEqual([])
    expect(bootstrap.initialized).toBe(true)
    expect(bootstrap.canonicalSkillsDir).toBe(join(dataDir, 'skills'))
  })

  it('拒绝与 onboarding 计划指纹不匹配的授权', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-consent-home-'))
    const manager = new SkillsManager({ homeDir, dataDir: join(homeDir, '.askx') })
    const report = await manager.scan(['codex'])
    const plan = await manager.planOnboarding({ platforms: ['codex'], detectionFingerprint: report.fingerprint, settingsRevision: 0, decisions: [] })

    await expect(manager.applyOnboarding(plan, 0, { planHash: 'different-plan', confirmedAt: new Date().toISOString() })).rejects.toThrow('用户授权')
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
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })

    const receipt = await manager.applyOnboarding(plan, 2, consent(plan))
    const bootstrap = await manager.bootstrap()

    expect(receipt.results[0]?.status).toBe('applied')
    expect(bootstrap.managedSkills[0]?.name).toBe('demo')
    expect(bootstrap.managedHealth[0]).toMatchObject({ drifted: false })
    expect(bootstrap.platformHealth.find((health) => health.platform === 'codex')).toMatchObject({ status: 'connected', connected: true, issues: [] })
    expect(bootstrap.platformHealth.find((health) => health.platform === 'claude')).toMatchObject({ status: 'pending', connected: false })
    expect(await readFile(join(dataDir, 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain('demo body')
    expect((await lstat(join(dataDir, 'skills', 'demo'))).isDirectory()).toBe(true)
    expect((await lstat(join(homeDir, '.codex', 'skills'))).isSymbolicLink()).toBe(true)
    expect(await readlink(join(homeDir, '.codex', 'skills'))).toBe(join(dataDir, 'skills'))
  })

  it('添加 Skill 时可以跳过平台软链并保存可移除的自定义扫描来源', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-custom-source-home-'))
    const dataDir = join(homeDir, '.askx')
    const customRoot = join(homeDir, 'shared-skills')
    await createSkill(homeDir, 'codex', 'platform-demo', 'platform body')
    await mkdir(join(customRoot, 'custom-demo'), { recursive: true })
    await writeFile(join(customRoot, 'custom-demo', 'SKILL.md'), '---\nname: custom-demo\ndescription: 自定义来源\n---\n')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'], [customRoot])
    const plan = await manager.planOnboarding({
      platforms: ['codex'],
      customRoots: [customRoot],
      linkPlatforms: [],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: report.groups.map((group) => ({ kind: 'adopt' as const, sourceLocationId: group.locations.find((location) => location.metadata.valid)!.id })),
    })

    const receipt = await manager.applyOnboarding(plan, 0, consent(plan))
    const bootstrap = await manager.bootstrap()

    expect(receipt.platformResults).toEqual([])
    expect((await lstat(join(homeDir, '.codex', 'skills'))).isDirectory()).toBe(true)
    expect(bootstrap.customRoots).toMatchObject([{ name: 'shared-skills', path: customRoot }])
    const removalPlan = await manager.planCustomRootRemoval(bootstrap.customRoots[0]!.id)
    await manager.applyCustomRootRemoval(removalPlan, { planHash: removalPlan.hash, confirmedAt: new Date().toISOString() })

    expect((await manager.bootstrap()).customRoots).toEqual([])
    expect(await readFile(join(customRoot, 'custom-demo', 'SKILL.md'), 'utf8')).toContain('custom-demo')
    expect(await readFile(join(dataDir, 'skills', 'custom-demo', 'SKILL.md'), 'utf8')).toContain('custom-demo')
  })

  it('可以幂等停用并恢复单个平台根目录软链且不修改统一源', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-suspend-link-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'demo', 'canonical body')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const source = report.groups[0]!.locations[0]!
    const onboardingPlan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })
    await manager.applyOnboarding(onboardingPlan, 0, consent(onboardingPlan))

    const suspendPlan = await manager.planPlatformLink('codex', 'suspend')
    const suspendReceipt = await manager.applyPlatformLink(suspendPlan, { planHash: suspendPlan.hash, confirmedAt: new Date().toISOString() })
    const suspendedBootstrap = await manager.bootstrap()

    expect(suspendReceipt.status).toBe('applied')
    expect((await lstat(join(homeDir, '.codex', 'skills'))).isDirectory()).toBe(true)
    expect((await lstat(suspendPlan.suspendedPath)).isSymbolicLink()).toBe(true)
    expect(await readlink(suspendPlan.suspendedPath)).toBe(join(dataDir, 'skills'))
    expect(await readFile(join(homeDir, '.codex', 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain('canonical body')
    expect(await readFile(join(dataDir, 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain('canonical body')
    expect(suspendedBootstrap.platformHealth.find((health) => health.platform === 'codex')).toMatchObject({ status: 'suspended', connected: false, issues: [] })

    const repeatedSuspendPlan = await manager.planPlatformLink('codex', 'suspend')
    const repeatedSuspendReceipt = await manager.applyPlatformLink(repeatedSuspendPlan, { planHash: repeatedSuspendPlan.hash, confirmedAt: new Date().toISOString() })
    expect(repeatedSuspendPlan.operations).toEqual([])
    expect(repeatedSuspendReceipt.status).toBe('skipped')

    await writeFile(join(homeDir, '.codex', 'skills', 'demo', 'SKILL.md'), 'platform directory changed while disconnected')
    expect(await readFile(join(dataDir, 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain('canonical body')

    const resumePlan = await manager.planPlatformLink('codex', 'resume')
    const resumeReceipt = await manager.applyPlatformLink(resumePlan, { planHash: resumePlan.hash, confirmedAt: new Date().toISOString() })
    const resumedBootstrap = await manager.bootstrap()

    expect(resumeReceipt.status).toBe('applied')
    expect((await lstat(join(homeDir, '.codex', 'skills'))).isSymbolicLink()).toBe(true)
    await expect(access(resumePlan.suspendedPath)).rejects.toThrow()
    expect(await readFile(join(homeDir, '.codex', 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain('canonical body')
    expect(await readFile(join(resumePlan.originalRootBackup!.backupPath, 'demo', 'SKILL.md'), 'utf8')).toBe('platform directory changed while disconnected')
    expect(resumedBootstrap.platformHealth.find((health) => health.platform === 'codex')).toMatchObject({ status: 'connected', connected: true, issues: [] })

    const repeatedResumePlan = await manager.planPlatformLink('codex', 'resume')
    const repeatedResumeReceipt = await manager.applyPlatformLink(repeatedResumePlan, { planHash: repeatedResumePlan.hash, confirmedAt: new Date().toISOString() })
    expect(repeatedResumePlan.operations).toEqual([])
    expect(repeatedResumeReceipt.status).toBe('skipped')

    const secondSuspendPlan = await manager.planPlatformLink('codex', 'suspend')
    await manager.applyPlatformLink(secondSuspendPlan, { planHash: secondSuspendPlan.hash, confirmedAt: new Date().toISOString() })
    expect(await readFile(join(homeDir, '.codex', 'skills', 'demo', 'SKILL.md'), 'utf8')).toBe('platform directory changed while disconnected')
    expect(await readFile(join(dataDir, 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain('canonical body')
  })

  it('恢复平台软链时不会覆盖被外部占用的原目录备份位置', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-resume-conflict-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'demo', 'canonical body')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const source = report.groups[0]!.locations[0]!
    const onboardingPlan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })
    await manager.applyOnboarding(onboardingPlan, 0, consent(onboardingPlan))
    const suspendPlan = await manager.planPlatformLink('codex', 'suspend')
    await manager.applyPlatformLink(suspendPlan, { planHash: suspendPlan.hash, confirmedAt: new Date().toISOString() })
    const backupPath = suspendPlan.originalRootBackup!.backupPath
    await mkdir(backupPath, { recursive: true })
    await writeFile(join(backupPath, 'foreign.txt'), 'foreign backup occupant')

    await expect(manager.planPlatformLink('codex', 'resume')).rejects.toThrow('备份位置')
    expect(await readFile(join(backupPath, 'foreign.txt'), 'utf8')).toBe('foreign backup occupant')
    expect(await readFile(join(homeDir, '.codex', 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain('canonical body')
    expect((await lstat(suspendPlan.suspendedPath)).isSymbolicLink()).toBe(true)
    expect(await readFile(join(dataDir, 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain('canonical body')
  })

  it('平台接入前没有 Skills 目录时只往返受管软链', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-empty-link-home-'))
    const dataDir = join(homeDir, '.askx')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const onboardingPlan = await manager.planOnboarding({ platforms: ['codex'], detectionFingerprint: report.fingerprint, settingsRevision: 0, decisions: [] })
    await manager.applyOnboarding(onboardingPlan, 0, consent(onboardingPlan))

    const suspendPlan = await manager.planPlatformLink('codex', 'suspend')
    expect(suspendPlan.originalRootBackup).toBeUndefined()
    expect(suspendPlan.operations).toHaveLength(1)
    await manager.applyPlatformLink(suspendPlan, { planHash: suspendPlan.hash, confirmedAt: new Date().toISOString() })
    await expect(access(join(homeDir, '.codex', 'skills'))).rejects.toThrow()

    const resumePlan = await manager.planPlatformLink('codex', 'resume')
    expect(resumePlan.operations).toHaveLength(1)
    await manager.applyPlatformLink(resumePlan, { planHash: resumePlan.hash, confirmedAt: new Date().toISOString() })
    expect((await lstat(join(homeDir, '.codex', 'skills'))).isSymbolicLink()).toBe(true)
  })

  it('旧 manifest 会从批次回执恢复并持久化平台原目录备份关系', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-backup-recovery-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'demo', 'original body')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const source = report.groups[0]!.locations[0]!
    const onboardingPlan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })
    await manager.applyOnboarding(onboardingPlan, 0, consent(onboardingPlan))

    const manifestPath = join(dataDir, 'skills-manifest.json')
    const legacyManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { platformBindings: Array<Record<string, unknown>> }
    delete legacyManifest.platformBindings[0]!.originalRootBackup
    await writeFile(manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`)

    const recoveredBootstrap = await manager.bootstrap()
    expect(recoveredBootstrap.platformBindings[0]?.originalRootBackup).toBeDefined()
    const suspendPlan = await manager.planPlatformLink('codex', 'suspend')
    expect(suspendPlan.operations).toHaveLength(2)
    await manager.applyPlatformLink(suspendPlan, { planHash: suspendPlan.hash, confirmedAt: new Date().toISOString() })

    const persistedManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { platformBindings: Array<Record<string, unknown>> }
    expect(persistedManifest.platformBindings[0]?.originalRootBackup).toEqual(suspendPlan.originalRootBackup)
    expect((await lstat(join(homeDir, '.codex', 'skills'))).isDirectory()).toBe(true)
  })

  it('软链状态保存失败时会逆序恢复软链与平台原目录', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-link-rollback-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'demo', 'original body')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const source = report.groups[0]!.locations[0]!
    const onboardingPlan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })
    await manager.applyOnboarding(onboardingPlan, 0, consent(onboardingPlan))
    const suspendPlan = await manager.planPlatformLink('codex', 'suspend')
    vi.spyOn(manager.manifestStore, 'write').mockRejectedValueOnce(new Error('模拟 manifest 写入失败'))

    await expect(manager.applyPlatformLink(suspendPlan, { planHash: suspendPlan.hash, confirmedAt: new Date().toISOString() })).rejects.toThrow('模拟 manifest 写入失败')

    expect((await lstat(join(homeDir, '.codex', 'skills'))).isSymbolicLink()).toBe(true)
    await expect(access(suspendPlan.suspendedPath)).rejects.toThrow()
    expect(await readFile(join(suspendPlan.originalRootBackup!.backupPath, 'demo', 'SKILL.md'), 'utf8')).toContain('original body')
    const bootstrap = await manager.bootstrap()
    expect(bootstrap.platformHealth.find((health) => health.platform === 'codex')).toMatchObject({ status: 'connected', connected: true, issues: [] })
  })

  it('多个平台通过各自根目录共享同一份统一源', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-shared-root-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'alpha', 'alpha body')
    await createSkill(homeDir, 'claude', 'beta', 'beta body')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex', 'claude'])
    const plan = await manager.planOnboarding({
      platforms: ['codex', 'claude'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: report.groups.map((group) => ({ kind: 'adopt' as const, sourceLocationId: group.locations[0]!.id })),
    })

    await manager.applyOnboarding(plan, 0, consent(plan))

    expect(await readlink(join(homeDir, '.codex', 'skills'))).toBe(join(dataDir, 'skills'))
    expect(await readlink(join(homeDir, '.claude', 'skills'))).toBe(join(dataDir, 'skills'))
    expect(await readFile(join(homeDir, '.codex', 'skills', 'beta', 'SKILL.md'), 'utf8')).toContain('beta body')
    expect(await readFile(join(homeDir, '.claude', 'skills', 'alpha', 'SKILL.md'), 'utf8')).toContain('alpha body')
  })

  it('软链步骤可以接入未参与扫描的平台且不会扩展扫描来源', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-extra-link-platform-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'claude', 'source-only', 'source body')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['claude'])
    const source = report.groups[0]!.locations[0]!
    const plan = await manager.planOnboarding({
      platforms: ['claude'],
      linkPlatforms: ['claude', 'cursor'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })

    expect(plan.platforms).toEqual(['claude'])
    expect(plan.platformOperations.map((operation) => operation.platform)).toEqual(['claude', 'cursor'])

    await manager.applyOnboarding(plan, 0, consent(plan))

    expect(await readlink(join(homeDir, '.cursor', 'skills'))).toBe(join(dataDir, 'skills'))
    expect(await readFile(join(homeDir, '.cursor', 'skills', 'source-only', 'SKILL.md'), 'utf8')).toContain('source body')
  })

  it('自定义来源可默认转为软链使用目录且不会再次作为扫描来源保存', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-custom-link-root-home-'))
    const dataDir = join(homeDir, '.askx')
    const customRoot = join(homeDir, 'shared-skills')
    await mkdir(join(customRoot, 'custom-demo'), { recursive: true })
    await writeFile(join(customRoot, 'custom-demo', 'SKILL.md'), '---\nname: custom-demo\ndescription: 自定义来源\n---\n\ncustom body\n')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'], [customRoot])
    const source = report.groups[0]!.locations[0]!
    const plan = await manager.planOnboarding({
      platforms: ['codex'],
      customRoots: [customRoot],
      linkPlatforms: [],
      linkCustomRoots: [customRoot],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })

    const receipt = await manager.applyOnboarding(plan, 0, consent(plan))
    const bootstrap = await manager.bootstrap()

    expect(receipt.customLinkResults).toMatchObject([{ name: 'shared-skills', path: customRoot, status: 'applied' }])
    expect((await lstat(customRoot)).isSymbolicLink()).toBe(true)
    expect(await readFile(join(customRoot, 'custom-demo', 'SKILL.md'), 'utf8')).toContain('custom body')
    expect(bootstrap.customRoots).toEqual([])
    expect(bootstrap.customLinkBindings).toMatchObject([{ name: 'shared-skills', path: customRoot, target: join(dataDir, 'skills') }])

    const bindingId = bootstrap.customLinkBindings[0]!.id
    const suspendPlan = await manager.planCustomLink(bindingId, 'suspend')
    await manager.applyCustomLink(suspendPlan, consent(suspendPlan))

    expect((await lstat(customRoot)).isDirectory()).toBe(true)
    expect(await readFile(join(customRoot, 'custom-demo', 'SKILL.md'), 'utf8')).toContain('custom body')
    expect((await manager.bootstrap()).customLinkBindings[0]).toMatchObject({ id: bindingId, suspendedAt: expect.any(String) })

    const resumePlan = await manager.planCustomLink(bindingId, 'resume')
    await manager.applyCustomLink(resumePlan, consent(resumePlan))

    expect((await lstat(customRoot)).isSymbolicLink()).toBe(true)
    expect((await manager.bootstrap()).customLinkBindings[0]?.suspendedAt).toBeUndefined()

    const failedDeletePlan = await manager.planCustomLink(bindingId, 'delete')
    vi.spyOn(manager.manifestStore, 'write').mockRejectedValueOnce(new Error('模拟自定义软链删除 manifest 写入失败'))
    await expect(manager.applyCustomLink(failedDeletePlan, consent(failedDeletePlan))).rejects.toThrow('模拟自定义软链删除 manifest 写入失败')

    expect((await lstat(customRoot)).isSymbolicLink()).toBe(true)
    expect((await manager.bootstrap()).customLinkBindings).toHaveLength(1)

    const deletePlan = await manager.planCustomLink(bindingId, 'delete')
    await manager.applyCustomLink(deletePlan, consent(deletePlan))

    expect((await lstat(customRoot)).isDirectory()).toBe(true)
    expect(await readFile(join(customRoot, 'custom-demo', 'SKILL.md'), 'utf8')).toContain('custom body')
    expect(await readFile(join(dataDir, 'skills', 'custom-demo', 'SKILL.md'), 'utf8')).toContain('custom body')
    expect((await manager.bootstrap()).customLinkBindings).toEqual([])
  })

  it('自定义软链目录保存失败时会恢复接入前的完整目录', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-custom-link-rollback-home-'))
    const dataDir = join(homeDir, '.askx')
    const customRoot = join(homeDir, 'shared-skills')
    await mkdir(join(customRoot, 'custom-demo'), { recursive: true })
    await writeFile(join(customRoot, 'custom-demo', 'SKILL.md'), '---\nname: custom-demo\ndescription: 回滚来源\n---\n\noriginal body\n')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'], [customRoot])
    const source = report.groups[0]!.locations[0]!
    const plan = await manager.planOnboarding({
      platforms: ['codex'],
      customRoots: [customRoot],
      linkPlatforms: [],
      linkCustomRoots: [customRoot],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })
    vi.spyOn(manager.manifestStore, 'write').mockRejectedValueOnce(new Error('模拟自定义软链 manifest 写入失败'))

    await expect(manager.applyOnboarding(plan, 0, consent(plan))).rejects.toThrow('模拟自定义软链 manifest 写入失败')

    expect((await lstat(customRoot)).isDirectory()).toBe(true)
    expect(await readFile(join(customRoot, 'custom-demo', 'SKILL.md'), 'utf8')).toContain('original body')
    await expect(access(join(dataDir, 'skills'))).rejects.toThrow()
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
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })

    const receipt = await manager.applyOnboarding(plan, 0, consent(plan))

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
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })
    await writeFile(join(source.path, 'SKILL.md'), 'changed')

    await expect(manager.applyOnboarding(plan, 0, consent(plan))).rejects.toThrow('重新扫描')
  })

  it('临时统一目录构建失败时不会切换平台根目录', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-partial-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'alpha', 'platform alpha')
    await mkdir(join(dataDir, 'skills', 'alpha'), { recursive: true })
    await writeFile(join(dataDir, 'skills', 'alpha', 'SKILL.md'), 'existing canonical')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex'])
    const alpha = report.groups.find((group) => group.name === 'alpha')!.locations[0]!
    const plan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: alpha.id }],
    })

    await expect(manager.applyOnboarding(plan, 0, consent(plan))).rejects.toThrow('已经存在不同内容')

    expect((await lstat(join(homeDir, '.codex', 'skills'))).isDirectory()).toBe(true)
    expect(await readFile(join(homeDir, '.codex', 'skills', 'alpha', 'SKILL.md'), 'utf8')).toContain('platform alpha')
  })

  it('单个平台根目录切换失败时只标记该平台并允许单独重试', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-root-rollback-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'alpha', 'platform alpha')
    await writeFile(join(homeDir, '.claude'), '阻止创建 Claude Code 根目录')
    const manager = new SkillsManager({ homeDir, dataDir })
    const report = await manager.scan(['codex', 'claude'])
    const source = report.groups[0]!.locations[0]!
    const plan = await manager.planOnboarding({
      platforms: ['codex', 'claude'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })

    const receipt = await manager.applyOnboarding(plan, 0, consent(plan))
    const firstBootstrap = await manager.bootstrap()

    expect(receipt.platformResults).toMatchObject([
      { platform: 'codex', status: 'applied' },
      { platform: 'claude', status: 'failed' },
    ])
    expect(firstBootstrap.initialized).toBe(true)
    expect(firstBootstrap.platformHealth.find((health) => health.platform === 'codex')).toMatchObject({ status: 'connected', connected: true })
    expect(firstBootstrap.platformHealth.find((health) => health.platform === 'claude')).toMatchObject({ status: 'failed', connected: false })
    expect((await lstat(join(homeDir, '.codex', 'skills'))).isSymbolicLink()).toBe(true)
    expect(await readFile(join(dataDir, 'skills', 'alpha', 'SKILL.md'), 'utf8')).toContain('platform alpha')
    expect(await readFile(join(homeDir, '.claude'), 'utf8')).toContain('阻止创建')

    await rm(join(homeDir, '.claude'))
    const retryReport = await manager.scan(['claude'])
    const retryPlan = await manager.planOnboarding({
      platforms: ['claude'],
      detectionFingerprint: retryReport.fingerprint,
      settingsRevision: 0,
      decisions: [],
    })
    const retryReceipt = await manager.applyOnboarding(retryPlan, 0, consent(retryPlan))
    const retryBootstrap = await manager.bootstrap()

    expect(retryReceipt.platformResults).toMatchObject([{ platform: 'claude', status: 'applied' }])
    expect((await lstat(join(homeDir, '.claude', 'skills'))).isSymbolicLink()).toBe(true)
    expect(retryBootstrap.platformHealth.find((health) => health.platform === 'claude')).toMatchObject({ status: 'connected', connected: true })
    expect(retryBootstrap.platformBindings.map((binding) => binding.platform).sort()).toEqual(['claude', 'codex'])
  })

  it('单独导入平台时会将其版本与现有统一源一起交给用户决策', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-platform-import-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'alpha', 'canonical version')
    const manager = new SkillsManager({ homeDir, dataDir })
    const initialReport = await manager.scan(['codex'])
    const initialSource = initialReport.groups[0]!.locations[0]!
    const initialPlan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: initialReport.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: initialSource.id }],
    })
    await manager.applyOnboarding(initialPlan, 0, consent(initialPlan))
    await createSkill(homeDir, 'claude', 'alpha', 'claude version')

    const report = await manager.scan(['claude'])
    const group = report.groups[0]!
    const source = group.locations.find((location) => location.platform === 'claude')!
    const canonical = group.locations.find((location) => location.platform === 'askx')!
    expect(group.status).toBe('conflict')

    const plan = await manager.planOnboarding({
      platforms: ['claude'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'replace', sourceLocationId: source.id, targetLocationIds: [canonical.id] }],
    })
    await manager.applyOnboarding(plan, 0, consent(plan))

    expect(await readFile(join(dataDir, 'skills', 'alpha', 'SKILL.md'), 'utf8')).toContain('claude version')
    expect(await readlink(join(homeDir, '.claude', 'skills'))).toBe(join(dataDir, 'skills'))
  })

  it('单平台同步只更新统一源且不会接入平台根目录', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-platform-sync-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'alpha', 'canonical version')
    const manager = new SkillsManager({ homeDir, dataDir })
    const initialReport = await manager.scan(['codex'])
    const initialPlan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: initialReport.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: initialReport.groups[0]!.locations[0]!.id }],
    })
    await manager.applyOnboarding(initialPlan, 0, consent(initialPlan))
    await createSkill(homeDir, 'claude', 'beta', 'claude only version')

    const report = await manager.scan(['claude'])
    const beta = report.groups.find((group) => group.name === 'beta')!
    const source = beta.locations.find((location) => location.platform === 'claude')!
    const plan = await manager.planOnboarding({
      platforms: ['claude'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: report.groups.map((group) => group.id === beta.id
        ? { kind: 'adopt' as const, sourceLocationId: source.id }
        : { kind: 'keep' as const, groupId: group.id }),
      mode: 'sync',
    })
    const receipt = await manager.applyOnboarding(plan, 0, consent(plan))

    expect(plan.platformOperations).toEqual([])
    expect(receipt.platformResults).toEqual([])
    expect((await lstat(join(homeDir, '.claude', 'skills'))).isDirectory()).toBe(true)
    expect((await lstat(join(homeDir, '.claude', 'skills'))).isSymbolicLink()).toBe(false)
    expect(await readFile(join(homeDir, '.claude', 'skills', 'beta', 'SKILL.md'), 'utf8')).toContain('claude only version')
    expect(await readFile(join(dataDir, 'skills', 'beta', 'SKILL.md'), 'utf8')).toContain('claude only version')
    expect(await readlink(join(homeDir, '.codex', 'skills'))).toBe(join(dataDir, 'skills'))
  })

  it('停用平台同步后保持停用状态且不会改动平台目录', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'askx-suspended-sync-home-'))
    const dataDir = join(homeDir, '.askx')
    await createSkill(homeDir, 'codex', 'alpha', 'alpha version')
    const manager = new SkillsManager({ homeDir, dataDir })
    const initialReport = await manager.scan(['codex'])
    const initialPlan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: initialReport.fingerprint,
      settingsRevision: 0,
      decisions: [{ kind: 'adopt', sourceLocationId: initialReport.groups[0]!.locations[0]!.id }],
    })
    await manager.applyOnboarding(initialPlan, 0, consent(initialPlan))
    const suspendPlan = await manager.planPlatformLink('codex', 'suspend')
    await manager.applyPlatformLink(suspendPlan, { planHash: suspendPlan.hash, confirmedAt: new Date().toISOString() })
    await createSkill(homeDir, 'codex', 'beta', 'beta from suspended platform')

    const report = await manager.scan(['codex'])
    const plan = await manager.planOnboarding({
      platforms: ['codex'],
      detectionFingerprint: report.fingerprint,
      settingsRevision: 0,
      decisions: report.groups.map((group) => {
        const platformSource = group.locations.find((location) => location.platform === 'codex' && location.metadata.valid && !location.broken)
        if (group.name === 'beta' && platformSource) return { kind: 'adopt' as const, sourceLocationId: platformSource.id }
        return { kind: 'keep' as const, groupId: group.id }
      }),
      mode: 'sync',
    })
    await manager.applyOnboarding(plan, 0, consent(plan))
    const bootstrap = await manager.bootstrap()

    expect((await lstat(join(homeDir, '.codex', 'skills'))).isDirectory()).toBe(true)
    expect((await lstat(join(homeDir, '.codex', 'skills'))).isSymbolicLink()).toBe(false)
    expect((await lstat(suspendPlan.suspendedPath)).isSymbolicLink()).toBe(true)
    expect(await readFile(join(homeDir, '.codex', 'skills', 'beta', 'SKILL.md'), 'utf8')).toContain('beta from suspended platform')
    expect(await readFile(join(dataDir, 'skills', 'beta', 'SKILL.md'), 'utf8')).toContain('beta from suspended platform')
    expect(bootstrap.platformHealth.find((health) => health.platform === 'codex')).toMatchObject({ status: 'suspended', connected: false })
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
      decisions: [{ kind: 'adopt', sourceLocationId: alpha.id }],
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

    await expect(manager.applyOnboarding({ ...incomplete, hash: stableHash(incomplete) }, 0, { planHash: stableHash(incomplete), confirmedAt: new Date().toISOString() })).rejects.toThrow('每个扫描分组')
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
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })
    const receipt = await manager.applyOnboarding(plan, 0, consent(plan))

    const rollback = await manager.rollbackReceipt(receipt.id)

    expect(rollback.rolledBack).toBe(true)
    expect((await manager.bootstrap()).initialized).toBe(false)
    await expect(access(join(dataDir, 'skills', 'demo'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await lstat(join(homeDir, '.codex', 'skills'))).isDirectory()).toBe(true)
    expect(await readFile(join(homeDir, '.codex', 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain('rollback body')
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
      decisions: [{ kind: 'adopt', sourceLocationId: source.id }],
    })
    const receipt = await manager.applyOnboarding(plan, 0, consent(plan))
    await writeFile(join(dataDir, 'skills', 'demo', 'SKILL.md'), 'user changed content')

    const rollback = await manager.rollbackReceipt(receipt.id)

    expect(rollback.rolledBack).toBe(false)
    expect(rollback.warnings.join('\n')).toContain('统一源内容已经变化')
    expect((await manager.bootstrap()).initialized).toBe(true)
  })
})
