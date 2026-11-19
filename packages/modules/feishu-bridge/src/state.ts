import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 桥接服务的可持久化状态。 */
export interface BridgeStateRecord {
  /** 状态 schema 版本。 */
  version: 1
  /** 用户期望的启停状态。 */
  desiredState: 'enabled' | 'disabled'
  /** runtime 当前状态。 */
  runtimeStatus: 'stopped' | 'starting' | 'running' | 'scheduled_off' | 'stopping' | 'updating' | 'failed'
  /** 当前 runtime PID。 */
  pid: number | null
  /** 最近一次服务操作。 */
  operationId: string | null
  /** 最近错误。 */
  lastError: string | null
  /** 下一次调度边界。 */
  nextTransitionAt: string | null
  /** 最近更新时间。 */
  updatedAt: string
}

/** 负责桥接 runtime 状态的唯一持久化 owner。 */
export class BridgeStateStore {
  readonly file: string
  private value: BridgeStateRecord
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(readonly directory: string) {
    this.file = join(directory, 'bridge-state.json')
    this.value = {
      version: 1,
      desiredState: 'disabled',
      runtimeStatus: 'stopped',
      pid: null,
      operationId: null,
      lastError: null,
      nextTransitionAt: null,
      updatedAt: new Date(0).toISOString(),
    }
  }

  /** 从磁盘读取并校验最小状态结构。 */
  async load(): Promise<BridgeStateRecord> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<BridgeStateRecord>
      if (parsed.version !== 1 || !parsed.desiredState || !parsed.runtimeStatus) throw new Error('Invalid bridge state')
      this.value = { ...this.value, ...parsed }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return this.value
  }

  /** 返回内存中的最新状态副本。 */
  get(): BridgeStateRecord { return { ...this.value } }

  /** 原子保存状态并返回新值。 */
  async update(patch: Partial<BridgeStateRecord>): Promise<BridgeStateRecord> {
    this.value = { ...this.value, ...patch, updatedAt: new Date().toISOString() }
    const snapshot = this.get()
    let resolveWrite: (() => void) | undefined
    const previousWrite = this.writeQueue
    this.writeQueue = new Promise<void>((resolve) => { resolveWrite = resolve })
    await previousWrite
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      const temporary = `${this.file}.${randomUUID()}.tmp`
      await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 })
      await rename(temporary, this.file)
    } finally {
      resolveWrite?.()
    }
    return this.get()
  }
}
