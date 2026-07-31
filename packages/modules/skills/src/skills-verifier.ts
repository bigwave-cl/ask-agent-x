import { lstat, readlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { hashSkillDirectory } from './scanner.js'
import type { ManagedSkillHealth, ManagedSkillRecord } from './skill-types.js'

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
  const actualTarget = await readlink(path)
  if (resolve(path, '..', actualTarget) !== resolve(expectedTarget)) throw new Error(`软链目标验证失败：${path}`)
}

/**
 * 检查一个受管 Skill 的统一源和平台绑定，不修改文件系统。
 * @param record manifest 中登记的受管 Skill。
 * @returns 当前健康状态。
 */
export async function inspectManagedSkill(record: ManagedSkillRecord): Promise<ManagedSkillHealth> {
  const issues: string[] = []
  let drifted = false
  let brokenBindings = 0
  try {
    if (await hashSkillDirectory(record.canonicalPath) !== record.contentHash) {
      drifted = true
      issues.push(`统一源内容已经变化：${record.canonicalPath}`)
    }
  } catch {
    drifted = true
    issues.push(`统一源无法读取：${record.canonicalPath}`)
  }
  for (const binding of record.bindings) {
    try {
      await verifyManagedLink(binding.path, binding.target)
    } catch {
      brokenBindings += 1
      issues.push(`平台绑定失效：${binding.path}`)
    }
  }
  return { skillId: record.id, drifted, brokenBindings, issues }
}
