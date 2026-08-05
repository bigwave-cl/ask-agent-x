import { cp, lstat, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 当前脚本所在目录。 */
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
/** 内置 Skill Manager 名称。 */
const managerName = 'askx-skill-manager'
/** 模块构建产物和源码中的候选资源目录。 */
const sourceCandidates = [
  resolve(scriptDirectory, '../../modules/skills/dist/builtin', managerName),
  resolve(scriptDirectory, '../../modules/skills/builtin', managerName),
]
/** Nuxt 生产服务按模块运行位置解析到的目标目录。 */
const target = resolve(scriptDirectory, '../.output/builtin', managerName)

/** 判断候选路径是否为可复制目录。 */
async function isDirectory(path) {
  try {
    return (await lstat(path)).isDirectory()
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

/** 选择第一个存在的内置资源目录。 */
let source
for (const candidate of sourceCandidates) {
  if (await isDirectory(candidate)) {
    source = candidate
    break
  }
}
if (!source) throw new Error('未找到 AskX 内置 Skill Manager 构建资源。')

await mkdir(dirname(target), { recursive: true })
await rm(target, { recursive: true, force: true })
await cp(source, target, { recursive: true, preserveTimestamps: true })
