import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stableHash, type UserConsent } from '@askx/core'
import { z } from 'zod'
import type { SkillsManifestStore } from './manifest-store.js'
import {
  ASKX_SKILL_MANAGER_NAME,
  compareManagerVersions,
  fingerprintManagedSkill,
  inspectSkillManagerMetadata,
  skillManagerMetadataSchema,
} from './skill-manager-metadata.js'
import { askxSkillRegistrySchema } from './skill-manager-registry.js'
import type { ManagedSkillRecord, SystemSkillHealth } from './skill-types.js'

/** 系统 Skill 修复计划。 */
export interface SystemSkillRepairPlan {
  /** 计划标识。 */
  id: string
  /** 计划创建时间。 */
  createdAt: string
  /** 检测到的系统 Skill 状态。 */
  health: Exclude<SystemSkillHealth, 'ready'>
  /** 计划基于的 manifest revision。 */
  manifestRevision: number
  /** 当前系统 Skill 指纹；缺失时为空。 */
  currentContentHash?: string
  /** 内置版本的业务指纹。 */
  builtinBusinessContentHash: string
  /** 能否保留现有 registry。 */
  preserveRegistry: boolean
  /** 将要恢复的有效 registry 路径。 */
  registrySourcePath?: string
  /** 计划绑定的 registry 内容指纹。 */
  registrySourceHash?: string
  /** 用户授权对应的稳定指纹。 */
  hash: string
}

/** 系统 Skill 修复回执。 */
export interface SystemSkillRepairReceipt {
  /** 回执标识。 */
  id: string
  /** 对应计划 hash。 */
  planHash: string
  /** 修复完成时间。 */
  appliedAt: string
  /** 修复前状态。 */
  previousHealth: Exclude<SystemSkillHealth, 'ready'>
  /** 是否保留了原 registry。 */
  preservedRegistry: boolean
  /** 更新后的 manifest revision。 */
  manifestRevision: number
  /** 无法恢复 usage 等数据时的明确提示。 */
  warnings: string[]
}

/** 系统 Skill 只读检测结果。 */
export interface SystemSkillInspection {
  /** 当前健康状态。 */
  health: SystemSkillHealth
  /** 当前完整指纹。 */
  contentHash?: string
  /** 当前业务指纹。 */
  businessContentHash?: string
  /** registry 是否可读取。 */
  registryValid: boolean
  /** 可向用户解释的问题。 */
  issues: string[]
}

/** 系统 Skill 修复计划运行时 schema。 */
export const systemSkillRepairPlanSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  health: z.enum(['missing', 'corrupt', 'outdated']),
  manifestRevision: z.number().int().nonnegative(),
  currentContentHash: z.string().optional(),
  builtinBusinessContentHash: z.string().min(1),
  preserveRegistry: z.boolean(),
  registrySourcePath: z.string().min(1).optional(),
  registrySourceHash: z.string().min(1).optional(),
  hash: z.string().min(1),
})

/** 返回当前源码或构建产物中的内置系统 Skill。 */
export function resolveBuiltinSkillManagerPath(): string {
  const currentDirectory = dirname(fileURLToPath(import.meta.url))
  return basename(currentDirectory) === 'dist'
    ? resolve(currentDirectory, 'builtin', ASKX_SKILL_MANAGER_NAME)
    : resolve(currentDirectory, '..', 'builtin', ASKX_SKILL_MANAGER_NAME)
}

/** 判断路径是否存在。 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/** 有效 Registry 快照。 */
interface RegistrySnapshot {
  /** 快照所在文件。 */
  path: string
  /** 已解析的完整内容。 */
  content: string
  /** 内容稳定指纹。 */
  hash: string
  /** 文件更新时间，用于选择最新备份。 */
  modifiedAt: number
}

/** 读取一个候选 Registry 文件并验证 schema。 */
async function readRegistrySnapshot(path: string): Promise<RegistrySnapshot | null> {
  try {
    const information = await lstat(path)
    if (!information.isFile() || information.isSymbolicLink()) return null
    const content = await readFile(path, 'utf8')
    askxSkillRegistrySchema.parse(JSON.parse(content))
    return { path, content, hash: stableHash(content), modifiedAt: information.mtimeMs }
  } catch {
    return null
  }
}

/** 在 AskX 自有备份目录中递归查找有效 Registry。 */
async function collectBackupRegistrySnapshots(root: string, depth = 0): Promise<RegistrySnapshot[]> {
  if (depth > 8 || !await pathExists(root)) return []
  const information = await lstat(root)
  if (!information.isDirectory() || information.isSymbolicLink()) return []
  const snapshots: RegistrySnapshot[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) snapshots.push(...await collectBackupRegistrySnapshots(path, depth + 1))
    else if (entry.isFile() && entry.name === 'skills.json' && basename(dirname(path)) === 'registry' && path.includes(ASKX_SKILL_MANAGER_NAME)) {
      const snapshot = await readRegistrySnapshot(path)
      if (snapshot) snapshots.push(snapshot)
    }
  }
  return snapshots
}

/** 优先读取当前 Registry，否则选择最新的有效 AskX 备份。 */
async function findRecoverableRegistry(dataDir: string): Promise<RegistrySnapshot | null> {
  const current = await readRegistrySnapshot(join(dataDir, 'skills', ASKX_SKILL_MANAGER_NAME, 'registry', 'skills.json'))
  if (current) return current
  const snapshots = await collectBackupRegistrySnapshots(join(dataDir, 'backups'))
  return snapshots.sort((left, right) => right.modifiedAt - left.modifiedAt)[0] ?? null
}

/** 读取内置 manager 元数据。 */
async function readBuiltinMetadata() {
  return skillManagerMetadataSchema.parse(JSON.parse(await readFile(join(resolveBuiltinSkillManagerPath(), '.skill-manager.json'), 'utf8')))
}

/** 检查系统 Skill 与内置版本、registry 的一致性。 */
export async function inspectSystemSkillManager(dataDir: string): Promise<SystemSkillInspection> {
  const target = join(dataDir, 'skills', ASKX_SKILL_MANAGER_NAME)
  if (!await pathExists(target)) return { health: 'missing', registryValid: false, issues: ['默认 Skill Manager 不存在。'] }
  try {
    const [fingerprint, builtinMetadata] = await Promise.all([fingerprintManagedSkill(target), readBuiltinMetadata()])
    const manager = await inspectSkillManagerMetadata(target, fingerprint.businessContentHash)
    let registryValid = false
    try {
      askxSkillRegistrySchema.parse(JSON.parse(await readFile(join(target, 'registry', 'skills.json'), 'utf8')))
      registryValid = true
    } catch {
      registryValid = false
    }
    if (!manager.metadata || manager.state !== 'askx-managed' || !registryValid) {
      return {
        health: 'corrupt',
        contentHash: fingerprint.contentHash,
        businessContentHash: fingerprint.businessContentHash,
        registryValid,
        issues: [manager.error ?? '系统 Skill 身份或 registry 无效。'],
      }
    }
    if ((compareManagerVersions(manager.metadata.version, builtinMetadata.version) ?? -1) < 0
      || manager.metadata.content_sha256 !== builtinMetadata.content_sha256) {
      return {
        health: 'outdated',
        contentHash: fingerprint.contentHash,
        businessContentHash: fingerprint.businessContentHash,
        registryValid,
        issues: ['系统 Skill 低于当前内置版本。'],
      }
    }
    return {
      health: 'ready',
      contentHash: fingerprint.contentHash,
      businessContentHash: fingerprint.businessContentHash,
      registryValid,
      issues: [],
    }
  } catch (error) {
    return { health: 'corrupt', registryValid: false, issues: [(error as Error).message] }
  }
}

/** 把内置 Skill 安装到指定统一源 staging，并按需保留 registry。 */
export async function installBuiltinSkillManager(stagingRoot: string): Promise<ManagedSkillRecord> {
  const source = resolveBuiltinSkillManagerPath()
  const target = join(stagingRoot, ASKX_SKILL_MANAGER_NAME)
  const temporary = join(stagingRoot, `.${ASKX_SKILL_MANAGER_NAME}.${randomUUID()}.staging`)
  const currentRegistry = join(target, 'registry', 'skills.json')
  await cp(source, temporary, { recursive: true, preserveTimestamps: true })
  if (await pathExists(currentRegistry)) {
    await mkdir(join(temporary, 'registry'), { recursive: true, mode: 0o700 })
    await cp(currentRegistry, join(temporary, 'registry', 'skills.json'), { preserveTimestamps: true })
  }
  if (await pathExists(target)) await rm(target, { recursive: true, force: true })
  await rename(temporary, target)
  const fingerprint = await fingerprintManagedSkill(target)
  const manager = await inspectSkillManagerMetadata(target, fingerprint.businessContentHash)
  if (!manager.metadata || manager.state !== 'askx-managed') throw new Error('内置 AskX Skill Manager 校验失败。')
  askxSkillRegistrySchema.parse(JSON.parse(await readFile(join(target, 'registry', 'skills.json'), 'utf8')))
  return {
    id: randomUUID(),
    name: ASKX_SKILL_MANAGER_NAME,
    kind: 'system',
    canonicalPath: target,
    contentHash: fingerprint.contentHash,
    businessContentHash: fingerprint.businessContentHash,
    manager: {
      skillId: manager.metadata.skill_id,
      version: manager.metadata.version,
      localOnly: manager.metadata.local_only,
      managedBy: manager.metadata.managed_by,
      contentSha256: manager.metadata.content_sha256,
    },
    updatedAt: new Date().toISOString(),
  }
}

/** 生成系统 Skill 恢复计划，不执行任何写入。 */
export async function createSystemSkillRepairPlan(manifestStore: SkillsManifestStore): Promise<SystemSkillRepairPlan> {
  const inspection = await inspectSystemSkillManager(manifestStore.dataDir)
  if (inspection.health === 'ready') throw new Error('AskX Skill Manager 当前无需修复。')
  const manifest = await manifestStore.read()
  const builtin = await fingerprintManagedSkill(resolveBuiltinSkillManagerPath())
  const registry = await findRecoverableRegistry(manifestStore.dataDir)
  const unsigned = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    health: inspection.health,
    manifestRevision: manifest?.revision ?? 0,
    ...(inspection.contentHash ? { currentContentHash: inspection.contentHash } : {}),
    builtinBusinessContentHash: builtin.businessContentHash,
    preserveRegistry: Boolean(registry),
    ...(registry ? { registrySourcePath: registry.path, registrySourceHash: registry.hash } : {}),
  }
  return { ...unsigned, hash: stableHash(unsigned) }
}

/** 应用一次经确认的系统 Skill 修复，并在失败时恢复原目录。 */
export async function applySystemSkillRepairPlan(
  manifestStore: SkillsManifestStore,
  inputPlan: SystemSkillRepairPlan,
  consent: UserConsent,
): Promise<SystemSkillRepairReceipt> {
  const plan = systemSkillRepairPlanSchema.parse(inputPlan)
  const { hash, ...unsigned } = plan
  if (stableHash(unsigned) !== hash || consent.planHash !== hash) throw new Error('系统 Skill 修复授权与当前计划不匹配。')
  const manifest = await manifestStore.read()
  if ((manifest?.revision ?? 0) !== plan.manifestRevision) throw new Error('Skills manifest 已变化，请重新生成修复计划。')
  const inspection = await inspectSystemSkillManager(manifestStore.dataDir)
  if (inspection.health === 'ready' || inspection.health !== plan.health || inspection.contentHash !== plan.currentContentHash) {
    throw new Error('系统 Skill 状态已经变化，请重新检测。')
  }
  const canonicalRoot = join(manifestStore.dataDir, 'skills')
  const target = join(canonicalRoot, ASKX_SKILL_MANAGER_NAME)
  const backup = join(manifestStore.dataDir, 'backups', 'skills', plan.id, `${ASKX_SKILL_MANAGER_NAME}.bak`)
  await mkdir(canonicalRoot, { recursive: true, mode: 0o700 })
  let moved = false
  let registrySnapshot: RegistrySnapshot | null = null
  try {
    if (plan.preserveRegistry) {
      if (!plan.registrySourcePath || !plan.registrySourceHash) throw new Error('修复计划缺少 Registry 恢复快照。')
      registrySnapshot = await readRegistrySnapshot(plan.registrySourcePath)
      if (!registrySnapshot || registrySnapshot.hash !== plan.registrySourceHash) throw new Error('Registry 恢复快照已经变化，请重新生成计划。')
    }
    if (await pathExists(target)) {
      await mkdir(dirname(backup), { recursive: true, mode: 0o700 })
      await rename(target, backup)
      moved = true
    }
    await cp(resolveBuiltinSkillManagerPath(), target, { recursive: true, preserveTimestamps: true })
    if (registrySnapshot) await writeFile(join(target, 'registry', 'skills.json'), registrySnapshot.content, { encoding: 'utf8', mode: 0o600 })
    const fingerprint = await fingerprintManagedSkill(target)
    const metadata = await inspectSkillManagerMetadata(target, fingerprint.businessContentHash)
    if (!metadata.metadata || metadata.state !== 'askx-managed') throw new Error('修复后的系统 Skill 校验失败。')
    const record: ManagedSkillRecord = {
      id: manifest?.skills.find((skill) => skill.kind === 'system')?.id ?? randomUUID(),
      name: ASKX_SKILL_MANAGER_NAME,
      kind: 'system',
      canonicalPath: target,
      contentHash: fingerprint.contentHash,
      businessContentHash: fingerprint.businessContentHash,
      manager: {
        skillId: metadata.metadata.skill_id,
        version: metadata.metadata.version,
        localOnly: false,
        managedBy: metadata.metadata.managed_by,
        contentSha256: metadata.metadata.content_sha256,
      },
      updatedAt: new Date().toISOString(),
    }
    if (!manifest) throw new Error('请先完成 Skills 初始化，再修复系统 Skill。')
    const saved = await manifestStore.write({
      ...manifest,
      skills: [...manifest.skills.filter((skill) => skill.kind !== 'system'), record],
    }, manifest.revision)
    if (moved) await rm(backup, { recursive: true, force: true })
    return {
      id: randomUUID(),
      planHash: plan.hash,
      appliedAt: new Date().toISOString(),
      previousHealth: plan.health,
      preservedRegistry: plan.preserveRegistry,
      manifestRevision: saved.revision,
      warnings: plan.preserveRegistry ? [] : ['未找到有效 registry，原有 usage 与同步统计无法恢复。'],
    }
  } catch (error) {
    await rm(target, { recursive: true, force: true })
    if (moved && await pathExists(backup)) await rename(backup, target)
    throw error
  }
}
