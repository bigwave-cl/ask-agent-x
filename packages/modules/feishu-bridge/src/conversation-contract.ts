/** 桥接消息的发送渠道。 */
export type BridgeConversationChannel = 'feishu' | 'web'

/** 一条用户消息的来源；身份属于消息，不属于整个会话。 */
export interface BridgeConversationSource {
  /** 发送渠道。 */
  channel: BridgeConversationChannel
  /** 来源群标识。 */
  chatId?: string
  /** 来源群显示名称。 */
  chatName?: string
  /** 渠道原始消息标识。 */
  messageId?: string
  /** 发送者在渠道中的标识。 */
  senderId?: string
  /** 发送者显示名称。 */
  senderName?: string
  /** 已校验的发送者头像地址。 */
  avatarUrl?: string
  /** 本轮锁定的项目目录。 */
  projectPath?: string
  /** 渠道消息的 ISO 时间。 */
  createdAt?: string
}

/** 消息项和执行轮次的公开生命周期。 */
export type BridgeConversationStatus = 'inProgress' | 'completed' | 'failed' | 'interrupted'

/** 页面支持的标准消息类型。 */
export type BridgeConversationItemKind = 'message' | 'reasoning' | 'plan' | 'command' | 'fileChange' | 'tool' | 'unknown'

/** 执行计划的一步。 */
export interface BridgeConversationPlanStep {
  /** 步骤说明。 */
  step: string
  /** 当前步骤状态。 */
  status: 'pending' | 'inProgress' | 'completed'
}

/** 工具的可展示执行结果，不包含协议原始对象。 */
export interface BridgeConversationTool {
  /** 工具名称。 */
  name: string
  /** 已公开的执行命令。 */
  command?: string
  /** 工具公开输出。 */
  output?: string
  /** 已结束命令的退出码。 */
  exitCode?: number | null
  /** 本次修改涉及的文件路径。 */
  files?: string[]
}

/** 历史和实时事件共用的消息完整快照。 */
export interface BridgeConversationItem {
  /** Codex item 标识；本地待确认消息使用 clientMessageId 派生标识。 */
  id: string
  /** 所属执行轮次；请求尚未接受时为空。 */
  turnId: string | null
  /** 消息角色。 */
  role: 'user' | 'assistant' | 'system' | 'tool' | 'unknown'
  /** 渲染类型。 */
  kind: BridgeConversationItemKind
  /** 正文或可公开的过程摘要。 */
  content: string
  /** 当前消息的生命周期。 */
  status: BridgeConversationStatus
  /** 消息的 ISO 创建时间。 */
  createdAt: string | null
  /** 关联客户端待确认消息的稳定标识。 */
  clientMessageId?: string
  /** 用户消息来源。 */
  source?: BridgeConversationSource
  /** 计划步骤。 */
  plan?: BridgeConversationPlanStep[]
  /** 工具执行信息。 */
  tool?: BridgeConversationTool
  /** 助手正文阶段。 */
  phase?: string
}

/** 一个执行轮次的状态，独立于 HTTP 请求和传输连接。 */
export interface BridgeConversationTurn {
  /** Codex turn 标识；尚未收到接受事件时为空。 */
  id: string | null
  /** 本地执行实例标识。 */
  runId: string
  /** 执行入口。 */
  channel: BridgeConversationChannel
  /** 当前轮次状态。 */
  status: BridgeConversationStatus
  /** 本轮更新时间。 */
  updatedAt: string
  /** 可安全展示的失败说明。 */
  error?: string
  /** 当前 Web 执行 owner 是否支持中断。 */
  canInterrupt?: boolean
}

/** 跨进程事件的身份和顺序信息。 */
export interface BridgeConversationEventBase {
  /** 事件契约版本。 */
  version: 1
  /** 规范化 CODEX_HOME 的隔离标识。 */
  namespace: string
  /** 来源会话；目录失效事件可为空字符串。 */
  threadId: string
  /** 单写入方的执行实例标识。 */
  runId: string
  /** 同一执行流内单调递增的序号。 */
  sequence: number
  /** 事件 ISO 时间。 */
  createdAt: string
}

/** 只传完整消息项，使重放可去重且不会二次拼接文本增量。 */
export type BridgeConversationEvent = BridgeConversationEventBase & (
  | { /** 消息项更新。 */ type: 'item.upsert'; /** 当前完整消息。 */ item: BridgeConversationItem }
  | { /** 轮次状态更新。 */ type: 'turn.status'; /** 当前轮次。 */ turn: BridgeConversationTurn }
  | { /** 名称更新。 */ type: 'thread.title'; /** 已保存的名称。 */ title: string }
  | { /** 会话目录需要重新读取。 */ type: 'catalog.changed' }
  | { /** 游标过期或命名空间改变，需要重新读取快照。 */ type: 'reset' }
)

/** 服务端历史读取的扩展字段，与 thread 摘要及分页字段一起返回。 */
export interface BridgeConversationSnapshot {
  /** 当前 CODEX_HOME 隔离标识。 */
  namespace: string
  /** 已对账的消息项。 */
  messages: BridgeConversationItem[]
  /** 最近执行状态，没有记录时为空。 */
  turn: BridgeConversationTurn | null
}
