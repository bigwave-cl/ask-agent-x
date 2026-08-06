import { spawn } from 'node:child_process'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const packageDirectory = resolve(scriptDirectory, '..')

/** 根据生命周期 user-agent 识别包管理器。 */
function packageManagerFromUserAgent(userAgent) {
  const name = userAgent?.trim().split(/[\s/]/u)[0]?.toLowerCase()
  return ['npm', 'pnpm', 'yarn', 'bun'].includes(name) ? name : undefined
}

/** 根据已发布包所在目录推断全局安装器。 */
function packageManagerFromInstallPath(directory) {
  const normalized = directory.replaceAll('\\', '/').toLowerCase()
  if (normalized.includes('/.bun/install/global/')) return 'bun'
  if (normalized.includes('/yarn/global/') || normalized.includes('/.config/yarn/global/')) return 'yarn'
  if (normalized.includes('/pnpm/global/') || normalized.includes('/pnpm-global/')) return 'pnpm'
  if (normalized.includes('/lib/node_modules/') || /^[a-z]:\/[^/]*node_modules\//u.test(normalized)) return 'npm'
  return undefined
}

const packageManager = packageManagerFromUserAgent(process.env.npm_config_user_agent)
  ?? packageManagerFromInstallPath(packageDirectory)
const explicitlyGlobal = process.env.npm_config_global === 'true'

// Workspace 或项目依赖安装不得启动本地服务。
if (!packageManager || (!explicitlyGlobal && !packageManagerFromInstallPath(packageDirectory))) process.exit(0)

/** 持久化安装器，供 askx uninstall 选择对应包管理器。 */
async function writeInstallRecord() {
  const dataDirectory = process.env.ASKX_DATA_DIR ?? join(homedir(), '.askx')
  const target = join(dataDirectory, 'install.json')
  const temporary = `${target}.${process.pid}.tmp`
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 })
  await writeFile(temporary, `${JSON.stringify({
    schema: 1,
    packageManager,
    packageDirectory,
    installedAt: new Date().toISOString(),
  }, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, target)
}

await writeInstallRecord()

const cliEntry = resolve(scriptDirectory, 'index.js')
const child = spawn(process.execPath, [cliEntry, 'ui', 'start', '--json'], {
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
})

child.once('exit', (code) => process.exit(code ?? 1))
