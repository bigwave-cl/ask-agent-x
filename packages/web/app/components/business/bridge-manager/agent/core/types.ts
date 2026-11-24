import type { InjectionKey, Ref } from 'vue'
import type { BridgeConversationItem, BridgeConversationTurn } from '@askx/module-feishu-bridge/conversation-contract'

/** 群组与项目共同确定当前会话的导航上下文。 */
export interface BridgeAgentContext {
    /** 当前群组标识。 */
    chatId: string
    /** 当前项目的唯一目录。 */
    projectPath: string
}

/** 导航层向 Agent 提供身份和目录回调，不持有消息副本。 */
export interface BridgeAgentOptions {
    /** 当前线程标识，空值代表尚未提交的新会话。 */
    threadId: Readonly<Ref<string>>
    /** 当前群组与项目上下文。 */
    context: Readonly<Ref<BridgeAgentContext>>
    /** 当前绑定是否允许发送。 */
    canCompose: Readonly<Ref<boolean>>
    /** 发送和停止前执行既有服务预检。 */
    requireRunning: () => Promise<boolean>
    /** 将已创建线程交给目录 owner 接纳。 */
    onCreated: (thread: { id: string, title: string }) => void
    /** 通知目录 owner 重新读取目录。 */
    onCatalogChanged: () => void
    /** 将已确认标题提交给目录 owner。 */
    onTitle: (threadId: string, title: string) => void
}

/** 组件消费的历史 Hub；所有最终写入留在 Hub 内部。 */
export interface BridgeAgentHistory {
    /** 标准消息的只读有序快照。 */
    messages: Readonly<Ref<readonly BridgeConversationItem[]>>
    /** 当前轮次的服务端状态。 */
    turn: Readonly<Ref<BridgeConversationTurn | null>>
    /** 首屏历史是否正在加载。 */
    loading: Readonly<Ref<boolean>>
    /** 更早历史是否正在加载。 */
    loadingMore: Readonly<Ref<boolean>>
    /** 更早历史的分页游标。 */
    nextCursor: Readonly<Ref<string | null>>
    /** 读取历史；older 为 true 时请求更早一页。 */
    loadHistory: (older?: boolean) => Promise<void>
}

/** 右侧 Agent 组件树共享的唯一消费接口。 */
export interface BridgeAgentCore {
    /** 导航层持有的当前线程身份。 */
    threadId: Readonly<Ref<string>>
    /** 消息与分页的唯一领域入口。 */
    historyHub: BridgeAgentHistory
    /** 可继续编辑的输入草稿。 */
    draft: Ref<string>
    /** 请求是否正在提交，与执行中状态独立。 */
    submitting: Readonly<Ref<boolean>>
    /** 当前轮次是否仍在执行。 */
    running: Readonly<Ref<boolean>>
    /** 当前执行 owner 是否支持停止。 */
    canStop: Readonly<Ref<boolean>>
    /** 当前会话是否允许发送。 */
    canCompose: Readonly<Ref<boolean>>
    /** 实时连接状态，不代表轮次执行状态。 */
    connection: Readonly<Ref<'connecting' | 'connected' | 'reconnecting'>>
    /** 按当前上下文提交草稿。 */
    send: () => Promise<void>
    /** 请求停止当前轮次，最终状态由事件确认。 */
    interrupt: () => Promise<void>
}

/** 单页面 Agent 的注入键，禁止模块级共享可变会话实例。 */
export const bridgeAgentCoreKey: InjectionKey<BridgeAgentCore> = Symbol('BridgeAgentCore')

/** 消息异步内容或折叠完成后的布局通知。 */
export interface MessageRenderCompletePayload {
    /** 需要重新测量的标准消息标识。 */
    messageId: string
}
