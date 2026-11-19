import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '@askx/core'
import { createFeishuBridgeModule } from './bridge-module.js'
import { BridgeServiceManager, type BridgeServiceStatus } from './service-manager.js'
import { BridgeStateStore } from './state.js'

describe('Feishu bridge module', () => {
  it('keeps module planning and service status independent from Skills', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'askx-bridge-module-'))
    const config = defaultConfig()
    config.bridge.paths.stateDir = directory
    config.bridge.workTime.mode = 'always'
    const service = new BridgeServiceManager({ read: async () => config }, new BridgeStateStore(directory), join(directory, 'missing-runtime.mjs'))
    const module = createFeishuBridgeModule(service)

    const plan = await module.plan('status', {})
    const receipt = await module.apply(plan, { planHash: plan.hash, confirmedAt: new Date().toISOString() })

    expect(plan.moduleId).toBe('feishu-bridge')
    expect(receipt.contentHash).toBeTypeOf('string')
    expect((await module.detect({ homeDir: directory, dataDir: directory })).data as BridgeServiceStatus).toMatchObject({ runtimeStatus: 'stopped' })
  })
})
