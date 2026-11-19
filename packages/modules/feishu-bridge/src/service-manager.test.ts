import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@askx/core/bridge-credentials', () => ({ resolveFeishuCredentials: vi.fn(async () => ({ appId: 'test', appSecret: 'test-secret' })) }))
import { defaultConfig } from '@askx/core'
import { resolveFeishuCredentials } from '@askx/core/bridge-credentials'
import { BridgeServiceManager } from './service-manager.js'

/** 为每项测试创建隔离的配置、状态目录和 mock runtime。 */
async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'askx-bridge-'))
  const runtime = join(directory, 'runtime.mjs')
  await writeFile(runtime, 'setInterval(() => undefined, 60_000)\n')
  const config = defaultConfig()
  config.bridge.workTime.mode = 'always'
  config.bridge.paths.stateDir = directory
  const manager = new BridgeServiceManager({ read: async () => config }, undefined, runtime)
  return { directory, runtime, config, manager }
}

describe('BridgeServiceManager', () => {
  it('starts without saving the legacy enabled flag and stops idempotently', async () => {
    const { directory, config, manager } = await createFixture()
    const snapshot = structuredClone(config)
    try {
      expect(config.bridge).not.toHaveProperty('enabled')
      const started = await manager.start(config.revision)
      expect(started.runtimeStatus).toBe('running')
      expect(started.pid).toBeTypeOf('number')
      expect((await manager.start(config.revision)).pid).toBe(started.pid)
      expect(config).toEqual(snapshot)
      const stopped = await manager.stop(config.revision)
      expect(stopped.runtimeStatus).toBe('stopped')
      expect(stopped.pid).toBeNull()
      expect((await manager.stop()).runtimeStatus).toBe('stopped')
    } finally {
      await manager.stop()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects unavailable credentials before spawning without changing saved settings', async () => {
    const { directory, config, manager } = await createFixture()
    const before = structuredClone(config)
    vi.mocked(resolveFeishuCredentials).mockRejectedValueOnce(new Error('Credentials unavailable'))
    try {
      await expect(manager.start()).rejects.toThrow('Credentials unavailable')
      expect((await manager.status()).runtimeStatus).toBe('failed')
      expect((await manager.status()).pid).toBeNull()
      expect(config).toEqual(before)
    } finally {
      await manager.stop()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps an explicit start scheduled off outside saved working hours', async () => {
    const { directory, config, manager } = await createFixture()
    /** 选择距当前时间十二小时的窗口，避免测试依赖机器时区和执行时刻。 */
    const startHour = (new Date().getUTCHours() + 12) % 24
    config.bridge.workTime = {
      mode: 'windows', outsideWindow: 'stop-service',
      window: { start: `${String(startHour).padStart(2, '0')}:00`, end: `${String((startHour + 1) % 24).padStart(2, '0')}:00` },
    }
    try {
      const status = await manager.start(config.revision)
      expect(status.runtimeStatus).toBe('scheduled_off')
      expect(status.desiredState).toBe('enabled')
      expect(status.pid).toBeNull()
      expect(status.insideWindow).toBe(false)
    } finally {
      await manager.stop()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects stale revisions before changing service state', async () => {
    const { directory, config, manager } = await createFixture()
    try {
      const before = await manager.status()
      await expect(manager.start(config.revision + 1)).rejects.toThrow('Settings changed')
      expect(await manager.status()).toEqual(before)
    } finally {
      await manager.stop()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('exposes failed restart when the runtime entry disappears after startup', async () => {
    const { directory, runtime, manager } = await createFixture()
    try {
      const started = await manager.start()
      expect(started.runtimeStatus).toBe('running')
      await rm(runtime)
      await expect(manager.restart()).rejects.toThrow()
      const status = await manager.status()
      expect(status.runtimeStatus).toBe('failed')
      expect(status.healthy).toBe(false)
      expect(status.pid).toBeNull()
      expect(status.lastError).toBeTruthy()
    } finally {
      await manager.stop()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('exposes failed startup rather than reporting a stopped or running service', async () => {
    const { directory, runtime, manager } = await createFixture()
    try {
      await rm(runtime)
      await expect(manager.start()).rejects.toThrow()
      const status = await manager.status()
      expect(status.runtimeStatus).toBe('failed')
      expect(status.healthy).toBe(false)
      expect(status.pid).toBeNull()
      expect(status.lastError).toBeTruthy()
    } finally {
      await manager.stop()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
