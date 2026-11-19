import { ModuleRegistry } from '@askx/core'
import { BridgeRelationsStore } from '@askx/core/bridge-relations'
import { acquireBridgeThreadLock } from '@askx/core/bridge-thread-lock'
import { BridgeServiceManager } from '@askx/module-feishu-bridge/service-manager'
import { createFeishuBridgeModule } from '@askx/module-feishu-bridge'
import { BridgeProjectService } from '@askx/module-feishu-bridge/project-service'
import { BridgeCatalogActions } from '@askx/module-feishu-bridge/catalog-actions'
import { BridgeThreadSessionManager } from '@askx/module-feishu-bridge/thread-session'
import { settingsStore } from './settings.js'

/** Web 共享的桥接服务管理器实例。 */
export const bridgeServiceManager = new BridgeServiceManager(settingsStore)

/** Web 使用的独立 bridge module 实例。 */
export const bridgeModule = createFeishuBridgeModule(bridgeServiceManager)

/** Web 进程内的独立模块注册表，保持 bridge 与 Skills 并列。 */
export const bridgeModuleRegistry = new ModuleRegistry()
bridgeModuleRegistry.register(bridgeModule)

/** Web 聊天使用的桥接 thread 会话 owner。 */
export const bridgeThreadSessionManager = new BridgeThreadSessionManager(
    settingsStore,
    async () => {
        const status = await bridgeServiceManager.status()
        return status.runtimeStatus === 'running' && status.insideWindow
    },
)

/** Web 项目能力由 Codex API 提供，不使用本地 registry。 */
export const bridgeProjectService = new BridgeProjectService(bridgeThreadSessionManager)

/** 页面菜单的唯一写入入口，计划、授权和恢复均由模块执行。 */
export const bridgeCatalogActions = new BridgeCatalogActions({
    rpc: bridgeThreadSessionManager,
    projects: bridgeProjectService,
    canOperate: async () => {
        /** 执行前核验实际服务状态和工作时间。 */
        const status = await bridgeServiceManager.status()
        return status.runtimeStatus === 'running' && status.healthy && status.insideWindow
    },
    readRelations: async () => {
        /** 读取当前配置对应的关联目录，不缓存用户路径。 */
        const config = await settingsStore.read()
        return new BridgeRelationsStore(config.bridge.paths.stateDir).read()
    },
    acquireThreadLease: async threadId => {
        /** 与 Web 和飞书执行共用同一把会话锁。 */
        const config = await settingsStore.read()
        return acquireBridgeThreadLock(config.bridge.paths.stateDir, threadId, { timeoutMs: 10000 })
    },
    guardCatalogChange: async operation => {
        /** 与关系保存共用锁及版本，防止删除期间提交悬空关联。 */
        const config = await settingsStore.read()
        return new BridgeRelationsStore(config.bridge.paths.stateDir).guardCatalogChange(operation)
    },
})
