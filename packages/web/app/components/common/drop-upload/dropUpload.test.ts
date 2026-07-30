import { describe, expect, it, vi } from 'vitest'
import {
  hasSupportedDropData,
  resolveDropUploadPayload,
  validateDropUploadPayload,
} from './dropUploadUtils'

/** 测试使用的网页地址。 */
const TEST_URL = 'https://example.com/upload.png'

/** 拖拽事件测试参数。 */
interface DragEventFixture {
  /** 模拟文件列表。 */
  files?: File[]
  /** 模拟 URI 列表。 */
  uriList?: string
  /** 模拟纯文本。 */
  plainText?: string
}

/**
 * 创建无需 DOM 环境的拖拽事件桩。
 *
 * @param fixture 文件与文本数据。
 * @returns 可供解析函数消费的拖拽事件。
 */
function createDragEvent(fixture: DragEventFixture = {}) {
  const files = fixture.files || []
  return {
    dataTransfer: {
      files,
      items: files.map(() => ({ kind: 'file' })),
      types: files.length ? ['Files'] : ['text/uri-list'],
      getData(type: string) {
        if (type === 'text/uri-list') return fixture.uriList || ''
        if (type === 'text/plain') return fixture.plainText || ''
        return ''
      },
    },
  } as unknown as DragEvent
}

describe('dropUpload', () => {
  it('识别文件与 URI 拖拽类型', () => {
    expect(hasSupportedDropData(createDragEvent({ files: [{ size: 1 } as File] }))).toBe(true)
    expect(hasSupportedDropData(createDragEvent({ uriList: TEST_URL }))).toBe(true)
  })

  it('存在有效文件时忽略同时拖入的 URL', () => {
    const file = { name: 'askx.svg', size: 256, lastModified: 1 } as File
    const event = createDragEvent({ files: [file], uriList: TEST_URL })
    const payload = resolveDropUploadPayload(event)

    expect(payload.files).toEqual([file])
    expect(payload.urls).toEqual([])
  })

  it('过滤非 HTTP 地址并去重', () => {
    const event = createDragEvent({
      uriList: `${TEST_URL}\n# comment\nftp://example.com/file`,
      plainText: `${TEST_URL}\nhttps://example.com/second`,
    })

    expect(resolveDropUploadPayload(event).urls).toEqual([
      TEST_URL,
      'https://example.com/second',
    ])
  })

  it('校验单选、最大数量和上传前置条件', () => {
    const event = createDragEvent({ uriList: `${TEST_URL}\nhttps://example.com/second` })
    const payload = resolveDropUploadPayload(event)

    expect(validateDropUploadPayload(payload, { multiple: false })).toEqual({
      valid: false,
      reason: 'single-count',
    })
    expect(validateDropUploadPayload(payload, { multiple: true, maxFiles: 1 })).toEqual({
      valid: false,
      reason: 'max-count',
    })

    const onBeforeUpload = vi.fn(() => false)
    const filePayload = resolveDropUploadPayload(createDragEvent({
      files: [{ name: 'askx.svg', size: 256 } as File],
    }))
    expect(validateDropUploadPayload(filePayload, { onBeforeUpload })).toEqual({
      valid: false,
      reason: 'before-upload',
    })
    expect(onBeforeUpload).toHaveBeenCalledOnce()
  })
})
