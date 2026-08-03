import { lstat, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { hashSkillDirectory } from './scanner.js'
import type { ManagedPlatformBinding, ManagedPlatformHealth, ManagedSkillHealth, ManagedSkillRecord } from './skill-types.js'

/** 判断路径是否存在，失效软链也视为存在。 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/** 判断路径是否为当前 AskX 受管软链。 */
async function isManagedLink(path: string, target: string): Promise<boolean> {
  try {
    await verifyManagedLink(path, target)
    return true
  } catch {
    return false
  }
}

/**
 * 验证统一源内容指纹。
 * @param path 统一源路径。
 * @param expectedHash 计划中的内容指纹。
 */
export async function verifyCanonicalSkill(path: string, expectedHash: string): Promise<void> {
  const actualHash = await hashSkillDirectory(path)
  if (actualHash !== expectedHash) throw new Error(`统一源验证失败：${path}`)
}

/**
 * 验证平台路径是指向统一源的软链。
 * @param path 平台软链路径。
 * @param expectedTarget 统一源路径。
 */
export async function verifyManagedLink(path: string, expectedTarget: string): Promise<void> {
  const stat = await lstat(path)
  if (!stat.isSymbolicLink()) throw new Error(`目标不是软链：${path}`)
  const [actualTarget, canonicalTarget] = await Promise.all([realpath(path), realpath(expectedTarget)])
  if (resolve(actualTarget) !== resolve(canonicalTarget)) throw new Error(`软链目标验证失败：${path}`)
}

/**
 * 检查一个受管 Skill 的统一源和平台绑定，不修改文件系统。
 * @param record manifest 中登记的受管 Skill。
 * @returns 当前健康状态。
 */
export async function inspectManagedSkill(record: ManagedSkillRecord): Promise<ManagedSkillHealth> {
  const issues: string[] = []
  let drifted = false
  try {
    if (await hashSkillDirectory(record.canonicalPath) !== record.contentHash) {
      drifted = true
      issues.push(`统一源内容已经变化：${record.canonicalPath}`)
    }
  } catch {
    drifted = true
    issues.push(`统一源无法读取：${record.canonicalPath}`)
  }
  return { skillId: record.id, drifted, issues }
}

/**
 * 检查平台 Skills 根目录是否仍指向 AskX 统一目录。
 * @param binding Manifest 登记的平台根目录绑定。
 * @returns 当前根目录绑定健康状态。
 */
export async function inspectManagedPlatformBinding(binding: ManagedPlatformBinding): Promise<ManagedPlatformHealth> {
  if (binding.suspendedAt && binding.suspendedPath) {
    try {
      await verifyManagedLink(binding.suspendedPath, binding.target)
      if (binding.originalRootBackup) {
        if (!await pathExists(binding.path)) throw new Error(`接入前的平台 Skills 目录未恢复：${binding.path}`)
        if (await pathExists(binding.originalRootBackup.backupPath)) throw new Error(`平台原目录的备份位置被占用：${binding.originalRootBackup.backupPath}`)
        if (await isManagedLink(binding.path, binding.target)) throw new Error(`接入前的平台 Skills 目录未恢复：${binding.path}`)
      } else if (await pathExists(binding.path)) {
        throw new Error(`平台路径在取消软链期间被占用：${binding.path}`)
      }
      return { platform: binding.platform, status: 'suspended', connected: false, issues: [] }
    } catch (error) {
      return { platform: binding.platform, status: 'broken', connected: false, issues: [(error as Error).message] }
    }
  }
  try {
    await verifyManagedLink(binding.path, binding.target)
    if (binding.originalRootBackup && !await pathExists(binding.originalRootBackup.backupPath)) {
      throw new Error(`接入前的平台 Skills 目录备份已丢失：${binding.originalRootBackup.backupPath}`)
    }
    return { platform: binding.platform, status: 'connected', connected: true, issues: [] }
  } catch (error) {
    return { platform: binding.platform, status: 'broken', connected: false, issues: [(error as Error).message || `平台根目录绑定失效：${binding.path}`] }
  }
}
