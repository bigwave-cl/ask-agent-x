import type { BridgeConversationItem, BridgeConversationItemKind, BridgeConversationSource, BridgeConversationStatus } from './conversation-contract.js'

/** 仅识别旧桥接生成的完整首行，普通方括号内容不参与清理。 */
const legacyPrefix = /^\[本轮来源 \/ Turn source: Feishu group ([^;\r\n]+); message ([^;\r\n]+); sender ([^;\r\n]+); project ([^\r\n]*?)\. Reply only to this source\.\]\r?\n/u

/** 读取协议对象，拒绝数组及空值。 */
export function conversationRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** 剥离已知旧来源前缀；用于历史用户正文及其标题预览。 */
export function normalizeLegacyContent(content: string): string {
  return content.replace(legacyPrefix, '')
}

/** 统一协议状态，缺少状态的历史 item 视为已完成。 */
export function normalizeConversationStatus(value: unknown): BridgeConversationStatus {
  if (value === 'inProgress' || value === 'in_progress' || value === 'running') return 'inProgress'
  if (value === 'failed' || value === 'declined' || value === 'error') return 'failed'
  if (value === 'interrupted' || value === 'cancelled' || value === 'aborted') return 'interrupted'
  return 'completed'
}

/** 读取公开文本块，不输出任意协议对象或隐藏推理内容。 */
function publicText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(part => typeof part === 'string' ? part : typeof conversationRecord(part).text === 'string' ? String(conversationRecord(part).text) : '').filter(Boolean).join('\n')
  return ''
}

/** 将协议 item 一次归一化为历史和实时共用的可展示结构。 */
export function normalizeConversationItem(value: unknown, turnId: string | null = null): BridgeConversationItem | null {
  /** 包装层和 item 的标准入口。 */
  const entry = conversationRecord(value)
  const item = entry.item ? { ...conversationRecord(entry.item), turnId: entry.turnId ?? turnId } : entry
  const id = typeof item.id === 'string' ? item.id : typeof item.itemId === 'string' ? item.itemId : ''
  if (!id) return null
  /** 只映射已知类型，未知类型保留独立身份。 */
  const type = String(item.type ?? item.role ?? '')
  const kinds: Record<string, BridgeConversationItemKind> = {
    userMessage: 'message', agentMessage: 'message', user: 'message', assistant: 'message', system: 'message',
    reasoning: 'reasoning', plan: 'plan', commandExecution: 'command', fileChange: 'fileChange',
    mcpToolCall: 'tool', dynamicToolCall: 'tool', collabAgentToolCall: 'tool', subAgentActivity: 'tool', webSearch: 'tool', imageView: 'tool', imageGeneration: 'tool',
  }
  const kind = kinds[type] ?? 'unknown'
  const role: BridgeConversationItem['role'] = type === 'userMessage' || type === 'user' ? 'user' : type === 'system' ? 'system' : ['command', 'fileChange', 'tool'].includes(kind) ? 'tool' : kind === 'unknown' ? 'unknown' : 'assistant'
  /** reasoning 仅消费 summary；content 可能为未公开的原始分析。 */
  const rawContent = kind === 'reasoning' ? publicText(item.summary) : publicText(item.text ?? item.content ?? item.aggregatedOutput ?? item.explanation)
  const legacy = role === 'user' ? rawContent.match(legacyPrefix) : null
  const source: BridgeConversationSource | undefined = legacy ? { channel: 'feishu', chatId: legacy[1]!, messageId: legacy[2]!, senderId: legacy[3]!, projectPath: legacy[4]! } : undefined
  const content = (role === 'user' ? normalizeLegacyContent(rawContent) : rawContent).slice(0, 262144)
  /** 空用户图片消息保留身份，助手的 item/started 也允许正文暂时为空。 */
  const createdAt = typeof item.createdAt === 'number' ? new Date(item.createdAt * 1000) : typeof item.createdAt === 'string' ? new Date(item.createdAt) : null
  const clientMessageId = typeof item.clientId === 'string' ? item.clientId : typeof item.clientMessageId === 'string' ? item.clientMessageId : undefined
  const changes = Array.isArray(item.changes) ? item.changes : []
  return {
    id, turnId: typeof item.turnId === 'string' ? item.turnId : turnId, role, kind, content,
    status: normalizeConversationStatus(item.status), createdAt: createdAt && Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : null,
    ...(source ? { source } : {}), ...(clientMessageId ? { clientMessageId } : {}),
    ...(typeof item.phase === 'string' ? { phase: item.phase } : {}),
    ...(kind === 'plan' && Array.isArray(item.plan) ? { plan: item.plan.map(value => {
      const step = conversationRecord(value)
      return { step: String(step.step ?? ''), status: step.status === 'completed' ? 'completed' as const : step.status === 'inProgress' ? 'inProgress' as const : 'pending' as const }
    }) } : {}),
    ...(['command', 'tool', 'fileChange', 'unknown'].includes(kind) ? { tool: {
      name: typeof item.tool === 'string' ? item.tool : type,
      ...(typeof item.command === 'string' ? { command: item.command } : {}),
      ...(typeof item.aggregatedOutput === 'string' ? { output: item.aggregatedOutput.slice(0, 262144) } : {}),
      ...(typeof item.query === 'string' ? { output: item.query } : {}),
      ...(kind === 'fileChange' ? { files: changes.map(change => conversationRecord(change).path).filter((path): path is string => typeof path === 'string') } : {}),
      exitCode: typeof item.exitCode === 'number' ? item.exitCode : null,
    } } : {}),
  }
}
