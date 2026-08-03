/** 本地路径支持的打开方式。 */
export const localOpenTargetIds = ['system', 'cursor', 'vscode'] as const

/** 本地路径打开方式标识。 */
export type LocalOpenTarget = typeof localOpenTargetIds[number]

/** 本地打开方式的可用状态。 */
export interface LocalOpenOption {
  /** 打开方式标识。 */
  id: LocalOpenTarget
  /** 当前设备是否可以调用该打开方式。 */
  available: boolean
}

/** 本地路径打开请求。 */
export interface LocalOpenRequest {
  /** 需要打开的绝对路径。 */
  path: string
  /** 目标系统工具或编辑器。 */
  target: LocalOpenTarget
}

/** 本地路径打开结果。 */
export interface LocalOpenResult {
  /** 已交给系统处理的绝对路径。 */
  path: string
  /** 实际使用的打开方式。 */
  target: LocalOpenTarget
}
