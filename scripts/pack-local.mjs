import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const workspaceRoot = process.cwd()
const outputDirectory = resolve(process.env.ASKX_PACK_DIR ?? 'dist/npm')
const packageDirectory = resolve(workspaceRoot, 'packages/cli')

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true, mode: 0o700 })

const child = spawn('npm', ['pack', packageDirectory, '--pack-destination', outputDirectory], {
  cwd: workspaceRoot,
  stdio: 'inherit',
})
const [code] = await once(child, 'exit')
if (code !== 0) process.exit(code ?? 1)

console.log(`npm 发布包已生成：${outputDirectory}`)
