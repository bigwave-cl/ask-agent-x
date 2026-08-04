import type { CodeHighlightSegment } from '@/lib/codeHighlight'

/** Code Editor 中一个逻辑行的受控高亮内容。 */
export interface CodeEditorLine {
  /** 当前逻辑行内按语义作用域拆分的文本片段。 */
  segments: CodeHighlightSegment[]
}

/**
 * 将可能跨行的高亮片段拆成逻辑行，供软换行内容与行号共用布局。
 *
 * @param segments Worker 返回或本地生成的安全文本片段。
 * @returns 至少包含一个逻辑行的编辑器行集合。
 */
export function createCodeEditorLines(segments: CodeHighlightSegment[]): CodeEditorLine[] {
  const lines: CodeEditorLine[] = [{ segments: [] }]

  for (const segment of segments) {
    const parts = segment.value.split('\n')
    for (let index = 0; index < parts.length; index += 1) {
      const value = parts[index] ?? ''
      if (value) lines[lines.length - 1]!.segments.push({ value, scopes: segment.scopes })
      if (index < parts.length - 1) lines.push({ segments: [] })
    }
  }

  return lines
}

/**
 * 根据文本光标偏移解析当前逻辑行索引。
 * @param source 编辑器完整文本。
 * @param selectionStart textarea 当前选择起点。
 * @returns 从零开始的逻辑行索引。
 */
export function resolveCodeEditorLineIndex(source: string, selectionStart: number): number {
  const normalizedOffset = Number.isFinite(selectionStart) ? Math.trunc(selectionStart) : 0
  const safeOffset = Math.min(Math.max(normalizedOffset, 0), source.length)
  let lineIndex = 0
  for (let index = 0; index < safeOffset; index += 1) {
    if (source.charCodeAt(index) === 10) lineIndex += 1
  }
  return lineIndex
}
