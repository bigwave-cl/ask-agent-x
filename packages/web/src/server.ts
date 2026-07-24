import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultContext } from '@askx/core'

export interface UiServerOptions {
  port?: number
  host?: '127.0.0.1'
}

interface UiSessionRecord {
  token: string
  pid: number
  port: number
  createdAt: string
}

const sessionPath = join(defaultContext().dataDir, 'ui-session.json')

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

export async function readUiSessionToken(): Promise<string | null> {
  try {
    const session = JSON.parse(await readFile(sessionPath, 'utf8')) as UiSessionRecord
    if (!session.token || !Number.isInteger(session.pid)) return null
    try {
      process.kill(session.pid, 0)
      return session.token
    } catch {
      await clearSession(session.token)
      return null
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    return null
  }
}

export async function startUi(options: UiServerOptions = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 4242
  const token = randomBytes(24).toString('hex')
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const entry = join(currentDir, '..', '..', '.output', 'server', 'index.mjs')
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
      NITRO_HOST: host,
      NITRO_PORT: String(port),
      NUXT_ASKX_SESSION_TOKEN: token,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stderr?.pipe(process.stderr)

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
