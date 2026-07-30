import { useCleanupQueue, useEventHandler } from './messageHandler'

/** paste 文件监听允许绑定的事件源。 */
export type PasteEventSource = Window | HTMLElement

/** paste 文件监听收到文件后的业务回调。 */
export type PasteFilesCallback = (
  files: File[],
  event: ClipboardEvent,
) => void | Promise<void>

/** paste 文件监听对外暴露的生命周期控制器。 */
export interface PasteFilesController {
  /** 解除工具内部注册的全部事件监听。 */
  destroy: () => void
}

/**
 * 在指定事件源上监听文件粘贴，内置文件解析和默认行为拦截。
 *
 * @param eventSource Window 或指定区域元素。
 * @param callback 收到剪贴板文件后的业务回调。
 * @returns 只暴露 destroy 的监听生命周期控制器。
 */
export function usePasteFiles(
  eventSource: PasteEventSource,
  callback: PasteFilesCallback,
): PasteFilesController {
  /** 工具内部事件监听的清理队列。 */
  const { addCleanup, cleanup } = useCleanupQueue()
  /** 解析文件并转交业务回调的 paste 事件处理器。 */
  const handlePaste = async (event: ClipboardEvent) => {
    /** 当前 paste 事件包含的全部文件。 */
    const files = resolvePasteFiles(event)
    if (!files.length) return

    event.preventDefault()
    await callback(files, event)
  }

  addCleanup(useEventHandler(eventSource, 'paste', handlePaste))
  return {
    destroy: cleanup,
  }
}

/**
 * 从剪贴板条目中提取文件，忽略普通文本和 HTML 内容。
 *
 * @param event 浏览器粘贴事件。
 * @returns 按剪贴板原顺序排列的文件。
 */
function resolvePasteFiles(event: ClipboardEvent) {
  if (!event.clipboardData) return []
  return Array.from(event.clipboardData.items).reduce<File[]>((files, item) => {
    if (item.kind !== 'file') return files
    /** 当前剪贴板文件条目转换后的浏览器文件。 */
    const file = item.getAsFile()
    if (file) files.push(file)
    return files
  }, [])
}
