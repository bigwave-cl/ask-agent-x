import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, isAbsolute, resolve } from 'node:path'

/** Promise 形式的无 Shell 子进程调用。 */
const execFileAsync = promisify(execFile)

/** 系统目录选择器返回的本地目录。 */
export interface SelectedLocalDirectory {
  /** 用于界面展示的目录名称。 */
  name: string
  /** Node 可以直接读取的绝对路径。 */
  path: string
}

/** 系统目录选择器的展示选项。 */
export interface LocalDirectoryPickerOptions {
  /** 原生窗口中的操作提示。 */
  prompt?: string
}

/** 创建 macOS 原生目录选择器使用的 JXA 脚本。 */
function createMacOSDirectoryPickerScript(prompt: string): string {
  return `
const app = Application.currentApplication()
app.includeStandardAdditions = true
const selected = app.chooseFolder({
  withPrompt: ${JSON.stringify(prompt)},
  multipleSelectionsAllowed: true,
})
JSON.stringify([].concat(selected).map((folder) => folder.toString()))
`
}

/**
 * 解析并校验系统目录选择器的输出。
 * @param output JXA 输出的 JSON 数组。
 * @returns 去重并稳定排序的本地目录。
 */
export function parseSelectedLocalDirectories(output: string): SelectedLocalDirectory[] {
  const parsed: unknown = JSON.parse(output.trim() || '[]')
  if (!Array.isArray(parsed) || parsed.some((path) => typeof path !== 'string' || !isAbsolute(path))) {
    throw new Error('系统目录选择器返回了无效路径。')
  }
  const paths = [...new Set(parsed.map((path) => resolve(path as string)))].sort()
  if (paths.length > 20) throw new Error('一次最多选择 20 个额外扫描目录。')
  return paths.map((path) => ({ name: basename(path), path }))
}

/**
 * 通过本地 Node 进程打开系统原生目录多选窗口。
 * @param options 原生目录选择器展示选项。
 * @returns 用户选中的绝对目录；取消时返回空数组。
 */
export async function selectLocalDirectories(options: LocalDirectoryPickerOptions = {}): Promise<SelectedLocalDirectory[]> {
  if (process.platform !== 'darwin') throw new Error('当前版本仅支持在 macOS 上使用原生目录选择器。')
  try {
    const script = createMacOSDirectoryPickerScript(options.prompt ?? '选择需要扫描的 Skill 文件夹')
    const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    })
    return parseSelectedLocalDirectories(stdout)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/User canceled|用户已取消|-128/.test(message)) return []
    throw error
  }
}
