import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, lstat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, posix, win32 } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type PlatformId = 'agents' | 'codex' | 'claude' | 'cursor'

/** 平台预设目录使用的路径风格。 */
export type PlatformPathFlavor = 'posix' | 'windows'

/** Node 创建受管目录链接时使用的链接类型。 */
export type ManagedDirectoryLinkType = 'dir' | 'junction'

export interface PlatformDescriptor {
  /** 平台标识。 */
  id: PlatformId
  /** 平台展示名称。 */
  name: string
  /** 用于只读版本探测的命令。 */
  command?: string
  /** 平台约定的 Skills 根目录。 */
  skillsDir: string
}

export interface PlatformDetection extends PlatformDescriptor {
  /** 是否检测到平台命令或共享目录。 */
  installed: boolean
  /** Skills 根路径是否已经存在。 */
  skillsDirExists: boolean
  /** 探测到的平台版本。 */
  version?: string
  /** 当前文件系统路径是否允许切换为目录软链。 */
  linkSupported: boolean
  /** 可解释的检测说明。 */
  notes: string[]
}

/**
 * 根据运行系统选择平台预设目录的路径风格。
 * @param runtimePlatform Node 运行时平台。
 * @returns Windows 使用 win32 路径，其余系统使用 POSIX 路径。
 */
export function resolvePlatformPathFlavor(runtimePlatform: NodeJS.Platform = process.platform): PlatformPathFlavor {
  return runtimePlatform === 'win32' ? 'windows' : 'posix'
}

/**
 * 根据运行系统选择平台根目录链接类型。
 * @param runtimePlatform Node 运行时平台。
 * @returns Windows 使用目录 junction，macOS/Linux 使用目录软链接。
 */
export function managedDirectoryLinkType(runtimePlatform: NodeJS.Platform = process.platform): ManagedDirectoryLinkType {
  return runtimePlatform === 'win32' ? 'junction' : 'dir'
}

/**
 * 生成各 Agent 已知的用户级 Skills 目录。
 * @param home 用户主目录。
 * @param pathFlavor 当前系统路径风格。
 * @returns 固定顺序的平台目录描述。
 */
export function platformDescriptors(
  home = homedir(),
  pathFlavor: PlatformPathFlavor = resolvePlatformPathFlavor(),
): PlatformDescriptor[] {
  const path = pathFlavor === 'windows' ? win32 : posix
  return [
    { id: 'agents', name: 'Agents shared', skillsDir: path.join(home, '.agents', 'skills') },
    { id: 'codex', name: 'ChatGPT / Codex', command: 'codex', skillsDir: path.join(home, '.codex', 'skills') },
    { id: 'claude', name: 'Claude / Claude Code', command: 'claude', skillsDir: path.join(home, '.claude', 'skills') },
    { id: 'cursor', name: 'Cursor', command: 'cursor', skillsDir: path.join(home, '.cursor', 'skills') },
  ]
}

function numericVersion(value: string): number[] {
  return value.match(/\d+(?:\.\d+){1,3}/)?.[0].split('.').map(Number) ?? []
}

export function versionAtLeast(actual: string, minimum: string): boolean {
  const left = numericVersion(actual)
  const right = numericVersion(minimum)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return true
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * 查找目标路径最近的已存在父目录。
 * @param path 预计创建软链的目标路径。
 * @returns 最近的已存在目录。
 */
async function findExistingAncestor(path: string): Promise<string> {
  let candidate = dirname(path)
  while (true) {
    try {
      const stat = await lstat(candidate)
      if (stat.isDirectory()) return candidate
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const parent = dirname(candidate)
    if (parent === candidate) return candidate
    candidate = parent
  }
}

/**
 * 只读判断 Skills 根路径能否被备份并替换为目录软链。
 * @param skillsDir 平台 Skills 根路径。
 * @returns 当前文件系统权限是否允许根目录接入。
 */
async function canBindSkillsRoot(skillsDir: string): Promise<boolean> {
  try {
    const ancestor = await findExistingAncestor(skillsDir)
    await access(ancestor, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/**
 * 读取平台命令版本，Windows 通过 cmd.exe 解析固定命令名。
 * @param command 平台固定命令名。
 * @param runtimePlatform Node 运行时平台。
 * @returns 可识别的版本输出，探测失败时为空。
 */
async function readCommandVersion(command: string, runtimePlatform: NodeJS.Platform): Promise<string | undefined> {
  try {
    const result = runtimePlatform === 'win32'
      ? await execFileAsync('cmd.exe', ['/d', '/s', '/c', `${command} --version`], { timeout: 1500 })
      : await execFileAsync(command, ['--version'], { timeout: 1500 })
    return `${result.stdout || result.stderr}`.trim() || undefined
  } catch {
    return undefined
  }
}

/**
 * 生成桌面客户端和用户配置根目录的已知安装标记。
 * @param descriptor 平台描述。
 * @param home 用户主目录。
 * @param runtimePlatform Node 运行时平台。
 * @returns 可用于只读安装检测的路径列表。
 */
function installationMarkers(descriptor: PlatformDescriptor, home: string, runtimePlatform: NodeJS.Platform): string[] {
  const path = runtimePlatform === 'win32' ? win32 : posix
  const configRoot = dirname(descriptor.skillsDir)
  if (descriptor.id === 'agents') return [descriptor.skillsDir]
  if (runtimePlatform === 'darwin') {
    const appNames = descriptor.id === 'codex' ? ['Codex.app', 'ChatGPT.app'] : descriptor.id === 'claude' ? ['Claude.app'] : ['Cursor.app']
    return [configRoot, ...appNames.flatMap((name) => [path.join(home, 'Applications', name), path.join('/Applications', name)])]
  }
  if (runtimePlatform === 'win32') {
    const appNames = descriptor.id === 'codex' ? ['Codex', 'ChatGPT'] : descriptor.id === 'claude' ? ['Claude'] : ['Cursor']
    return [configRoot, ...appNames.map((name) => path.join(home, 'AppData', 'Local', 'Programs', name))]
  }
  const desktopNames = descriptor.id === 'codex' ? ['codex.desktop', 'chatgpt.desktop'] : descriptor.id === 'claude' ? ['claude.desktop'] : ['cursor.desktop']
  return [configRoot, ...desktopNames.map((name) => path.join(home, '.local', 'share', 'applications', name))]
}

/**
 * 只读检测平台命令、预设目录和目录链接能力。
 * @param home 用户主目录。
 * @param runtimePlatform Node 运行时平台。
 * @returns 固定顺序的平台检测结果。
 */
export async function detectPlatforms(
  home = homedir(),
  runtimePlatform: NodeJS.Platform = process.platform,
): Promise<PlatformDetection[]> {
  return Promise.all(
    platformDescriptors(home, resolvePlatformPathFlavor(runtimePlatform)).map(async (descriptor) => {
      const version = descriptor.command ? await readCommandVersion(descriptor.command, runtimePlatform) : undefined
      const detectedMarker = (await Promise.all(installationMarkers(descriptor, home, runtimePlatform).map(async (path) => await pathExists(path) ? path : undefined))).find(Boolean)
      const installed = Boolean(version || detectedMarker)
      const linkSupported = await canBindSkillsRoot(descriptor.skillsDir)
      const notes: string[] = []
      if (descriptor.id === 'agents') notes.push('Shared discovery directory; not a standalone Agent installation.')
      if (descriptor.id === 'cursor') notes.push('Cursor may discover Skills from additional compatible directories.')
      if (!version && detectedMarker && descriptor.id !== 'agents') notes.push(`Detected desktop application or user configuration: ${detectedMarker}`)
      if (!linkSupported) notes.push('The Skills root path is not writable and cannot be replaced with a managed directory link.')
      return {
        ...descriptor,
        installed,
        skillsDirExists: await pathExists(descriptor.skillsDir),
        ...(version ? { version } : {}),
        linkSupported,
        notes,
      }
    }),
  )
}
