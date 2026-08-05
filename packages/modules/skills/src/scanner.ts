import { lstat, readdir, readlink } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { stableHash } from '@askx/core'
import { detectPlatforms, platformDescriptors } from '@askx/platform-adapters'
import { readSkillMetadata } from './skill-metadata.js'
import { fingerprintManagedSkill, inspectSkillManagerMetadata, type SkillManagerMetadata } from './skill-manager-metadata.js'
import type {
  SkillGroup,
  SkillGroupStatus,
  SkillCustomScanRoot,
  SkillLocation,
  SkillPlatformId,
  SkillPlatformStatus,
  SkillsScanReport,
} from './skill-types.js'
import { MAX_CUSTOM_SKILL_DIRECTORIES } from './skill-types.js'

/** Skill 扫描默认支持的平台顺序。 */
export const supportedSkillPlatforms: SkillPlatformId[] = ['codex', 'claude', 'cursor']

/** 一个进入统一目录扫描器的根目录来源。 */
interface SkillScanDirectory {
  /** 目录来源；平台来源只是带有预设路径的普通目录。 */
  platform: SkillLocation['platform']
  /** 要枚举的绝对目录。 */
  path: string
  /** 自选目录标识，仅 custom 来源存在。 */
  customRootId?: string | undefined
  /** 是否允许当前根目录自身就是一个 Skill。 */
  allowRootSkill: boolean
}

/**
 * 对目录业务内容生成稳定指纹。
 * @param root 要读取的目录。
 * @returns SHA-256 内容指纹。
 */
export async function hashSkillDirectory(root: string): Promise<string> {
  return (await fingerprintManagedSkill(root)).contentHash
}

/** 将完整 manager 元数据收口为扫描摘要。 */
function summarizeManagerMetadata(metadata: SkillManagerMetadata) {
  return {
    skillId: metadata.skill_id,
    version: metadata.version,
    localOnly: metadata.local_only,
    managedBy: metadata.managed_by,
    contentSha256: metadata.content_sha256,
  }
}

/** 读取一个可访问 Skill 的双指纹与 manager 状态。 */
async function inspectLocationContent(path: string) {
  const fingerprint = await fingerprintManagedSkill(path)
  const manager = await inspectSkillManagerMetadata(path, fingerprint.businessContentHash)
  return {
    contentHash: fingerprint.contentHash,
    businessContentHash: fingerprint.businessContentHash,
    managerState: manager.state,
    ...(manager.metadata ? { managerMetadata: summarizeManagerMetadata(manager.metadata) } : {}),
    ...(manager.error ? { managerError: manager.error } : {}),
  }
}

/**
 * 只检测三个受支持平台的应用与目录状态。
 * @param homeDir 可注入的用户目录。
 * @returns 保持固定顺序的平台状态。
 */
export async function detectSkillPlatforms(homeDir: string): Promise<SkillPlatformStatus[]> {
  const detections = await detectPlatforms(homeDir)
  return supportedSkillPlatforms.map((id) => {
    const detected = detections.find((entry) => entry.id === id)
    if (!detected) throw new Error(`缺少平台描述：${id}`)
    return {
      id,
      name: detected.name,
      skillsDir: detected.skillsDir,
      installed: detected.installed,
      skillsDirExists: detected.skillsDirExists,
      ...(detected.version ? { version: detected.version } : {}),
      linkSupported: detected.linkSupported,
      notes: detected.notes,
    }
  })
}

/**
 * 推导同名 Skill 分组状态。
 * @param locations 分组内的副本。
 * @returns 分组状态。
 */
function resolveGroupStatus(locations: SkillLocation[]): SkillGroupStatus {
  if (locations.some((location) => location.broken)) return 'broken'
  if (locations.some((location) => !location.metadata.valid || !location.contentHash)) return 'invalid'
  if (locations.length === 1) return 'unique'
  const hashes = new Set(locations.map((location) => location.contentHash))
  return hashes.size === 1 ? 'identical' : 'conflict'
}

/**
 * 将扫描位置聚合为逻辑 Skill。
 * @param locations 扫描到的所有位置。
 * @returns 按名称稳定排序的逻辑分组。
 */
export function groupSkillLocations(locations: SkillLocation[]): SkillGroup[] {
  const grouped = new Map<string, SkillLocation[]>()
  for (const location of locations) {
    grouped.set(location.name, [...(grouped.get(location.name) ?? []), location])
  }
  return [...grouped.entries()]
    .filter(([, entries]) => entries.some((entry) => entry.platform !== 'askx'))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, entries]) => {
      const ordered = [...entries].sort((left, right) => {
        const leftOrder = left.platform === 'askx'
          ? supportedSkillPlatforms.length
          : left.platform === 'custom' ? supportedSkillPlatforms.length + 1 : supportedSkillPlatforms.indexOf(left.platform)
        const rightOrder = right.platform === 'askx'
          ? supportedSkillPlatforms.length
          : right.platform === 'custom' ? supportedSkillPlatforms.length + 1 : supportedSkillPlatforms.indexOf(right.platform)
        return leftOrder - rightOrder || left.path.localeCompare(right.path)
      })
      const status = resolveGroupStatus(ordered)
      return {
        id: stableHash({ name, locations: ordered.map((entry) => entry.id) }),
        name,
        locations: ordered,
        hashes: [...new Set(ordered.flatMap((entry) => entry.contentHash ? [entry.contentHash] : []))].sort(),
        status,
        recommendedAction: status === 'unique' ? 'adopt' : status === 'identical' ? 'merge' : 'keep',
      }
    })
}

/**
 * 使用同一规则扫描一个目录根，不区分平台预设目录和用户自选目录。
 * @param root 已解析的扫描目录根。
 * @param scannedPaths 当前扫描已经处理的绝对路径。
 * @returns 当前目录中发现的 Skill 位置。
 */
async function scanSkillDirectory(root: SkillScanDirectory, scannedPaths: Set<string>): Promise<SkillLocation[]> {
  let entries
  try {
    entries = await readdir(root.path, { withFileTypes: true })
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return []
    throw error
  }
  const rootHasSkillFile = root.allowRootSkill && await lstat(join(root.path, 'SKILL.md'))
    .then((stat) => stat.isFile())
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return false
      throw error
    })
  const candidates = rootHasSkillFile
    ? [{ name: basename(root.path), path: root.path }]
    : entries.sort((left, right) => left.name.localeCompare(right.name)).flatMap((entry) => {
        if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isSymbolicLink())) return []
        return [{ name: entry.name, path: join(root.path, entry.name) }]
      })
  const locations: SkillLocation[] = []
  for (const entry of candidates) {
    if (entry.name.startsWith('.')) continue
    const path = entry.path
    const normalizedPath = resolve(path)
    if (scannedPaths.has(normalizedPath)) continue
    scannedPaths.add(normalizedPath)
    const stat = await lstat(path)
    const id = stableHash({
      platform: root.platform,
      path,
      customRootId: root.platform === 'custom' ? root.customRootId : undefined,
    })
    if (stat.isSymbolicLink()) {
      const target = await readlink(path)
      try {
        const inspected = await inspectLocationContent(path)
        locations.push({
          id,
          platform: root.platform,
          ...(root.platform === 'custom' ? { customRootId: root.customRootId! } : {}),
          name: entry.name,
          path,
          kind: 'symlink',
          target,
          ...inspected,
          metadata: await readSkillMetadata(path),
          broken: false,
        })
      } catch {
        locations.push({
          id,
          platform: root.platform,
          ...(root.platform === 'custom' ? { customRootId: root.customRootId! } : {}),
          name: entry.name,
          path,
          kind: 'symlink',
          target,
          managerState: 'metadata-invalid',
          managerError: '软链目标不存在或不可读。',
          metadata: { valid: false, error: '软链目标不存在或不可读。' },
          broken: true,
        })
      }
      continue
    }
    const inspected = await inspectLocationContent(path)
    locations.push({
      id,
      platform: root.platform,
      ...(root.platform === 'custom' ? { customRootId: root.customRootId! } : {}),
      name: entry.name,
      path,
      kind: 'directory',
      ...inspected,
      metadata: await readSkillMetadata(path),
      broken: false,
    })
  }
  return locations
}

/**
 * 扫描用户明确选择的平台和 AskX 内部统一源。
 * @param homeDir 用户目录。
 * @param dataDir AskX 数据目录。
 * @param platforms 本次允许扫描的平台。
 * @param customRootPaths 用户通过本地目录选择器添加的额外根目录。
 * @returns 只读扫描报告。
 */
export async function scanSkills(
  homeDir: string,
  dataDir: string,
  platforms: SkillPlatformId[] = supportedSkillPlatforms,
  customRootPaths: string[] = [],
): Promise<SkillsScanReport> {
  const uniquePlatforms = supportedSkillPlatforms.filter((platform) => platforms.includes(platform))
  if (!uniquePlatforms.length) throw new Error('至少选择一个 Skill 平台。')
  const descriptors = platformDescriptors(homeDir)
  if (customRootPaths.length > MAX_CUSTOM_SKILL_DIRECTORIES) {
    throw new Error(`一次最多选择 ${MAX_CUSTOM_SKILL_DIRECTORIES} 个额外扫描目录。`)
  }
  const normalizedCustomPaths = [...new Set(customRootPaths.map((path) => {
    if (!isAbsolute(path)) throw new Error(`额外扫描目录必须是绝对路径：${path}`)
    return resolve(path)
  }))].sort()
  const customRoots: SkillCustomScanRoot[] = []
  for (const path of normalizedCustomPaths) {
    const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') throw new Error(`额外扫描目录不存在：${path}`)
      throw error
    })
    if (!stat.isDirectory()) throw new Error(`额外扫描路径不是目录：${path}`)
    customRoots.push({ id: stableHash({ type: 'custom-skill-root', path }), name: basename(path), path })
  }
  const roots: SkillScanDirectory[] = [
    ...uniquePlatforms.map((platform) => {
      const descriptor = descriptors.find((entry) => entry.id === platform)
      if (!descriptor) throw new Error(`缺少平台描述：${platform}`)
      return { platform, path: descriptor.skillsDir, allowRootSkill: false }
    }),
    { platform: 'askx', path: join(dataDir, 'skills'), allowRootSkill: false },
    ...customRoots.map((root) => ({ platform: 'custom' as const, path: root.path, customRootId: root.id, allowRootSkill: true })),
  ]
  const locations: SkillLocation[] = []
  const scannedPaths = new Set<string>()

  for (const root of roots) {
    locations.push(...await scanSkillDirectory(root, scannedPaths))
  }

  const platformStatuses = (await detectSkillPlatforms(homeDir)).filter((platform) => uniquePlatforms.includes(platform.id))
  const groups = groupSkillLocations(locations)
  const scannedAt = new Date().toISOString()
  const fingerprint = stableHash({ platforms: uniquePlatforms, platformStatuses, customRoots, locations, groups })
  return { scannedAt, platforms: uniquePlatforms, platformStatuses, customRoots, locations, groups, fingerprint }
}
