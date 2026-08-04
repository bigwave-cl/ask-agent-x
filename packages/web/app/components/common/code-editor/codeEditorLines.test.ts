import { describe, expect, it } from 'vitest'
import { createCodeEditorLines, resolveCodeEditorLineIndex } from './codeEditorLines'

describe('createCodeEditorLines', () => {
  it('为空内容保留第一行', () => {
    expect(createCodeEditorLines([{ value: '', scopes: [] }])).toEqual([{ segments: [] }])
  })

  it('在保留高亮作用域的同时拆分跨行片段', () => {
    expect(createCodeEditorLines([
      { value: 'const ', scopes: ['hljs-keyword'] },
      { value: 'first\nsecond', scopes: ['hljs-title'] },
    ])).toEqual([
      { segments: [{ value: 'const ', scopes: ['hljs-keyword'] }, { value: 'first', scopes: ['hljs-title'] }] },
      { segments: [{ value: 'second', scopes: ['hljs-title'] }] },
    ])
  })

  it('为连续换行和末尾换行生成可编号空行', () => {
    expect(createCodeEditorLines([{ value: 'first\n\n', scopes: [] }])).toEqual([
      { segments: [{ value: 'first', scopes: [] }] },
      { segments: [] },
      { segments: [] },
    ])
  })

  it('根据光标偏移解析当前逻辑行并限制越界位置', () => {
    const source = 'first\nsecond\nthird'
    expect(resolveCodeEditorLineIndex(source, 0)).toBe(0)
    expect(resolveCodeEditorLineIndex(source, 6)).toBe(1)
    expect(resolveCodeEditorLineIndex(source, source.length)).toBe(2)
    expect(resolveCodeEditorLineIndex(source, Number.POSITIVE_INFINITY)).toBe(0)
  })
})
