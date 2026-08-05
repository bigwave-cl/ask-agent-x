import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { configSchema, defaultConfig, settingsPatchSchema, type AskXConfig, type SettingsPatch } from './config.js'
import { stableHash } from './hash.js'
import { assertConsent, createActionPlan } from './plans.js'
import type { ActionPlan, UserConsent } from './types.js'

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

/** 重置共享设置计划的输入。 */
export interface SettingsResetInput {
  /** 创建计划时读取到的配置版本。 */
  expectedRevision: number
}

/** 恢复全部共享设置默认值的不可变计划。 */
export type SettingsResetPlan = ActionPlan<SettingsResetInput>

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

  /**
   * 创建恢复全部共享设置默认值的计划。
   * @returns 包含当前配置指纹与目标文件的不可变计划。
   */
  async createResetPlan(): Promise<SettingsResetPlan> {
    const current = await this.read()
    return createActionPlan({
      moduleId: 'settings',
      action: 'reset',
      detectionFingerprint: stableHash(current),
      operations: [{ kind: 'replace', target: this.path }],
      input: { expectedRevision: current.revision },
    })
  }

  /**
   * 在校验计划、授权和配置版本后恢复默认设置。
   * @param plan 已展示给用户的重置计划。
   * @param consent 对计划哈希的明确授权。
   * @param source 发起重置的客户端。
   * @returns 写入并复核后的共享设置。
   */
  async applyResetPlan(plan: SettingsResetPlan, consent: UserConsent, source: 'cli' | 'web'): Promise<AskXConfig> {
    assertConsent(plan, consent)
    if (plan.moduleId !== 'settings' || plan.action !== 'reset' || plan.operations.length !== 1 || plan.operations[0]?.target !== this.path) {
      throw new Error('Invalid settings reset plan')
    }
    const current = await this.read()
    if (current.revision !== plan.input.expectedRevision || stableHash(current) !== plan.detectionFingerprint) {
      throw new SettingsConflictError(current)
    }
    const defaults = defaultConfig()
    const updated = await this.update({
      locale: defaults.locale,
      themeColor: defaults.themeColor,
      skills: defaults.skills,
    }, { source, expectedRevision: current.revision })
    if (updated.locale !== defaults.locale || updated.themeColor !== defaults.themeColor
      || updated.skills.backupBeforeLink !== defaults.skills.backupBeforeLink
      || updated.skills.platforms.join(',') !== defaults.skills.platforms.join(',')) {
      throw new Error('Settings reset verification failed')
    }
    return updated
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
