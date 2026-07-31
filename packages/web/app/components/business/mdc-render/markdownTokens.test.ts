import { marked } from 'marked'
import { describe, expect, it } from 'vitest'
import { normalizeMarkdownImageSrc, normalizeMarkdownLinkHref, normalizeMarkdownTokens } from './markdownTokens'

describe('MDC Markdown Token 归一化', () => {
  it('保留安全链接并拒绝危险协议', () => {
    expect(normalizeMarkdownLinkHref('/demo?module=components')).toBe('/demo?module=components')
    expect(normalizeMarkdownLinkHref('https://example.com/docs')).toBe('https://example.com/docs')
    expect(normalizeMarkdownLinkHref('mailto:hello@example.com')).toBe('mailto:hello@example.com')
    expect(normalizeMarkdownLinkHref('javascript:alert(1)')).toBeNull()
    expect(normalizeMarkdownLinkHref('data:text/html,test')).toBeNull()
    expect(normalizeMarkdownLinkHref('//example.com/path')).toBeNull()
    expect(normalizeMarkdownLinkHref('https://example.com/\nnext')).toBeNull()
  })

  it('将原始 HTML 降级为纯文本节点', () => {
    const nodes = normalizeMarkdownTokens(marked.lexer('<script>alert("blocked")</script>'))

    const serializedNodes = JSON.stringify(nodes)

    expect(serializedNodes).toContain('<script>alert(\\"blocked\\")</script>')
    expect(nodes.some(node => node.type === 'text' || node.type === 'paragraph')).toBe(true)
  })

  it('保留安全图片并拒绝危险图片协议', () => {
    expect(normalizeMarkdownImageSrc('/assets/preview.png')).toBe('/assets/preview.png')
    expect(normalizeMarkdownImageSrc('https://example.com/image.png')).toBe('https://example.com/image.png')
    expect(normalizeMarkdownImageSrc('javascript:alert(1)')).toBeNull()
    expect(normalizeMarkdownImageSrc('data:image/png;base64,test')).toBeNull()
    expect(normalizeMarkdownImageSrc('file:///tmp/image.png')).toBeNull()
    expect(normalizeMarkdownImageSrc('//example.com/image.png')).toBeNull()
    expect(normalizeMarkdownImageSrc('https://example.com/image.png\nnext')).toBeNull()

    const nodes = normalizeMarkdownTokens(marked.lexer('![Preview](https://example.com/image.png "预览图")\n\n![Blocked](data:image/png;base64,test)'))
    expect(JSON.stringify(nodes)).toContain('"type":"image"')
    expect(JSON.stringify(nodes)).toContain('https://example.com/image.png')
    expect(JSON.stringify(nodes)).toContain('预览图')
    expect(JSON.stringify(nodes)).toContain('Blocked')
    expect(JSON.stringify(nodes)).not.toContain('data:image/png')
  })

  it('保留 GFM 表格、删除线和代码块结构', () => {
    const nodes = normalizeMarkdownTokens(marked.lexer('| 能力 | 状态 |\n| --- | ---: |\n| ~~HTML~~ | `blocked` |\n\n```ts\nconst safe = true\n```', { gfm: true }))

    expect(nodes.some(node => node.type === 'table')).toBe(true)
    expect(nodes).toContainEqual({ type: 'codeBlock', value: 'const safe = true', language: 'ts' })
    expect(JSON.stringify(nodes)).toContain('deletion')
    expect(JSON.stringify(nodes)).toContain('inlineCode')
  })
})
