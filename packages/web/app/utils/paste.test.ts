import type { PasteFilesCallback } from './paste'
import { describe, expect, it, vi } from 'vitest'
import { usePasteFiles } from './paste'

/** 测试事件源保存的 paste 监听器。 */
type PasteListener = (event: ClipboardEvent) => void | Promise<void>

/**
 * 创建可观察监听注册和解除行为的区域元素桩。
 *
 * @returns 区域元素、监听器读取方法和事件方法桩。
 */
function createPasteTarget() {
  /** 当前注册的 paste 监听器。 */
  let listener: PasteListener | undefined
  /** 事件注册方法桩。 */
  const addEventListener = vi.fn((type: string, nextListener: PasteListener) => {
    if (type === 'paste') listener = nextListener
  })
  /** 事件解除方法桩。 */
  const removeEventListener = vi.fn()
  /** 区域元素桩。 */
  const target = { addEventListener, removeEventListener } as unknown as HTMLElement

  return {
    target,
    addEventListener,
    removeEventListener,
    /** 读取工具注册的 paste 监听器。 */
    getListener: () => listener,
  }
}

/**
 * 创建包含指定剪贴板条目的事件桩。
 *
 * @param items 剪贴板条目。
 * @returns 可供工具消费的 paste 事件和 preventDefault 桩。
 */
function createPasteEvent(items: Array<{
  kind: string
  getAsFile: () => File | null
}>) {
  /** 默认行为拦截方法桩。 */
  const preventDefault = vi.fn()
  /** paste 事件桩。 */
  const event = {
    clipboardData: { items },
    preventDefault,
  } as unknown as ClipboardEvent

  return { event, preventDefault }
}

describe('usePasteFiles', () => {
  it('按剪贴板顺序提取文件并忽略普通文本', async () => {
    const firstFile = { name: 'first.png' } as File
    const secondFile = { name: 'second.svg' } as File
    const callback: PasteFilesCallback = vi.fn()
    const { target, getListener } = createPasteTarget()
    const { event, preventDefault } = createPasteEvent([
      { kind: 'file', getAsFile: () => firstFile },
      { kind: 'string', getAsFile: () => null },
      { kind: 'file', getAsFile: () => secondFile },
    ])

    usePasteFiles(target, callback)
    await getListener()?.(event)

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledWith([firstFile, secondFile], event)
  })

  it('没有文件时保留浏览器默认粘贴行为', async () => {
    const callback: PasteFilesCallback = vi.fn()
    const { target, getListener } = createPasteTarget()
    const { event, preventDefault } = createPasteEvent([
      { kind: 'string', getAsFile: () => null },
    ])

    usePasteFiles(target, callback)
    await getListener()?.(event)

    expect(preventDefault).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
  })

  it('destroy 解除监听且可安全重复调用', () => {
    const callback: PasteFilesCallback = vi.fn()
    const { target, addEventListener, removeEventListener, getListener } = createPasteTarget()
    const controller = usePasteFiles(target, callback)
    const listener = getListener()

    controller.destroy()
    controller.destroy()

    expect(addEventListener).toHaveBeenCalledWith('paste', listener, undefined)
    expect(removeEventListener).toHaveBeenCalledOnce()
    expect(removeEventListener).toHaveBeenCalledWith('paste', listener, undefined)
  })
})
