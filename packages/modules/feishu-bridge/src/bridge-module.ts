import { assertConsent, createActionPlan, stableHash, type ActionPlan, type ActionReceipt, type AskXModule, type DetectionReport, type ModuleContext, type RollbackResult, type UserConsent } from '@askx/core'
import { BridgeServiceManager, type BridgeServiceStatus } from './service-manager.js'

/** Bridge module 的唯一 ID。 */
export const FEISHU_BRIDGE_MODULE_ID = 'feishu-bridge'

/** 桥接服务计划的输入。 */
export interface BridgeActionInput {
  /** 可选的配置版本保护。 */
  expectedRevision?: number
}

/** 创建独立的 Feishu-Codex 桥接模块。 */
export function createFeishuBridgeModule(serviceManager: BridgeServiceManager): AskXModule {
  return new FeishuBridgeModule(serviceManager)
}

/** Feishu-Codex 桥接模块的 detect/plan/apply/rollback 实现。 */
export class FeishuBridgeModule implements AskXModule {
  readonly id = FEISHU_BRIDGE_MODULE_ID
  readonly name = 'Feishu-Codex Bridge'

  constructor(private readonly serviceManager: BridgeServiceManager) {}

  async detect(_context: ModuleContext): Promise<DetectionReport<BridgeServiceStatus>> {
    const status = await this.serviceManager.status()
    return { moduleId: this.id, status: status.healthy ? 'ok' : 'warning', observedAt: new Date().toISOString(), fingerprint: stableHash(status), issues: status.lastError ? [{ code: 'bridge.runtime', message: status.lastError }] : [], data: status }
  }

  async plan(action: string, input: unknown): Promise<ActionPlan<BridgeActionInput>> {
    if (!['start', 'stop', 'restart', 'update', 'status'].includes(action)) throw new Error(`Unsupported bridge action: ${action}`)
    const detection = await this.detect(input as ModuleContext)
    return createActionPlan({ moduleId: this.id, action, detectionFingerprint: detection.fingerprint, operations: [], input: input as BridgeActionInput })
  }

  async apply(plan: ActionPlan<BridgeActionInput>, consent: UserConsent): Promise<ActionReceipt> {
    if (plan.moduleId !== this.id) throw new Error('Invalid bridge module plan')
    assertConsent(plan, consent)
    const expectedRevision = plan.input.expectedRevision
    const status = plan.action === 'start'
      ? await this.serviceManager.start(expectedRevision)
      : plan.action === 'stop'
        ? await this.serviceManager.stop(expectedRevision)
        : plan.action === 'restart'
          ? await this.serviceManager.restart(expectedRevision)
          : plan.action === 'update'
            ? await this.serviceManager.update(expectedRevision)
            : await this.serviceManager.status()
    return { id: plan.id, planHash: plan.hash, moduleId: this.id, action: plan.action, appliedAt: new Date().toISOString(), contentHash: stableHash(status) }
  }

  async rollback(receipt: ActionReceipt): Promise<RollbackResult> {
    if (receipt.moduleId !== this.id) throw new Error('Invalid bridge module receipt')
    return { receiptId: receipt.id, rolledBack: false, restoredPaths: [], warnings: ['Bridge runtime rollback is owned by service-manager operation snapshots.'] }
  }
}
