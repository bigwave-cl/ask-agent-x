import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultContext } from '@askx/core'
import { nanoid } from 'nanoid'
import { selectAvailableUiPort } from './ui-port.js'

export interface UiServerOptions {
  /** 指定监听端口；缺省时自动选择可用端口。 */
  port?: number
  /** 本地服务固定只允许监听回环地址。 */
  host?: '127.0.0.1'
  /** 是否让服务脱离当前终端并在后台持续运行。 */
  detached?: boolean
}

/** 当前本地 UI 后台进程的会话信息。 */
export interface UiSessionRecord {
  /** 用于建立本地浏览器会话的一次性凭证。 */
  token: string
  /** Nuxt 服务进程 ID。 */
  pid: number
  /** Nuxt 服务监听端口。 */
  port: number
  /** 服务启动时间。 */
  createdAt: string
}

const sessionPath = join(defaultContext().dataDir, 'ui-session.json')

/** 解析源码构建或 npm 包内的 Nuxt 生产入口。 */
async function resolveUiEntry(currentDir: string): Promise<string> {
  const candidates = [
    join(currentDir, 'web', '.output', 'server', 'index.mjs'),
    join(currentDir, '..', '..', '.output', 'server', 'index.mjs'),
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // 当前候选不存在时继续检查另一种运行目录布局。
    }
  }
  throw new Error('找不到 AskAgent X Web 生产入口，请重新构建或安装完整 npm 包。')
}

async function writeSession(record: UiSessionRecord): Promise<void> {
  await mkdir(dirname(sessionPath), { recursive: true, mode: 0o700 })
  await writeFile(sessionPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

async function clearSession(token: string): Promise<void> {
  try {
    const current = JSON.parse(await readFile(sessionPath, 'utf8')) as UiSessionRecord
    if (current.token === token) await unlink(sessionPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return
  }
}

/** @returns 仍在运行的本地 UI 会话，不存在时返回 null。 */
export async function readUiSession(): Promise<UiSessionRecord | null> {
  try {
    const session = JSON.parse(await readFile(sessionPath, 'utf8')) as UiSessionRecord
    if (!session.token || !Number.isInteger(session.pid) || !Number.isInteger(session.port)) return null
    try {
      process.kill(session.pid, 0)
      return session
    } catch {
      await clearSession(session.token)
      return null
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    return null
  }
}

/** @returns 当前活动 UI 的 token，不存在时返回 null。 */
export async function readUiSessionToken(): Promise<string | null> {
  return (await readUiSession())?.token ?? null
}

/**
 * 停止当前受管 UI 服务。
 * @returns 是否发现并停止了活动服务。
 */
export async function stopUi(): Promise<boolean> {
  const session = await readUiSession()
  if (!session) return false
  process.kill(session.pid, 'SIGTERM')
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      process.kill(session.pid, 0)
    } catch {
      await clearSession(session.token)
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out stopping the Nuxt UI process (${session.pid})`)
}

export async function startUi(options: UiServerOptions = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? await selectAvailableUiPort(host)
  const token = nanoid()
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const entry = await resolveUiEntry(currentDir)
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
      NITRO_HOST: host,
      NITRO_PORT: String(port),
      NUXT_ASKX_SESSION_TOKEN: token,
    },
    detached: options.detached ?? false,
    stdio: options.detached ? 'ignore' : ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  if (!options.detached) child.stderr?.pipe(process.stderr)

  const url = `http://${host}:${port}/?token=${token}`
  const healthUrl = `http://${host}:${port}/api/health?token=${token}`
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Nuxt UI exited before becoming ready (${child.exitCode})`)
    try {
      const response = await fetch(healthUrl)
      if (response.ok) break
    } catch {
      if (attempt === 99) {
        child.kill('SIGTERM')
        throw new Error('Timed out waiting for the Nuxt UI')
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  await writeSession({ token, pid: child.pid ?? process.pid, port, createdAt: new Date().toISOString() })
  child.once('exit', () => void clearSession(token))
  if (options.detached) child.unref()

  return {
    url,
    close: async () => {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await once(child, 'exit')
      await clearSession(token)
    },
  }
}
