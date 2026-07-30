import type {
  DropUploadOptions,
  DropUploadPayload,
  DropUploadValidationResult,
} from './dropUploadTypes'

/** HTTP(S) 地址匹配规则。 */
const HTTP_URL_PATTERN = /^https?:\/\//i

/**
 * 判断拖拽内容是否包含文件或标准 URL。
 *
 * @param event 原始拖拽事件。
 * @returns 是否需要展示上传覆盖层。
 */
export function hasSupportedDropData(event: DragEvent) {
  const types = Array.from(event.dataTransfer?.types || [])
  const hasFileItem = Array.from(event.dataTransfer?.items || [])
    .some(item => item.kind === 'file')

  return hasFileItem
    || types.includes('Files')
    || types.includes('application/x-moz-file')
    || types.includes('text/uri-list')
}

/**
 * 从拖拽事件中解析本地文件和 URL。
 *
 * @param event 原始拖拽事件。
 * @returns 文件与 URL 互斥的拖拽结果。
 */
export function resolveDropUploadPayload(event: DragEvent): DropUploadPayload {
  const files = Array.from(event.dataTransfer?.files || [])
    .filter(file => file.size > 0)
  const uriList = (event.dataTransfer?.getData('text/uri-list') || '')
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(value => value && !value.startsWith('#'))
  const plainTextUrls = (event.dataTransfer?.getData('text/plain') || '')
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(value => HTTP_URL_PATTERN.test(value))

  return {
    files,
    urls: files.length
      ? []
      : Array.from(new Set([...uriList, ...plainTextUrls]))
          .filter(value => HTTP_URL_PATTERN.test(value)),
    event,
  }
}

/**
 * 校验拖拽内容数量及业务前置条件。
 *
 * @param payload 已解析的拖拽内容。
 * @param options 当前指令配置。
 * @returns 可供覆盖层转换为用户反馈的校验结果。
 */
export function validateDropUploadPayload(
  payload: DropUploadPayload,
  options: DropUploadOptions,
): DropUploadValidationResult {
  const itemCount = payload.files.length + payload.urls.length

  if (itemCount === 0) return { valid: false, reason: 'empty' }
  if (!options.multiple && itemCount > 1) {
    return { valid: false, reason: 'single-count' }
  }
  if (options.maxFiles && options.maxFiles > 0 && itemCount > options.maxFiles) {
    return { valid: false, reason: 'max-count' }
  }
  if (
    payload.files.length
    && options.onBeforeUpload
    && !options.onBeforeUpload(payload.files)
  ) {
    return { valid: false, reason: 'before-upload' }
  }

  return { valid: true }
}
