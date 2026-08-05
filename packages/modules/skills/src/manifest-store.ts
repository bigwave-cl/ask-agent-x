import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  managedCustomLinkBindingSchema,
  managedPlatformBindingSchema,
  managedSkillRecordSchema,
  skillCustomScanRootSchema,
  skillPlatformIdSchema,
  skillsManifestSchema,
  type SkillsManifest,
} from './skill-types.js'

const LOCK_MAX_AGE_MS = 30_000
const LOCK_RETRY_MS = 40
const LOCK_RETRIES = 75

/** 旧版逐 Skill 软链 Manifest，仅用于只读升级。 */
const legacySkillsManifestSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  initializedAt: z.string().datetime(),
  lastScan: z.object({
    scannedAt: z.string().datetime(),
    fingerprint: z.string().min(1),
    platforms: z.array(skillPlatformIdSchema).min(1),
  }),
  skills: z.array(managedSkillRecordSchema.extend({
    bindings: z.array(z.object({
      platform: skillPlatformIdSchema,
      path: z.string().min(1),
      target: z.string().min(1),
    })),
  })),
})

/** v2 根目录软链 Manifest，仅用于只读升级。 */
const versionTwoSkillsManifestSchema = z.object({
  version: z.literal(2),
  revision: z.number().int().nonnegative(),
  initializedAt: z.string().datetime(),
  lastScan: z.object({
    scannedAt: z.string().datetime(),
    fingerprint: z.string().min(1),
    platforms: z.array(skillPlatformIdSchema).min(1),
  }),
  skills: z.array(managedSkillRecordSchema),
  customRoots: z.array(skillCustomScanRootSchema).default([]),
  platformBindings: z.array(managedPlatformBindingSchema),
  customLinkBindings: z.array(managedCustomLinkBindingSchema).default([]),
  migrationRequired: z.boolean().optional(),
})

/** manifest revision 不匹配错误。 */
export class SkillsManifestConflictError extends Error {
  /**
   * 创建并发冲突错误。
   * @param current 当前 manifest。
   */
  constructor(readonly current: SkillsManifest | null) {
    super(`Skills manifest changed at revision ${current?.revision ?? 0}`)
    this.name = 'SkillsManifestConflictError'
  }
}

/** Skills manifest 的原子存储。 */
export class SkillsManifestStore {
  /** manifest 文件路径。 */
  readonly path: string
  /** 写入锁路径。 */
  readonly #lockPath: string

  /**
   * 创建 manifest 存储。
   * @param dataDir AskX 数据目录。
   */
  constructor(readonly dataDir: string) {
    this.path = join(dataDir, 'skills-manifest.json')
    this.#lockPath = join(dataDir, 'skills-manifest.lock')
  }

  /** 读取 manifest，不存在时返回 null。 */
  async read(): Promise<SkillsManifest | null> {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      const current = skillsManifestSchema.safeParse(value)
      if (current.success) return current.data
      const versionTwo = versionTwoSkillsManifestSchema.safeParse(value)
      if (versionTwo.success) {
        return {
          ...versionTwo.data,
          version: 3,
          localSkills: [],
        }
      }
      const legacy = legacySkillsManifestSchema.parse(value)
      return {
        version: 3,
        revision: legacy.revision,
        initializedAt: legacy.initializedAt,
        lastScan: legacy.lastScan,
        skills: legacy.skills.map(({ bindings: _bindings, ...skill }) => skill),
        localSkills: [],
        customRoots: [],
        platformBindings: [],
        customLinkBindings: [],
        migrationRequired: true,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  /**
   * 以 revision 校验和原子替换方式写入 manifest。
   * @param next 要保存的完整 manifest。
   * @param expectedRevision 调用方基于的版本。
   * @returns 校验后的新 manifest。
   */
  async write(next: SkillsManifest, expectedRevision: number): Promise<SkillsManifest> {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 })
    const release = await this.#acquireLock()
    try {
      const current = await this.read()
      if ((current?.revision ?? 0) !== expectedRevision) throw new SkillsManifestConflictError(current)
      const parsed = skillsManifestSchema.parse({
        ...next,
        version: 3,
        localSkills: next.localSkills ?? [],
        revision: expectedRevision + 1,
      })
      const temporaryPath = `${this.path}.${randomUUID()}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.path)
      return parsed
    } finally {
      await release()
    }
  }

  /**
   * 删除 AskX 自己创建的 manifest，用于回滚首次初始化。
   * @param expectedRevision 调用方基于的当前版本。
   */
  async remove(expectedRevision: number): Promise<void> {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 })
    const release = await this.#acquireLock()
    try {
      const current = await this.read()
      if ((current?.revision ?? 0) !== expectedRevision) throw new SkillsManifestConflictError(current)
      if (current) await unlink(this.path)
    } finally {
      await release()
    }
  }

  /** 获取 manifest 独占写锁。 */
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
    throw new Error('等待 Skills manifest 写入锁超时。')
  }
}
