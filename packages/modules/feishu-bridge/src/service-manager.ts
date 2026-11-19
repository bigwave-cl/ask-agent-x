import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn, type ChildProcess, execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AskXConfig, BridgeConfig } from '@askx/core'
import { resolveFeishuCredentials } from '@askx/core/bridge-credentials'
import { BridgeStateStore, type BridgeStateRecord } from './state.js'
import { getWorkTimeStatus } from './work-time.js'

/** 对外暴露的桥接服务状态。 */
export interface BridgeServiceStatus extends BridgeStateRecord {
  /** 当前模块配置 revision。 */
  configRevision: number
  /** 当前工作时间是否允许运行。 */
  insideWindow: boolean
  /** 当前服务健康状态。 */
  healthy: boolean
}

/** 配置读写能力，避免 service manager 依赖 CLI 或 Web。 */
export interface BridgeConfigStore {
  read(): Promise<AskXConfig>
}

/** 负责 bridge runtime 启停、更新和调度的唯一 owner。 */
export class BridgeServiceManager {
  private child: ChildProcess | null = null
  private operation: Promise<unknown> = Promise.resolve()
  private readonly stoppingChildren = new WeakSet<ChildProcess>()
  private scheduleTimer: NodeJS.Timeout | null = null
  private readonly providedState: BridgeStateStore | undefined
  private stateStore: BridgeStateStore | null

  constructor(private readonly configStore: BridgeConfigStore, state?: BridgeStateStore, private readonly runtimeEntryPath = fileURLToPath(new URL('./runtime-entry.js', import.meta.url))) {
    this.providedState = state
    this.stateStore = state ?? null
  }

  /** 返回当前服务状态，不修改配置或 runtime。 */
  async status(): Promise<BridgeServiceStatus> {
    const config = await this.configStore.read()
    const stateStore = this.stateFor(config)
    const state = await stateStore.load()
    const schedule = getWorkTimeStatus(config.bridge.workTime)
    this.scheduleNextTransition(schedule.nextTransitionAt)
    const running = this.child?.exitCode === null && this.child?.pid !== undefined || await this.isManagedProcessRunning(state.pid)
    const runtimeStatus = running
      ? 'running'
      : state.runtimeStatus === 'starting' || state.runtimeStatus === 'stopping' || state.runtimeStatus === 'updating'
        ? state.runtimeStatus
        : state.desiredState === 'disabled'
          ? 'stopped'
          : state.runtimeStatus === 'failed'
            ? 'failed'
            : !schedule.insideWindow
              ? 'scheduled_off'
              : 'stopped'
    return { ...state, runtimeStatus, configRevision: config.revision, insideWindow: schedule.insideWindow, healthy: runtimeStatus === 'running' || runtimeStatus === 'scheduled_off' || runtimeStatus === 'stopped' }
  }

  /** 启用并按工作时间启动 runtime。 */
  async start(expectedRevision?: number): Promise<BridgeServiceStatus> {
    return this.enqueue(async () => {
      const config = await this.configStore.read()
      if (expectedRevision !== undefined && config.revision !== expectedRevision) throw new Error(`Settings changed at revision ${config.revision}`)
      const state = this.stateFor(config)
      await state.update({ desiredState: 'enabled', operationId: randomUUID(), lastError: null })
      const schedule = getWorkTimeStatus(config.bridge.workTime)
      if (!schedule.insideWindow) {
        await state.update({ runtimeStatus: 'scheduled_off', pid: null, nextTransitionAt: schedule.nextTransitionAt })
        return this.status()
      }
      try {
        await this.spawnRuntime(config.bridge)
      } catch (error) {
        await state.update({ runtimeStatus: 'failed', pid: null, lastError: error instanceof Error ? error.message : String(error) })
        throw error
      }
      return this.status()
    })
  }

  /** 禁用并停止 runtime。 */
  async stop(expectedRevision?: number): Promise<BridgeServiceStatus> {
    return this.enqueue(async () => {
      const config = await this.configStore.read()
      if (expectedRevision !== undefined && config.revision !== expectedRevision) throw new Error(`Settings changed at revision ${config.revision}`)
      const state = this.stateFor(config)
      await state.update({ desiredState: 'disabled', runtimeStatus: 'stopping', operationId: randomUUID() })
      await this.stopRuntime(config.bridge.service.gracefulStopMs)
      this.clearSchedule()
      await state.update({ runtimeStatus: 'stopped', pid: null, nextTransitionAt: null })
      return this.status()
    })
  }

  /** 重新启动当前 desiredState 对应的 runtime。 */
  async restart(expectedRevision?: number): Promise<BridgeServiceStatus> {
    return this.enqueue(async () => {
      const config = await this.configStore.read()
      const state = this.stateFor(config)
      const before = await state.load()
      if (expectedRevision !== undefined && config.revision !== expectedRevision) throw new Error(`Settings changed at revision ${config.revision}`)
      await state.update({ runtimeStatus: 'stopping', operationId: randomUUID() })
      try {
        await this.stopRuntime(config.bridge.service.gracefulStopMs)
        if (before.desiredState !== 'disabled') {
          await state.update({ desiredState: 'enabled' })
          const schedule = getWorkTimeStatus(config.bridge.workTime)
          if (schedule.insideWindow) await this.spawnRuntime(config.bridge)
          else await state.update({ runtimeStatus: 'scheduled_off', nextTransitionAt: schedule.nextTransitionAt })
        } else {
          await state.update({ runtimeStatus: 'stopped', pid: null })
        }
        return this.status()
      } catch (error) {
        await state.update({ runtimeStatus: 'failed', pid: null, lastError: error instanceof Error ? error.message : String(error) })
        throw error
      }
    })
  }

  /** 更新受管配置并在必要时恢复 runtime。 */
  async update(expectedRevision?: number): Promise<BridgeServiceStatus> {
    return this.enqueue(async () => {
      const config = await this.configStore.read()
      if (expectedRevision !== undefined && config.revision !== expectedRevision) throw new Error(`Settings changed at revision ${config.revision}`)
      const state = this.stateFor(config)
      const snapshot = await state.load()
      const operationId = randomUUID()
      await state.update({ runtimeStatus: 'updating', operationId })
      try {
        await this.stopRuntime(config.bridge.service.gracefulStopMs)
        await this.writeLaunchAgent(config.bridge)
        if (snapshot.desiredState === 'enabled') {
          const schedule = getWorkTimeStatus(config.bridge.workTime)
          if (schedule.insideWindow) await this.spawnRuntime(config.bridge)
          else await state.update({ runtimeStatus: 'scheduled_off', nextTransitionAt: schedule.nextTransitionAt })
        } else {
          await state.update({ runtimeStatus: 'stopped', pid: null })
        }
        return this.status()
      } catch (error) {
        await state.update({ ...snapshot, runtimeStatus: 'failed', lastError: error instanceof Error ? error.message : String(error) })
        throw error
      }
    })
  }

  /** 根据当前工作时间自动切换 runtime。 */
  async reconcile(): Promise<BridgeServiceStatus> {
    const config = await this.configStore.read()
    const stateStore = this.stateFor(config)
    const state = await stateStore.load()
    const schedule = getWorkTimeStatus(config.bridge.workTime)
    const running = this.child?.exitCode === null && this.child?.pid !== undefined || await this.isManagedProcessRunning(state.pid)
    if (state.desiredState === 'enabled' && schedule.insideWindow && !running) return this.start(config.revision)
    if (state.desiredState === 'enabled' && !schedule.insideWindow && running) return this.stopRuntime(config.bridge.service.gracefulStopMs).then(() => this.status())
    await stateStore.update({ nextTransitionAt: schedule.nextTransitionAt, runtimeStatus: state.desiredState === 'enabled' && !schedule.insideWindow ? 'scheduled_off' : state.runtimeStatus })
    return this.status()
  }

  /** 按下一次工作时间边界安排调度校准，不阻止 CLI 进程退出。 */
  private scheduleNextTransition(nextTransitionAt: string | null): void {
    this.clearSchedule()
    if (!nextTransitionAt) return
    const delay = Math.max(250, new Date(nextTransitionAt).getTime() - Date.now())
    this.scheduleTimer = setTimeout(() => {
      this.scheduleTimer = null
      void this.reconcile().catch(async (error) => {
        const config = await this.configStore.read()
        await this.stateFor(config).update({ runtimeStatus: 'failed', lastError: error instanceof Error ? error.message : String(error) })
      })
    }, delay)
    this.scheduleTimer.unref()
  }

  /** 清除当前调度计时器。 */
  private clearSchedule(): void {
    if (!this.scheduleTimer) return
    clearTimeout(this.scheduleTimer)
    this.scheduleTimer = null
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.operation.then(task, task)
    this.operation = next.then(() => undefined, () => undefined)
    return next
  }

  private async spawnRuntime(config: BridgeConfig): Promise<void> {
    if (this.child && this.child.exitCode === null) return
    const existing = await this.stateFor({ bridge: config }).load()
    if (await this.isManagedProcessRunning(existing.pid)) return
    await resolveFeishuCredentials(config.feishu)
    const runtimeEntry = this.runtimeEntryPath
    await access(runtimeEntry)
    await mkdir(config.paths.stateDir, { recursive: true, mode: 0o700 })
    const logPath = join(config.paths.stateDir, 'bridge.log')
    const logHandle = await import('node:fs/promises').then(({ open }) => open(logPath, 'a', 0o600))
    const runtimeConfigPath = await this.writeRuntimeConfig(config)
    const spawnedChild = spawn(process.execPath, [runtimeEntry], {
      cwd: dirname(runtimeEntry),
      detached: false,
      env: {
        ...process.env,
        ASKX_FEISHU_BRIDGE_CONFIG: runtimeConfigPath,
      },
      stdio: ['ignore', logHandle.fd, logHandle.fd],
    })
    await logHandle.close()
    this.child = spawnedChild
    const pid = spawnedChild.pid ?? null
    const state = this.stateFor({ bridge: config })
    await state.update({ runtimeStatus: 'running', pid, lastError: null })
    spawnedChild.once('exit', (code, signal) => {
      if (this.stoppingChildren.has(spawnedChild)) {
        if (this.child === spawnedChild) this.child = null
        return
      }
      void state.update({ runtimeStatus: code === 0 ? 'stopped' : 'failed', pid: null, lastError: code === 0 ? null : `runtime exited (${code ?? signal ?? 'unknown'})` })
      if (this.child === spawnedChild) this.child = null
    })
  }

  private async stopRuntime(gracefulStopMs: number): Promise<void> {
    const child = this.child
    if (!child || child.exitCode !== null) {
      const config = await this.configStore.read()
      const state = await this.stateFor(config).load()
      if (await this.isManagedProcessRunning(state.pid)) await this.stopExternalProcess(state.pid, gracefulStopMs)
      this.child = null
      return
    }
    this.stoppingChildren.add(child)
    child.kill('SIGTERM')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, gracefulStopMs)
      child.once('exit', () => { clearTimeout(timer); resolve() })
      child.once('error', reject)
    })
    this.child = null
  }

  /** 判断状态文件记录的 PID 是否仍对应当前桥接 runtime。 */
  private async isManagedProcessRunning(pid: number | null): Promise<boolean> {
    if (!pid || pid === process.pid) return false
    try {
      const command = await new Promise<string>((resolve, reject) => {
        execFile('ps', ['-p', String(pid), '-o', 'command='], (error, stdout) => error ? reject(error) : resolve(stdout.trim()))
      })
      return command.includes(this.runtimeEntryPath) || command.includes('feishu-bridge')
    }
    catch {
      return false
    }
  }

  /** 停止由另一个 CLI/Web 进程启动的桥接 runtime。 */
  private async stopExternalProcess(pid: number | null, gracefulStopMs: number): Promise<void> {
    if (!pid || !await this.isManagedProcessRunning(pid)) return
    try { process.kill(pid, 'SIGTERM') } catch { return }
    await new Promise<void>(resolve => {
      let poll: NodeJS.Timeout | undefined
      const timer = setTimeout(() => {
        try { process.kill(pid, 'SIGKILL') } catch { /* 进程已经退出。 */ }
        if (poll) clearInterval(poll)
        resolve()
      }, gracefulStopMs)
      poll = setInterval(async () => {
        if (!await this.isManagedProcessRunning(pid)) {
          clearTimeout(timer)
          clearInterval(poll)
          resolve()
        }
      }, 250)
      poll.unref()
    })
  }

  private async writeLaunchAgent(config: BridgeConfig): Promise<void> {
    const directory = join(config.paths.stateDir, 'launch-agents')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    // 写入可被 launchd 读取的描述文件；不会在本地隐式执行 launchctl。
    const plistPath = join(directory, `${config.service.launchdLabel}.plist`)
    const escapedLabel = config.service.launchdLabel.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const escapedConfigPath = join(config.paths.stateDir, 'bridge-runtime.config.json').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const descriptor = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${escapedLabel}</string><key>ProgramArguments</key><array><string>${process.execPath}</string><string>${this.runtimeEntryPath}</string></array><key>EnvironmentVariables</key><dict><key>ASKX_FEISHU_BRIDGE_CONFIG</key><string>${escapedConfigPath}</string></dict><key>RunAtLoad</key><false/></dict></plist>\n`
    await writeFile(plistPath, descriptor, { mode: 0o600 })
    await readFile(plistPath, 'utf8')
  }

  /** 为受管 runtime 生成不包含凭据的标准配置文件。 */
  private async writeRuntimeConfig(config: BridgeConfig): Promise<string> {
    const runtimeConfigPath = join(config.paths.stateDir, 'bridge-runtime.config.json')
    const runtimeConfig = {
      feishu: config.feishu,
      stateDir: config.paths.stateDir,
      codexBinary: config.paths.codexBinary,
      pollIntervalMs: 5_000,
    }
    await writeFile(runtimeConfigPath, `${JSON.stringify(runtimeConfig, null, 2)}\n`, { mode: 0o600 })
    return runtimeConfigPath
  }

  /** 根据当前配置选择状态目录；显式注入的测试状态存储优先。 */
  private stateFor(config: Pick<AskXConfig, 'bridge'>): BridgeStateStore {
    if (this.providedState) return this.providedState
    if (!this.stateStore || this.stateStore.directory !== config.bridge.paths.stateDir) {
      this.stateStore = new BridgeStateStore(config.bridge.paths.stateDir)
    }
    return this.stateStore
  }
}
