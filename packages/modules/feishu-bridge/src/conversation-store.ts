import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, unlinkSync, statSync, realpathSync, watch } from 'node:fs'
import { resolve, join } from 'node:path'
import type { BridgeConversationEvent, BridgeConversationItem, BridgeConversationSnapshot, BridgeConversationSource, BridgeConversationTurn } from './conversation-contract.js'
import { conversationRecord, normalizeConversationItem, normalizeConversationStatus } from './conversation-normalizer.js'

/** 持久化来源不随有界事件队列清理，且不重复存储聊天正文。 */
interface SourceRecord {
  /** 消息所属轮次。 */
  turnId: string | null
  /** 客户端稳定消息身份。 */
  clientMessageId: string
  /** 服务端用户 item 标识。 */
  itemIds: string[]
  /** 渠道来源快照。 */
  source: BridgeConversationSource
}
/** 一个执行分区的原子快照，始终只有创建它的进程写入。 */
interface RunRecord {
  /** 数据格式版本。 */
  version: 1
  /** 所属线程。 */
  threadId: string
  /** 执行 owner 进程。 */
  pid: number
  /** 更新时间。 */
  updatedAt: string
  /** 当前完整消息。 */
  messages: BridgeConversationItem[]
  /** 当前执行状态。 */
  turn: BridgeConversationTurn
  /** 有界事件队列。 */
  events: BridgeConversationEvent[]
}
/** 生成受管文件名，外部标识不得直接进入文件路径。 */
function key(value: string): string { return createHash('sha256').update(value).digest('hex').slice(0, 32) }
/** 通过同目录临时文件提交，避免读取半写入数据。 */
function atomicWrite(path: string, value: unknown): void {
  writeFileSync(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
}

/** 共享来源与跨进程事件的唯一存储 owner。 */
export class BridgeConversationStore {
  /** CODEX_HOME 的实际目录隔离标识。 */
  readonly namespace: string
  /** 有界执行记录目录。 */
  private readonly directory: string
  /** 长期来源资料目录。 */
  private readonly sourcesDirectory: string
  /** 按文件修改信息复用已验证记录，避免重复解码正文。 */
  private cache = new Map<string, { stamp: string; record: RunRecord }>()
  constructor(codexHome: string, stateDir = join(codexHome, 'askx-relay')) {
    /** 不存在的隔离目录仍使用规范化绝对路径。 */
    let home = resolve(codexHome)
    try { home = realpathSync(home) } catch { /* 首次启动前目录可以不存在。 */ }
    this.namespace = key(home)
    this.directory = join(stateDir, 'conversations', this.namespace, 'events')
    this.sourcesDirectory = join(stateDir, 'conversations', this.namespace, 'sources')
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    mkdirSync(this.sourcesDirectory, { recursive: true, mode: 0o700 })
  }
  /** 创建执行分区；调用方须已持有既有跨进程会话锁。 */
  begin(threadId: string, source: BridgeConversationSource, clientMessageId: string, content: string): BridgeConversationRun {
    this.prune()
    return new BridgeConversationRun(this, threadId, source, clientMessageId, content)
  }
  /** 来源单独持久化，不受实时事件容量和保留期限影响。 */
  saveSource(threadId: string, runId: string, source: SourceRecord): void {
    const directory = join(this.sourcesDirectory, key(threadId))
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    atomicWrite(join(directory, `${runId}.json`), source)
  }
  /** 原生命名通知独立于 turn 生命周期，空名称只使目录失效。 */
  ingestTitleNotification(method: string, params: Record<string, unknown>): void {
    if (method === 'thread/name/updated' && typeof params.threadId === 'string') this.notifyCatalog(params.threadId, typeof params.threadName === 'string' ? params.threadName : undefined)
  }
  /** 将命名等不属于执行轮次的变更发布为独立单写入分区。 */
  notifyCatalog(threadId = '', title?: string): void {
    this.prune()
    const runId = `${Date.now()}-${randomUUID()}`
    const createdAt = new Date().toISOString()
    const base = { version: 1 as const, namespace: this.namespace, threadId, runId, sequence: 1, createdAt }
    const events: BridgeConversationEvent[] = [{ ...base, type: 'catalog.changed' }]
    if (title) events.push({ ...base, sequence: 2, type: 'thread.title', title })
    this.save(runId, { version: 1, threadId, pid: process.pid, updatedAt: createdAt, messages: [], turn: { id: null, runId, channel: 'web', status: 'completed', updatedAt: createdAt }, events })
  }
  /** 保存完整快照及有界队列；来源由单独入口持久化。 */
  save(runId: string, record: RunRecord): void { atomicWrite(join(this.directory, `${runId}.json`), record) }
  /** 订阅跨进程原子提交，调用方负责取消订阅。 */
  subscribe(listener: () => void): () => void {
    const watcher = watch(this.directory, (_event, filename) => { if (filename?.endsWith('.json')) listener() })
    watcher.on('error', listener)
    return () => watcher.close()
  }
  /** 只读取本模块格式的记录；损坏分区不能影响其他会话。 */
  private records(): RunRecord[] {
    const result: RunRecord[] = []
    const names = new Set(readdirSync(this.directory).filter(name => /^\d+-[\da-f-]+\.json$/u.test(name)))
    for (const name of this.cache.keys()) if (!names.has(name)) this.cache.delete(name)
    for (const name of names) {
      try {
        const path = join(this.directory, name)
        const info = statSync(path)
        const stamp = `${info.mtimeMs}:${info.size}`
        let cached = this.cache.get(name)
        if (!cached || cached.stamp !== stamp) {
          const value = JSON.parse(readFileSync(path, 'utf8')) as RunRecord
          if (value.version !== 1 || typeof value.threadId !== 'string' || !Array.isArray(value.events) || !Array.isArray(value.messages) || !value.turn?.runId) continue
          cached = { stamp, record: value }
          this.cache.set(name, cached)
        }
        let record = cached.record
        if (record.turn.status === 'inProgress') {
          try { process.kill(record.pid, 0) } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
              const turn: BridgeConversationTurn = { ...record.turn, status: 'failed', canInterrupt: false, error: 'Execution process exited / 执行进程已退出' }
              const last = record.events.at(-1)
              const terminal: BridgeConversationEvent = { version: 1, namespace: this.namespace, threadId: record.threadId, runId: turn.runId, sequence: (last?.sequence ?? 0) + 1, createdAt: record.updatedAt, type: 'turn.status', turn }
              record = { ...record, turn, messages: record.messages.map(item => item.status === 'inProgress' ? { ...item, status: 'failed' } : item), events: [...record.events, terminal] }
            }
          }
        }
        result.push(record)
      } catch { /* 未知或损坏记录不加入业务状态。 */ }
    }
    return result.sort((a, b) => a.turn.runId.localeCompare(b.turn.runId))
  }
  /** 读取有界事件，未选中会话只下发目录失效及标题。 */
  events(threadId?: string): BridgeConversationEvent[] {
    return this.records().flatMap(record => record.events.filter(event => event.threadId === threadId || event.type === 'catalog.changed' || event.type === 'thread.title'))
  }
  /** 快照不依赖有界队列，长执行不会丢失前面的消息和来源。 */
  read(threadId: string): BridgeConversationSnapshot {
    const records = this.records().filter(record => record.threadId === threadId && record.events.some(event => event.type === 'turn.status'))
    return { namespace: this.namespace, messages: records.flatMap(record => record.messages), turn: records.at(-1)?.turn ?? null }
  }
  /** 按稳定身份补回来源并合并实时记录，禁止通过相同文本猜测身份。 */
  mergeHistory(threadId: string, history: BridgeConversationItem[], includeLive = true): BridgeConversationSnapshot {
    const snapshot = this.read(threadId)
    const sources: SourceRecord[] = []
    try {
      const directory = join(this.sourcesDirectory, key(threadId))
      for (const file of readdirSync(directory).filter(file => /^\d+-[\da-f-]+\.json$/u.test(file))) {
        try {
          const value = JSON.parse(readFileSync(join(directory, file), 'utf8')) as SourceRecord
          if (value.source && Array.isArray(value.itemIds) && typeof value.clientMessageId === 'string') sources.push(value)
        } catch { /* 单个来源记录损坏时保留历史正文。 */ }
      }
    } catch { /* 旧会话可能尚无独立来源记录。 */ }
    const messages = new Map<string, BridgeConversationItem>()
    for (const item of history) {
      const source = sources.find(source => source.itemIds.includes(item.id) || (item.clientMessageId && source.clientMessageId === item.clientMessageId))
      messages.set(item.id, source ? { ...item, source: source.source, clientMessageId: source.clientMessageId } : item)
    }
    for (const item of snapshot.messages) {
      if (!includeLive && !messages.has(item.id)) continue
      if (!messages.has(item.id) && item.turnId && item.turnId !== snapshot.turn?.id) continue
      if (item.id.startsWith('client-') && [...messages.values()].some(existing => existing.clientMessageId === item.clientMessageId)) continue
      const previous = messages.get(item.id)
      const live = snapshot.turn?.status === 'inProgress' && item.turnId === snapshot.turn.id
      messages.set(item.id, previous && previous.status !== 'inProgress' && !live ? { ...item, ...previous, ...(item.source ? { source: item.source } : {}) } : { ...previous, ...item })
    }
    return { ...snapshot, messages: [...messages.values()] }
  }
  /** 仅清理本模块已完成的旧事件分区，长期来源记录不删除。 */
  private prune(): void {
    const records = this.records()
    for (const [index, record] of records.entries()) {
      if (record.turn.status === 'inProgress' || (index >= records.length - 200 && Date.now() - Date.parse(record.updatedAt) < 86400000)) continue
      const name = `${record.turn.runId}.json`
      try { unlinkSync(join(this.directory, name)); this.cache.delete(name) } catch { /* 并发清理或已经删除均可忽略。 */ }
    }
  }
}

/** 单个执行内的消息和轮次提交入口。 */
export class BridgeConversationRun {
  /** 单写入方执行标识。 */
  readonly runId = `${Date.now()}-${randomUUID()}`
  /** 有界传输队列。 */
  private events: BridgeConversationEvent[] = []
  /** 当前完整消息索引。 */
  private items = new Map<string, BridgeConversationItem>()
  /** 推理摘要按协议段索引累积。 */
  private summaries = new Map<string, Map<number, string>>()
  /** 单调递增序号。 */
  private sequence = 0
  /** 当前轮次状态。 */
  private turn: BridgeConversationTurn
  /** 合并密集文本更新的写入计时器。 */
  private timer: ReturnType<typeof setTimeout> | undefined
  /** 稳定的用户消息服务端标识。 */
  private userIds: string[] = []
  constructor(private readonly store: BridgeConversationStore, private readonly threadId: string, private readonly source: BridgeConversationSource, private readonly clientMessageId: string, content: string) {
    this.turn = { id: null, runId: this.runId, channel: source.channel, status: 'inProgress', updatedAt: new Date().toISOString(), canInterrupt: source.channel === 'web' }
    this.upsert({ id: `client-${clientMessageId}`, turnId: null, role: 'user', kind: 'message', content, createdAt: source.createdAt ?? new Date().toISOString(), status: 'inProgress', source: { ...source }, clientMessageId })
    this.publish({ type: 'turn.status', turn: { ...this.turn } })
    this.catalogChanged()
    this.persistSource()
    this.flush()
  }
  /** 发布标准事件；消费者只接收完整快照，不重复累积 delta。 */
  private publish(value: { type: 'item.upsert'; item: BridgeConversationItem } | { type: 'turn.status'; turn: BridgeConversationTurn } | { type: 'thread.title'; title: string } | { type: 'catalog.changed' }): void {
    this.events.push({ version: 1, namespace: this.store.namespace, threadId: this.threadId, runId: this.runId, sequence: ++this.sequence, createdAt: new Date().toISOString(), ...value })
    this.events = this.events.slice(-128)
    while (this.events.length > 1 && JSON.stringify(this.events).length > 1048576) this.events.shift()
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 60)
  }
  /** 提交当前 item；用户占位仅通过稳定 clientMessageId 替换。 */
  private upsert(item: BridgeConversationItem): void {
    if (item.role === 'user' && !item.id.startsWith('client-')) this.items.delete(`client-${this.clientMessageId}`)
    this.items.set(item.id, item)
    this.publish({ type: 'item.upsert', item: structuredClone(item) })
  }
  /** 对外提供终态即时落盘，释放执行锁前可调用。 */
  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.store.save(this.runId, { version: 1, threadId: this.threadId, pid: process.pid, updatedAt: new Date().toISOString(), messages: [...this.items.values()], turn: { ...this.turn }, events: this.events })
  }
  /** 来源不包含正文，执行结束后的头像补全仍可安全更新。 */
  private persistSource(): void {
    this.store.saveSource(this.threadId, this.runId, { turnId: this.turn.id, clientMessageId: this.clientMessageId, itemIds: [...this.userIds], source: { ...this.source } })
  }
  /** 通知所有页面刷新目录。 */
  catalogChanged(title?: string): void {
    if (title) this.publish({ type: 'thread.title', title })
    this.publish({ type: 'catalog.changed' })
    if (this.turn.status !== 'inProgress') this.flush()
  }
  /** 完成所有未结束过程，迟到的协议增量不得改变终态。 */
  status(status: BridgeConversationTurn['status'], error?: string): void {
    if (this.turn.status !== 'inProgress') return
    this.turn = { ...this.turn, status, updatedAt: new Date().toISOString(), canInterrupt: status === 'inProgress' && this.source.channel === 'web', ...(error ? { error } : {}) }
    if (status !== 'inProgress') for (const item of [...this.items.values()]) {
      if (item.status === 'inProgress') this.upsert({ ...item, status, ...(item.plan && status === 'completed' ? { plan: item.plan.map(step => ({ ...step, status: 'completed' as const })) } : {}) })
    }
    this.publish({ type: 'turn.status', turn: { ...this.turn } })
    if (status !== 'inProgress') { this.persistSource(); this.catalogChanged(); this.flush() }
  }
  /** 异步身份查询只更新本执行的来源，不重放旧正文。 */
  updateProfile(profile: { displayName?: string; avatarUrl?: string }): void {
    if (profile.displayName) this.source.senderName = profile.displayName
    if (profile.avatarUrl) this.source.avatarUrl = profile.avatarUrl
    for (const item of [...this.items.values()]) if (item.role === 'user') this.upsert({ ...item, source: { ...this.source } })
    this.persistSource()
    this.flush()
  }
  /** 接受已拥有的轮次通知，忽略其他线程和迟到轮次。 */
  ingest(method: string, params: Record<string, unknown>): void {
    if (this.turn.status !== 'inProgress' || (params.threadId && params.threadId !== this.threadId)) return
    const rawTurn = conversationRecord(params.turn)
    const turnId = typeof rawTurn.id === 'string' ? rawTurn.id : typeof params.turnId === 'string' ? params.turnId : null
    if (this.turn.id && turnId && this.turn.id !== turnId) return
    if (turnId) this.turn.id = turnId
    if (method === 'turn/started') { this.status('inProgress'); this.persistSource() }
    if (method === 'bridge/sessionClosed') { this.status('failed', 'Execution process exited / 执行进程已退出'); return }
    if (method === 'error') { if (params.willRetry === false) this.status('failed', 'Execution failed / 执行失败'); return }
    if (method === 'item/started' || method === 'item/completed') {
      const item = normalizeConversationItem(params.item, this.turn.id)
      if (item) {
        item.status = method === 'item/started' ? 'inProgress' : item.status
        if (item.role === 'user') {
          item.source = { ...this.source }; item.clientMessageId = this.clientMessageId
          if (!this.userIds.includes(item.id)) this.userIds.push(item.id)
          this.persistSource()
        }
        this.upsert(item)
      }
    }
    if (['item/agentMessage/delta', 'item/reasoning/summaryTextDelta', 'item/commandExecution/outputDelta'].includes(method)) {
      const id = typeof params.itemId === 'string' ? params.itemId : ''
      if (!id || typeof params.delta !== 'string') return
      const old = this.items.get(id)
      if (old && old.status !== 'inProgress') return
      const item = old ? structuredClone(old) : normalizeConversationItem({ id, type: method.includes('reasoning') ? 'reasoning' : method.includes('commandExecution') ? 'commandExecution' : 'agentMessage' }, this.turn.id)
      if (!item) return
      if (method.includes('reasoning')) {
        const summaries = this.summaries.get(id) ?? new Map<number, string>()
        const index = typeof params.summaryIndex === 'number' ? params.summaryIndex : 0
        summaries.set(index, (summaries.get(index) ?? '') + params.delta)
        this.summaries.set(id, summaries)
        item.content = [...summaries.entries()].sort(([a], [b]) => a - b).map(([, text]) => text).join('\n\n')
      } else item.content += params.delta
      item.content = item.content.slice(-262144)
      if (item.kind === 'command') item.tool = { ...item.tool, name: item.tool?.name ?? 'commandExecution', output: item.content }
      item.status = 'inProgress'
      this.upsert(item)
    }
    if (method === 'turn/plan/updated' && Array.isArray(params.plan)) {
      const item = normalizeConversationItem({ id: `plan-${this.turn.id}`, type: 'plan', explanation: params.explanation, plan: params.plan, status: 'inProgress' }, this.turn.id)
      if (item) this.upsert(item)
    }
    if (method === 'turn/completed') this.status(normalizeConversationStatus(rawTurn.status))
    if (['turn/failed', 'turn/aborted', 'turn/interrupted'].includes(method)) this.status(method === 'turn/failed' ? 'failed' : 'interrupted')
  }
}
