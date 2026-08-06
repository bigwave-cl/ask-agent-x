import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 支持持久全局安装 AskAgent X 的包管理器。 */
export type AskXPackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/** 安装生命周期记录。 */
export interface AskXInstallRecord {
  /** 记录格式版本。 */
  schema: 1
  /** 执行全局安装的包管理器。 */
  packageManager: AskXPackageManager
  /** 安装后的包根目录。 */
  packageDirectory: string
  /** 安装完成时间。 */
  installedAt: string
}

/** 卸载子进程调用信息。 */
export interface PackageManagerInvocation {
  /** 可执行文件名。 */
  command: string
  /** 传给包管理器的参数。 */
  args: string[]
}

/**
 * 根据生命周期 user-agent 识别包管理器。
 * @param userAgent 包管理器注入的 user-agent。
 * @returns 已识别的包管理器。
 */
export function packageManagerFromUserAgent(userAgent: string | undefined): AskXPackageManager | undefined {
  const name = userAgent?.trim().split(/[\s/]/u)[0]?.toLowerCase()
  return name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun' ? name : undefined
}

/**
 * 根据全局安装路径推断包管理器。
 * @param packageDirectory 当前 AskAgent X 包根目录。
 * @returns 已推断的包管理器。
 */
export function packageManagerFromInstallPath(packageDirectory: string): AskXPackageManager | undefined {
  const normalized = packageDirectory.replaceAll('\\', '/').toLowerCase()
  if (normalized.includes('/.bun/install/global/')) return 'bun'
  if (normalized.includes('/yarn/global/') || normalized.includes('/.config/yarn/global/')) return 'yarn'
  if (normalized.includes('/pnpm/global/') || normalized.includes('/pnpm-global/')) return 'pnpm'
  if (normalized.includes('/lib/node_modules/') || /^[a-z]:\/[^/]*node_modules\//u.test(normalized)) return 'npm'
  return undefined
}

/**
 * 读取安装生命周期写入的包管理器记录。
 * @param dataDir AskX 数据目录。
 * @returns 有效安装记录；不存在或无效时返回 undefined。
 */
export async function readInstallRecord(dataDir: string): Promise<AskXInstallRecord | undefined> {
  try {
    const candidate = JSON.parse(await readFile(join(dataDir, 'install.json'), 'utf8')) as Partial<AskXInstallRecord>
    if (candidate.schema !== 1 || typeof candidate.packageDirectory !== 'string' || typeof candidate.installedAt !== 'string') return undefined
    if (!candidate.packageManager || !['npm', 'pnpm', 'yarn', 'bun'].includes(candidate.packageManager)) return undefined
    return candidate as AskXInstallRecord
  } catch {
    return undefined
  }
}

/**
 * 生成对应包管理器的全局卸载调用。
 * @param packageManager 安装 AskAgent X 的包管理器。
 * @param runtimePlatform Node 运行平台。
 * @returns 可执行文件和参数。
 */
export function createUninstallInvocation(
  packageManager: AskXPackageManager,
  runtimePlatform: NodeJS.Platform = process.platform,
): PackageManagerInvocation {
  const windowsSuffix = runtimePlatform === 'win32' && packageManager !== 'bun' ? '.cmd' : ''
  if (packageManager === 'yarn') return { command: `yarn${windowsSuffix}`, args: ['global', 'remove', 'askagent-x'] }
  return {
    command: `${packageManager}${windowsSuffix}`,
    args: ['remove', '--global', 'askagent-x'],
  }
}
