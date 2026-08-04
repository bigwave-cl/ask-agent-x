import { describe, expect, it } from 'vitest'
import { applyCodeEditorIndent } from './codeEditorIndent'

describe('applyCodeEditorIndent', () => {
  it('在光标位置插入两个空格并移动光标', () => {
    expect(applyCodeEditorIndent('const value', 6, 6, 'indent')).toEqual({
      value: 'const   value',
      selectionStart: 8,
      selectionEnd: 8,
    })
  })

  it('为选中的多行统一增加缩进并保持选区内容', () => {
    expect(applyCodeEditorIndent('first\nsecond\nthird', 1, 18, 'indent')).toEqual({
      value: '  first\n  second\n  third',
      selectionStart: 3,
      selectionEnd: 24,
    })
  })

  it('选区结束在下一行起点时不额外缩进该行', () => {
    expect(applyCodeEditorIndent('first\nsecond', 0, 6, 'indent')).toEqual({
      value: '  first\nsecond',
      selectionStart: 2,
      selectionEnd: 8,
    })
  })

  it('使用 Shift+Tab 移除当前行缩进并保持光标位置', () => {
    expect(applyCodeEditorIndent('  first\nsecond', 4, 4, 'outdent')).toEqual({
      value: 'first\nsecond',
      selectionStart: 2,
      selectionEnd: 2,
    })
  })

  it('批量反向缩进时同时支持空格和制表符', () => {
    expect(applyCodeEditorIndent('  first\n\tsecond\nthird', 0, 22, 'outdent')).toEqual({
      value: 'first\nsecond\nthird',
      selectionStart: 0,
      selectionEnd: 18,
    })
  })
})
