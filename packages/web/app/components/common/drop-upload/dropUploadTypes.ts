/** 拖拽上传解析结果。 */
export interface DropUploadPayload {
  /** 本地文件；有值时 urls 为空。 */
  files: File[]
  /** HTTP(S) 地址；有值时 files 为空。 */
  urls: string[]
  /** 原始拖拽事件。 */
  event: DragEvent
}

/** 拖拽上传指令配置。 */
export interface DropUploadOptions {
  /** 覆盖层内容区域的附加 Tailwind CSS 类。 */
  class?: string
  /** 拖拽监听与覆盖层挂载目标选择器，未命中时使用指令绑定元素。 */
  targetSelector?: string
  /** 拖拽内容通过校验后的回调。 */
  onDrop?: (payload: DropUploadPayload) => void | Promise<void>
  /** 首次进入拖拽区域时触发。 */
  onDragEnter?: (event: DragEvent) => void
  /** 完全离开拖拽区域时触发。 */
  onDragLeave?: (event: DragEvent) => void
  /** 数量校验失败后的回调。 */
  onError?: (errors: string[]) => void
  /** 本地文件进入业务上传前的同步校验。 */
  onBeforeUpload?: (files: File[]) => boolean
  /** 最大文件或 URL 数量。 */
  maxFiles?: number
  /** 是否允许一次拖入多个项目。 */
  multiple?: boolean
  /** 是否禁用拖拽处理。 */
  disabled?: boolean
  /** 覆盖层主提示文字。 */
  overlayHint?: string
  /** 覆盖层数量提示文字。 */
  limitHint?: string
  /** 内容区域是否占满覆盖层宽度。 */
  fullWidth?: boolean
}

/** 拖拽上传覆盖层属性。 */
export interface DropUploadOverlayProps extends DropUploadOptions {
  /** 是否阻止拖拽事件继续冒泡。 */
  stopPropagation?: boolean
}

/** 拖拽上传覆盖层对指令暴露的方法。 */
export interface DropUploadExpose {
  /** 显示覆盖层。 */
  show: () => void
  /** 隐藏覆盖层。 */
  hide: () => void
}

/** 拖拽上传校验失败原因。 */
export type DropUploadValidationReason = 'empty' | 'single-count' | 'max-count' | 'before-upload'

/** 拖拽上传校验结果。 */
export type DropUploadValidationResult =
  | { valid: true }
  | { valid: false, reason: DropUploadValidationReason }
