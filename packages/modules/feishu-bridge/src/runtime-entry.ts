/**
 * 桥接 runtime 的受管进程入口。
 * 真实 Feishu/Codex 适配器在此进程内挂载，服务管理器只负责生命周期。
 */
import { access } from 'node:fs/promises'
import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const startedAt = new Date().toISOString()
console.log(`[askx-bridge] runtime started at ${startedAt}`)
/** 可选的真实 Feishu/Codex bundle 入口，由部署环境显式提供。 */
const bundle = process.env.ASKX_FEISHU_BRIDGE_BUNDLE ?? join(dirname(fileURLToPath(import.meta.url)), 'runtime', 'bridge.mjs')
let child: ChildProcess | undefined
try {
  await access(bundle)
  const args = process.env.ASKX_FEISHU_BRIDGE_BUNDLE_ARGS?.split(' ').filter(Boolean) ?? ['--serve']
  child = spawn(process.execPath, [bundle, ...args], { stdio: 'inherit', env: process.env })
  child.once('exit', (code) => process.exit(code ?? 1))
} catch (error) {
  console.error(`[askx-bridge] bundle unavailable: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
const timer = setInterval(() => undefined, 60_000)
const stop = (signal: string) => {
  console.log(`[askx-bridge] runtime stopping (${signal})`)
  clearInterval(timer)
  if (child && child.exitCode === null) child.kill('SIGTERM')
  else process.exit(0)
}
process.once('SIGTERM', () => stop('SIGTERM'))
process.once('SIGINT', () => stop('SIGINT'))
