import { marked } from 'marked'
import { describe, expect, it } from 'vitest'
import { normalizeMarkdownLinkHref, normalizeMarkdownTokens } from './markdownTokens'

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

  it('将原始 HTML 和图片降级为纯文本节点', () => {
    const nodes = normalizeMarkdownTokens(marked.lexer('<script>alert("blocked")</script>\n\n![Preview](https://example.com/image.png)'))

    const serializedNodes = JSON.stringify(nodes)

    expect(serializedNodes).toContain('<script>alert(\\"blocked\\")</script>')
    expect(serializedNodes).toContain('Preview')
    expect(serializedNodes).not.toContain('https://example.com/image.png')
    expect(nodes.some(node => node.type === 'text' || node.type === 'paragraph')).toBe(true)
  })

  it('保留 GFM 表格、删除线和代码块结构', () => {
    const nodes = normalizeMarkdownTokens(marked.lexer('| 能力 | 状态 |\n| --- | ---: |\n| ~~HTML~~ | `blocked` |\n\n```ts\nconst safe = true\n```', { gfm: true }))

    expect(nodes.some(node => node.type === 'table')).toBe(true)
    expect(nodes).toContainEqual({ type: 'codeBlock', value: 'const safe = true', language: 'ts' })
    expect(JSON.stringify(nodes)).toContain('deletion')
    expect(JSON.stringify(nodes)).toContain('inlineCode')
  })
})
