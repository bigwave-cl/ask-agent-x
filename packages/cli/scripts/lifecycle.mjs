import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Workspace 安装不启动服务；只有 npm 全局安装和卸载才执行生命周期动作。
if (process.env.npm_config_global !== 'true') process.exit(0)

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const cliEntry = resolve(scriptDirectory, 'index.js')
const child = spawn(process.execPath, [cliEntry, 'ui', 'start', '--json'], {
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
})

child.once('exit', (code) => process.exit(code ?? 1))
