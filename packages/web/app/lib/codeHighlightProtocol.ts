import type { CodeHighlightLanguage, CodeHighlightSegment } from './codeHighlight'

/** 高亮任务优先级。 */
export type CodeHighlightPriority = 'interactive' | 'visible-preview'

/** 主线程发送给 Worker 的高亮请求。 */
export interface CodeHighlightRequest {
  /** 消息类型。 */
  type: 'highlight'
  /** 全局递增的请求标识。 */
  requestId: number
  /** 发起请求的组件标识。 */
  consumerId: string
  /** 已标准化的代码语言。 */
  language: CodeHighlightLanguage
  /** 原始代码。 */
  source: string
}

/** Worker 返回的成功结果。 */
export interface CodeHighlightSuccess {
  /** 消息类型。 */
  type: 'highlight-success'
  /** 对应的请求标识。 */
  requestId: number
  /** 对应的组件标识。 */
  consumerId: string
  /** 实际使用的标准语言。 */
  language: CodeHighlightLanguage
  /** 受控代码文本片段。 */
  segments: CodeHighlightSegment[]
  /** Worker 内解析耗时。 */
  durationMs: number
}

/** Worker 返回的失败原因。 */
export type CodeHighlightFailureReason = 'unsupported' | 'invalid-result' | 'runtime-error'

/** Worker 返回的失败结果。 */
export interface CodeHighlightFailure {
  /** 消息类型。 */
  type: 'highlight-failure'
  /** 对应的请求标识。 */
  requestId: number
  /** 对应的组件标识。 */
  consumerId: string
  /** 稳定失败原因。 */
  reason: CodeHighlightFailureReason
}

/** Worker 允许返回的消息。 */
export type CodeHighlightResponse = CodeHighlightSuccess | CodeHighlightFailure
