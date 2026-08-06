import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const cliRoot = resolve(scriptDirectory, '..')
const workspaceRoot = resolve(cliRoot, '../..')
const distRoot = resolve(cliRoot, 'dist')

/** 确认发布资源不包含会在 npm pack 中丢失的软链。 */
async function assertPortableRuntimeAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`发布资源不能包含软链：${path}`)
    if (entry.isDirectory()) await assertPortableRuntimeAssets(path)
  }
}

/** 将发布版运行时资源复制到 CLI 包内。 */
async function copyRuntimeAssets() {
  const webTarget = resolve(distRoot, 'web/.output')
  const builtinTarget = resolve(distRoot, 'builtin')
  await mkdir(resolve(distRoot, 'web'), { recursive: true })
  await Promise.all([
    rm(webTarget, { recursive: true, force: true }),
    rm(builtinTarget, { recursive: true, force: true }),
  ])
  await Promise.all([
    cp(resolve(workspaceRoot, 'packages/web/.output'), webTarget, { recursive: true, dereference: true }),
    cp(resolve(workspaceRoot, 'packages/modules/skills/dist/builtin'), builtinTarget, { recursive: true }),
    cp(resolve(cliRoot, 'scripts/lifecycle.mjs'), resolve(distRoot, 'lifecycle.mjs')),
  ])
  await assertPortableRuntimeAssets(webTarget)
}

await copyRuntimeAssets()
