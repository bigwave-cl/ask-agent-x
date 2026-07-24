import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { configSchema, defaultConfig, settingsPatchSchema, type AskXConfig, type SettingsPatch } from './config.js'

const LOCK_MAX_AGE_MS = 30_000
const LOCK_RETRY_MS = 40
const LOCK_RETRIES = 75

export class SettingsConflictError extends Error {
  constructor(readonly current: AskXConfig) {
    super(`Settings changed at revision ${current.revision}`)
    this.name = 'SettingsConflictError'
  }
}

export interface SettingsUpdateOptions {
  source: 'cli' | 'web'
  expectedRevision?: number
}

export class SettingsStore {
  readonly path: string
  readonly #lockPath: string

  constructor(readonly dataDir: string) {
    this.path = join(dataDir, 'config.json')
    this.#lockPath = join(dataDir, 'config.lock')
  }

  async read(): Promise<AskXConfig> {
    try {
      return configSchema.parse(JSON.parse(await readFile(this.path, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultConfig()
      throw error
    }
  }

  async update(patch: SettingsPatch, options: SettingsUpdateOptions): Promise<AskXConfig> {
    const parsedPatch = settingsPatchSchema.parse(patch)
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 })
    const release = await this.#acquireLock()
    try {
      const current = await this.read()
      if (options.expectedRevision !== undefined && options.expectedRevision !== current.revision) {
        throw new SettingsConflictError(current)
      }
      const next = configSchema.parse({
        ...current,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: options.source,
        locale: parsedPatch.locale ?? current.locale,
        themeColor: parsedPatch.themeColor ?? current.themeColor,
        skills: {
          ...current.skills,
          ...parsedPatch.skills,
        },
      })
      const temporaryPath = `${this.path}.${randomUUID()}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.path)
      return next
    } finally {
      await release()
    }
  }

  async #acquireLock(): Promise<() => Promise<void>> {
    for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
      try {
        const handle = await open(this.#lockPath, 'wx', 0o600)
        await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`)
        await handle.close()
        return async () => {
          try {
            await unlink(this.#lockPath)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        try {
          const lock = await stat(this.#lockPath)
          if (Date.now() - lock.mtimeMs > LOCK_MAX_AGE_MS) {
            await unlink(this.#lockPath)
            continue
          }
        } catch (lockError) {
          if ((lockError as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw lockError
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS))
      }
    }
    throw new Error('Timed out waiting for the AskAgent X settings lock')
  }
}
