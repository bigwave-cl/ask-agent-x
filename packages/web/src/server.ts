import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface UiServerOptions {
  port?: number
  host?: '127.0.0.1'
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

  return {
    url,
    close: async () => {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await once(child, 'exit')
    },
  }
}
