import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

/** 生产构建静态资源目录。 */
const outputDirectory = resolve('.output/public/_nuxt')
/** 预期独立拆分的语法名称。 */
const expectedLanguages = [
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'dockerfile',
  'go',
  'ini',
  'java',
  'javascript',
  'json',
  'kotlin',
  'markdown',
  'php',
  'python',
  'ruby',
  'rust',
  'scss',
  'sql',
  'swift',
  'typescript',
  'xml',
  'yaml',
]

/**
 * 断言构建条件成立。
 *
 * @param condition 当前条件。
 * @param message 失败说明。
 */
function assertBuild(condition, message) {
  if (!condition) throw new Error(`[highlight chunks] ${message}`)
}

/** 构建目录中的全部文件名。 */
const outputFiles = await readdir(outputDirectory)
/** Worker 入口文件。 */
const workerFiles = outputFiles.filter(file => /^codeHighlight\.worker-[\w-]+\.js$/u.test(file))

assertBuild(workerFiles.length === 1, `预期一个高亮 Worker，实际为 ${workerFiles.length} 个。`)

/** Worker 入口源码。 */
const workerSource = await readFile(resolve(outputDirectory, workerFiles[0]), 'utf8')
/** Worker 动态依赖的 chunk 文件。 */
const workerImports = [...workerSource.matchAll(/import\("\.\/([^"?]+\.js)"\)/gu)].map(match => match[1])

for (const language of expectedLanguages) {
  const languageChunks = outputFiles.filter(file => new RegExp(`^${language}-[\\w-]+\\.js$`, 'u').test(file))
  assertBuild(languageChunks.length === 1, `${language} 应生成一个独立语法 chunk。`)
  assertBuild(workerImports.includes(languageChunks[0]), `${language} 语法 chunk 必须由 Worker 动态加载。`)
}

/** Lowlight 核心候选 chunk。 */
const coreImports = workerImports.filter(file => !expectedLanguages.some(language => file.startsWith(`${language}-`)))
assertBuild(coreImports.length === 1, 'Lowlight 核心必须保持为一个 Worker 动态 chunk。')

for (const importedFile of workerImports) {
  const importedStats = await stat(resolve(outputDirectory, importedFile))
  assertBuild(importedStats.size > 0, `${importedFile} 不得为空。`)
}

process.stdout.write(`[highlight chunks] Worker、Lowlight 核心与 ${expectedLanguages.length} 个语法 chunk 均保持异步拆分。\n`)
