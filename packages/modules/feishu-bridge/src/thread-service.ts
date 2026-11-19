import { bridgeThreadSourceKinds, isBridgeThreadSource } from '../runtime/codex_identity.mjs'
import { normalizeProjectPath } from './project-service.js'
/** Codex App Server 请求能力。 */
export interface BridgeRpcClient {
  /** 发起一次 JSON-RPC 请求。 */
  request(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>
}

/** 桥接界面展示的 thread 摘要。 */
export interface BridgeThreadSummary {
  /** Codex thread 标识。 */
  id: string
  /** 可展示标题。 */
  title: string
  /** thread 的实际工作目录。 */
  cwd: string | null
  /** Codex 项目标识。 */
  projectId: string | null
  /** Codex Git 元数据。 */
  gitInfo: Record<string, unknown> | null
  /** 最近更新时间。 */
  updatedAt: string | null
  /** 创建时间。 */
  createdAt: string | null
}

/** 桥接界面展示的一条会话消息。 */
export interface BridgeThreadMessage {
  /** 消息或 item 标识。 */
  id: string
  /** 消息角色。 */
  role: 'user' | 'assistant' | 'system' | 'tool' | 'unknown'
  /** Markdown 或纯文本内容。 */
  content: string
  /** 所属 turn 标识。 */
  turnId: string | null
  /** 创建时间。 */
  createdAt: string | null
}

/** thread 历史结果。 */
export interface BridgeThreadHistory {
  /** thread 摘要。 */
  thread: BridgeThreadSummary
  /** 已归一化的消息。 */
  messages: BridgeThreadMessage[]
  /** 下一页游标。 */
  nextCursor: string | null
}

/** thread 列表结果。 */
export interface BridgeThreadList {
  /** 已归一化的 thread。 */
  threads: BridgeThreadSummary[]
  /** 下一页游标。 */
  nextCursor: string | null
}

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' ? value as RecordValue : {}
}

function payload(value: unknown): RecordValue {
  const root = record(value)
  return record(root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data : root.result ?? value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function date(value: unknown): string | null {
  const parsed = typeof value === 'number' ? new Date(value * 1000) : typeof value === 'string' ? new Date(value) : null
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

function threadSummary(value: unknown): BridgeThreadSummary | null {
  const item = record(value)
  const id = text(item.id ?? item.threadId)
  if (!id) return null
  return {
    id,
    cwd: text(item.cwd) || null,
    projectId: text(item.projectId) || null,
    gitInfo: item.gitInfo && typeof item.gitInfo === 'object' ? record(item.gitInfo) : null,
    title: text(item.name ?? item.title ?? item.preview) || id,
    updatedAt: date(item.updatedAt ?? item.updated_at ?? item.lastUpdatedAt),
    createdAt: date(item.createdAt ?? item.created_at),
  }
}

function message(value: unknown, fallbackIndex: number): BridgeThreadMessage | null {
  const entry = record(value)
  const item = entry.item ? { ...record(entry.item), turnId: entry.turnId } : entry
  const id = text(item.id ?? item.itemId ?? item.messageId) || `item-${fallbackIndex}`
  const rawRole = text(item.role ?? item.authorRole ?? item.type)
  const role: BridgeThreadMessage['role'] = ['user', 'assistant', 'system', 'tool'].includes(rawRole)
    ? rawRole as BridgeThreadMessage['role']
    : rawRole === 'agentMessage' ? 'assistant' : rawRole === 'userMessage' ? 'user' : 'unknown'
  const content = Array.isArray(item.content) ? item.content.map(part => text(record(part).text)).filter(Boolean).join('\n') : text(item.text ?? item.content ?? item.message)
  return content ? { id, role, content, turnId: text(item.turnId) || null, createdAt: date(item.createdAt ?? item.created_at) } : null
}

/** 负责 Codex thread 协议调用与字段归一化的唯一 owner。 */
export class BridgeThreadService {
  constructor(private readonly client: BridgeRpcClient, private readonly cwd?: string, private readonly developerInstructions?: string, private readonly projectId?: string, private readonly beforeWrite?: () => Promise<void>) {}

  /** 按共享来源契约补齐一页项目会话，保持服务端游标连续。 */
  async listThreads(cursor?: string, limit = 50): Promise<BridgeThreadList> {
    /** 已通过来源和目录核验的当前页会话。 */
    const threads: BridgeThreadSummary[] = []
    /** 本次补页已经访问的游标，用于检测循环。 */
    const visited = new Set<string>()
    if (cursor) visited.add(cursor)
    /** 服务端返回的连续分页位置。 */
    let nextCursor: string | null = cursor ?? null
    /** 当前项目的规范化真实目录。 */
    const cwd = this.cwd ? await normalizeProjectPath(this.cwd) : undefined
    do {
      /** 本页仍需补齐的条数。 */
      const remaining = limit - threads.length
      /** 保持服务端限额的原始协议响应。 */
      const result = await this.client.request('thread/list', { cwd: this.cwd, cursor: nextCursor ?? undefined, limit: remaining, useStateDbOnly: true, modelProviders: [], sortKey: 'updated_at', sourceKinds: bridgeThreadSourceKinds })
      /** 去除历史包装后的协议内容。 */
      const body = payload(result)
      /** 等待共享来源契约核验的原始记录。 */
      const source = Array.isArray(body.threads) ? body.threads : Array.isArray(body.data) ? body.data : []
      /** 逐条在协议边界核验原始来源。 */
      for (const raw of source) {
        if (!isBridgeThreadSource(raw)) continue
        /** 已归一化的会话摘要。 */
        const item = threadSummary(raw)
        if (!item) continue
        if (cwd) {
          if (!item.cwd) continue
          try { if (await normalizeProjectPath(item.cwd) !== cwd) continue } catch { continue }
        }
        threads.push({ ...item, projectId: item.projectId ?? this.projectId ?? null })
      }
      nextCursor = text(body.nextCursor ?? body.next_cursor) || null
      if (nextCursor) {
        if (visited.has(nextCursor)) throw new Error('Codex returned a repeated thread cursor / Codex 返回了重复的会话分页游标')
        visited.add(nextCursor)
      }
    } while (threads.length < limit && nextCursor)
    return { threads, nextCursor }
  }

  /** 恢复一个 thread 到当前 Codex App Server 会话。 */
  async resumeThread(threadId: string): Promise<BridgeThreadSummary> {
    if (!threadId) throw new Error('Thread ID is required')
    await this.verifyThread(threadId)
    const result = await this.client.request('thread/resume', { threadId, excludeTurns: true, developerInstructions: this.developerInstructions })
    const thread = threadSummary(payload(result).thread ?? payload(result))
    if (!thread) throw new Error('Codex did not return a thread')
    return thread
  }

  /** 分页读取 thread 的 turn。 */
  async listTurns(threadId: string, cursor?: string, limit = 100): Promise<{ turns: RecordValue[]; nextCursor: string | null }> {
    if (!threadId) throw new Error('Thread ID is required')
    const result = await this.client.request('thread/turns/list', { threadId, cursor, limit })
    const body = payload(result)
    const turns = Array.isArray(body.turns) ? body.turns.filter((item): item is RecordValue => Boolean(item && typeof item === 'object')) : []
    return { turns, nextCursor: text(body.nextCursor ?? body.next_cursor) || null }
  }

  /** 分页读取 turn 中的消息 item。 */
  async listItems(threadId: string, turnId?: string, cursor?: string, limit = 100): Promise<{ items: BridgeThreadMessage[]; nextCursor: string | null }> {
    if (!threadId) throw new Error('Thread ID is required')
    const result = await this.client.request('thread/items/list', { threadId, turnId, cursor, limit })
    const body = payload(result)
    const source = Array.isArray(body.items) ? body.items : Array.isArray(body.data) ? body.data : []
    return { items: source.map(message).filter((item): item is BridgeThreadMessage => Boolean(item)), nextCursor: text(body.nextCursor ?? body.next_cursor) || null }
  }

  /** 读取一个 thread 的历史消息。 */
  async readThread(threadId: string, cursor?: string, limit = 100): Promise<BridgeThreadHistory> {
    if (!threadId) throw new Error('Thread ID is required')
    const result = await this.client.request('thread/read', { threadId })
    const body = payload(result)
    const thread = threadSummary(body.thread ?? body) ?? { id: threadId, title: threadId, cwd: null, projectId: null, gitInfo: null, updatedAt: null, createdAt: null }
    const source = Array.isArray(body.messages) ? body.messages : Array.isArray(body.items) ? body.items : Array.isArray(body.turns) ? body.turns.flatMap((turn) => record(turn).items ?? []) : []
    if (!source.length) {
      const page = await this.listItems(threadId, undefined, cursor, limit)
      return { thread, messages: page.items, nextCursor: page.nextCursor }
    }
    return { thread, messages: source.map(message).filter((item): item is BridgeThreadMessage => Boolean(item)), nextCursor: text(body.nextCursor ?? body.next_cursor) || null }
  }

  /** 创建一个新的 Codex thread。 */
  async startThread(): Promise<BridgeThreadSummary> {
    if (!this.cwd) throw new Error('Project path is required / 必须选择项目目录')
    await this.beforeWrite?.()
    const result = await this.client.request('thread/start', { cwd: this.cwd, projectId: this.projectId, approvalPolicy: 'on-request', approvalsReviewer: 'auto_review', sandbox: 'workspace-write', developerInstructions: this.developerInstructions })
    const thread = threadSummary(payload(result).thread ?? payload(result))
    if (!thread) throw new Error('Codex did not return a thread')
    return { ...thread, cwd: thread.cwd ?? this.cwd, projectId: thread.projectId ?? this.projectId ?? null }
  }

  /** 向 thread 发送一轮消息。 */
  async startTurn(threadId: string, textValue: string): Promise<{ turnId: string | null }> {
    if (!threadId) throw new Error('Thread ID is required')
    if (!textValue.trim()) throw new Error('Message is required')
    await this.resumeThread(threadId)
    await this.beforeWrite?.()
    const result = await this.client.request('turn/start', { threadId, input: [{ type: 'text', text: textValue }] })
    const body = payload(result)
    return { turnId: text(record(body.turn).id ?? body.turnId) || null }
  }

  /** 从 Codex 记录核验 cwd，禁止通过外部参数重绑定。 */
  async verifyThread(threadId: string): Promise<BridgeThreadSummary> {
    const response = await this.client.request('thread/read', { threadId })
    const body = payload(response)
    const thread = threadSummary(body.thread ?? body)
    if (!thread?.cwd) throw new Error('Thread has no project directory / 会话缺少项目目录')
    if (this.cwd && await normalizeProjectPath(thread.cwd) !== await normalizeProjectPath(this.cwd)) throw new Error('Thread project mismatch / 会话项目不匹配')
    return thread
  }

  /** 中断 thread 当前回合。 */
  async interrupt(threadId: string, turnId: string): Promise<void> {
    if (!threadId || !turnId) throw new Error('Thread ID and turn ID are required')
    await this.verifyThread(threadId)
    await this.client.request('turn/interrupt', { threadId, turnId })
  }
}
