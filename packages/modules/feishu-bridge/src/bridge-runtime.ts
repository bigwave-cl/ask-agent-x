import { BridgeServiceManager } from './service-manager.js'
import { BridgeStateStore } from './state.js'

/** 桥接 runtime 对外的生命周期动作。 */
export type BridgeRuntimeAction = 'start' | 'stop' | 'restart' | 'status' | 'update'

/** 独立桥接模块的 runtime 门面，统一暴露服务动作。 */
export class BridgeRuntime {
  /** 服务状态持久化 owner。 */
  readonly state: BridgeStateStore
  /** 服务生命周期 owner。 */
  readonly service: BridgeServiceManager

  constructor(service: BridgeServiceManager, state: BridgeStateStore) {
    this.service = service
    this.state = state
  }

  /** 执行一个受管服务动作并返回操作 ID 与最终状态。 */
  async execute(action: BridgeRuntimeAction, expectedRevision?: number) {
    if (action === 'status') return { operationId: null, status: await this.service.status() }
    const status = action === 'start'
      ? await this.service.start(expectedRevision)
      : action === 'stop'
        ? await this.service.stop(expectedRevision)
        : action === 'restart'
          ? await this.service.restart(expectedRevision)
          : await this.service.update(expectedRevision)
    return { operationId: status.operationId, status }
  }
}
