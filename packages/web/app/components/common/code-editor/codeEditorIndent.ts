/** 代码编辑器单级缩进文本。 */
export const CODE_EDITOR_INDENT = '  '

/** 代码编辑器缩进方向。 */
export type CodeEditorIndentDirection = 'indent' | 'outdent'

/** 代码编辑器缩进后的文本与选区。 */
export interface CodeEditorIndentResult {
  /** 更新后的完整文本。 */
  value: string
  /** 更新后的选区起点。 */
  selectionStart: number
  /** 更新后的选区终点。 */
  selectionEnd: number
}

/**
 * 将选区位置限制在文本范围内。
 * @param value 待限制的位置。
 * @param sourceLength 文本长度。
 * @returns 可安全用于 textarea 的选区位置。
 */
function clampSelection(value: number, sourceLength: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(Math.trunc(value), 0), sourceLength)
}

/**
 * 计算光标所在逻辑行的起点。
 * @param source 编辑器文本。
 * @param position 光标或选区位置。
 * @returns 当前逻辑行的起始偏移。
 */
function resolveLineStart(source: string, position: number): number {
  return source.lastIndexOf('\n', Math.max(0, position - 1)) + 1
}

/**
 * 解析一行开头可以移除的缩进长度。
 * @param source 编辑器文本。
 * @param lineStart 逻辑行起点。
 * @returns 应移除的字符数量。
 */
function resolveOutdentLength(source: string, lineStart: number): number {
  if (source[lineStart] === '\t') return 1
  let length = 0
  while (length < CODE_EDITOR_INDENT.length && source[lineStart + length] === ' ') length += 1
  return length
}

/**
 * 在 textarea 当前选区执行缩进或反向缩进。
 * @param source 编辑器完整文本。
 * @param rawSelectionStart 原始选区起点。
 * @param rawSelectionEnd 原始选区终点。
 * @param direction 缩进方向。
 * @returns 更新后的文本和选区。
 */
export function applyCodeEditorIndent(
  source: string,
  rawSelectionStart: number,
  rawSelectionEnd: number,
  direction: CodeEditorIndentDirection,
): CodeEditorIndentResult {
  const selectionStart = clampSelection(Math.min(rawSelectionStart, rawSelectionEnd), source.length)
  const selectionEnd = clampSelection(Math.max(rawSelectionStart, rawSelectionEnd), source.length)

  if (direction === 'indent' && selectionStart === selectionEnd) {
    return {
      value: `${source.slice(0, selectionStart)}${CODE_EDITOR_INDENT}${source.slice(selectionEnd)}`,
      selectionStart: selectionStart + CODE_EDITOR_INDENT.length,
      selectionEnd: selectionEnd + CODE_EDITOR_INDENT.length,
    }
  }

  const firstLineStart = resolveLineStart(source, selectionStart)
  const selectionEndsAfterNewline = selectionEnd > selectionStart && source[selectionEnd - 1] === '\n'
  const effectiveSelectionEnd = selectionEndsAfterNewline ? selectionEnd - 1 : selectionEnd
  const lineStarts = [firstLineStart]
  let newlineIndex = source.indexOf('\n', firstLineStart)
  while (newlineIndex >= 0 && newlineIndex < effectiveSelectionEnd) {
    lineStarts.push(newlineIndex + 1)
    newlineIndex = source.indexOf('\n', newlineIndex + 1)
  }

  if (direction === 'indent') {
    let value = source
    for (const lineStart of [...lineStarts].reverse()) {
      value = `${value.slice(0, lineStart)}${CODE_EDITOR_INDENT}${value.slice(lineStart)}`
    }
    return {
      value,
      selectionStart: selectionStart + CODE_EDITOR_INDENT.length,
      selectionEnd: selectionEnd + lineStarts.length * CODE_EDITOR_INDENT.length,
    }
  }

  const removals = lineStarts
    .map((lineStart) => ({ lineStart, length: resolveOutdentLength(source, lineStart) }))
    .filter((removal) => removal.length > 0)
  let value = source
  for (const removal of [...removals].reverse()) {
    value = `${value.slice(0, removal.lineStart)}${value.slice(removal.lineStart + removal.length)}`
  }
  const removedBeforeStart = removals.reduce((total, removal) => (
    removal.lineStart < selectionStart
      ? total + Math.min(removal.length, selectionStart - removal.lineStart)
      : total
  ), 0)
  const removedBeforeEnd = removals.reduce((total, removal) => (
    removal.lineStart < selectionEnd
      ? total + Math.min(removal.length, selectionEnd - removal.lineStart)
      : total
  ), 0)
  return {
    value,
    selectionStart: selectionStart - removedBeforeStart,
    selectionEnd: selectionEnd - removedBeforeEnd,
  }
}
