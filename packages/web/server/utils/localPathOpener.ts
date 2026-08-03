import type { LocalOpenOption, LocalOpenTarget } from '../../shared/local-open.js'
import { spawn } from 'node:child_process'
import { access, stat } from 'node:fs/promises'
import { dirname, isAbsolute, normalize, resolve } from 'node:path'

/** 本地路径的文件系统类型。 */
export type LocalPathKind = 'directory' | 'file'

/** 无 Shell 调用系统程序所需的命令。 */
export interface LocalOpenInvocation {
  /** 可执行程序或系统命令。 */
  command: string
  /** 直接传给程序的参数。 */
  args: string[]
}

/** 已检测到的本地启动器。 */
interface LocalLauncher {
  /** 启动器使用的可执行程序。 */
  command: string
  /** 目标路径之前的固定参数。 */
  prefixArgs: string[]
}

/** macOS 编辑器应用信息。 */
const macEditorApplications = {
  cursor: { name: 'Cursor', paths: ['/Applications/Cursor.app'] },
  vscode: { name: 'Visual Studio Code', paths: ['/Applications/Visual Studio Code.app'] },
} as const

/** 编辑器对应的命令行命令。 */
const editorCommands = {
  cursor: 'cursor',
  vscode: 'code',
} as const

/** 判断路径是否存在。 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * 使用当前系统的命令发现工具判断程序是否存在。
 * @param command 需要发现的命令名。
 * @returns 命令是否可用。
 */
async function commandExists(command: string): Promise<boolean> {
  const finder = process.platform === 'win32' ? 'where.exe' : 'which'
  return await new Promise((resolveCommand) => {
    const child = spawn(finder, [command], { stdio: 'ignore', windowsHide: true })
    child.once('error', () => resolveCommand(false))
    child.once('close', code => resolveCommand(code === 0))
  })
}

/** 返回 Windows 中可能存在的编辑器可执行文件。 */
function windowsEditorCandidates(target: Exclude<LocalOpenTarget, 'system'>): string[] {
  const localAppData = process.env.LOCALAPPDATA
  const programFiles = process.env.ProgramFiles
  const programFilesX86 = process.env['ProgramFiles(x86)']
  const relative = target === 'cursor' ? ['Cursor', 'Cursor.exe'] : ['Microsoft VS Code', 'Code.exe']
  return [localAppData && resolve(localAppData, 'Programs', ...relative), programFiles && resolve(programFiles, ...relative), programFilesX86 && resolve(programFilesX86, ...relative)].filter((path): path is string => Boolean(path))
}

/**
 * 发现指定打开方式在当前设备中的启动命令。
 * @param target 打开方式。
 * @returns 可用启动器；未安装时返回 null。
 */
async function resolveLauncher(target: LocalOpenTarget): Promise<LocalLauncher | null> {
  if (target === 'system') {
    if (process.platform === 'darwin') return { command: 'open', prefixArgs: [] }
    if (process.platform === 'win32') return { command: 'explorer.exe', prefixArgs: [] }
    return await commandExists('xdg-open') ? { command: 'xdg-open', prefixArgs: [] } : null
  }

  if (await commandExists(editorCommands[target])) return { command: editorCommands[target], prefixArgs: [] }

  if (process.platform === 'darwin') {
    const application = macEditorApplications[target]
    const homeApplication = resolve(process.env.HOME ?? '', 'Applications', `${application.name}.app`)
    const available = await Promise.all([...application.paths, homeApplication].map(pathExists))
    return available.some(Boolean) ? { command: 'open', prefixArgs: ['-a', application.name] } : null
  }

  if (process.platform === 'win32') {
    for (const candidate of windowsEditorCandidates(target)) {
      if (await pathExists(candidate)) return { command: candidate, prefixArgs: [] }
    }
  }

  return null
}

/**
 * 生成跨平台、无 Shell 的本地路径打开命令。
 * @param target 打开方式。
 * @param path 已校验的绝对路径。
 * @param kind 路径对应文件还是目录。
 * @param platform 当前 Node 平台。
 * @param launcher 已发现的启动器。
 * @returns 可交给 spawn 的命令与参数。
 */
export function buildLocalOpenInvocation(target: LocalOpenTarget, path: string, kind: LocalPathKind, platform: NodeJS.Platform, launcher: LocalLauncher): LocalOpenInvocation {
  if (target !== 'system') return { command: launcher.command, args: [...launcher.prefixArgs, path] }
  if (platform === 'darwin') return { command: launcher.command, args: kind === 'file' ? ['-R', path] : [path] }
  if (platform === 'win32') return { command: launcher.command, args: kind === 'file' ? [`/select,${path}`] : [path] }
  return { command: launcher.command, args: [kind === 'file' ? dirname(path) : path] }
}

/**
 * 校验浏览器传入的本地路径。
 * @param input 用户界面提交的路径。
 * @returns 规范化后的绝对路径和文件类型。
 */
export async function inspectLocalOpenPath(input: string): Promise<{ kind: LocalPathKind, path: string }> {
  if (!isAbsolute(input)) throw new Error('只能打开本机绝对路径。')
  const path = normalize(input)
  const metadata = await stat(path).catch(() => null)
  if (!metadata) throw new Error('目标路径不存在或不可读取。')
  if (!metadata.isDirectory() && !metadata.isFile()) throw new Error('当前路径类型不支持打开。')
  return { kind: metadata.isDirectory() ? 'directory' : 'file', path }
}

/** 返回当前设备支持的本地路径打开方式。 */
export async function listLocalOpenOptions(): Promise<LocalOpenOption[]> {
  const targets: LocalOpenTarget[] = ['system', 'cursor', 'vscode']
  return await Promise.all(targets.map(async id => ({ id, available: Boolean(await resolveLauncher(id)) })))
}

/**
 * 从 Node 层调用本机文件管理器或编辑器打开路径。
 * @param target 打开方式。
 * @param inputPath 需要打开的绝对路径。
 * @returns 已交给系统处理的路径。
 */
export async function openLocalPath(target: LocalOpenTarget, inputPath: string): Promise<string> {
  const [{ kind, path }, launcher] = await Promise.all([inspectLocalOpenPath(inputPath), resolveLauncher(target)])
  if (!launcher) throw new Error('当前设备没有安装或无法调用所选打开方式。')
  const invocation = buildLocalOpenInvocation(target, path, kind, process.platform, launcher)
  await new Promise<void>((resolveOpen, rejectOpen) => {
    const child = spawn(invocation.command, invocation.args, { detached: true, stdio: 'ignore', windowsHide: true })
    child.once('error', rejectOpen)
    child.once('spawn', () => {
      child.unref()
      resolveOpen()
    })
  })
  return path
}
