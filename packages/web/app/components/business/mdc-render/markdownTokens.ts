import type { Token, Tokens } from 'marked'

/** Markdown 标题支持的层级。 */
export type MarkdownHeadingDepth = 1 | 2 | 3 | 4 | 5 | 6

/** Markdown 表格单元格支持的对齐方式。 */
export type MarkdownTableAlign = 'left' | 'center' | 'right' | null

/** Markdown 纯文本节点。 */
export interface MarkdownTextNode {
  /** 节点类型。 */
  type: 'text'
  /** 已转义的文本内容。 */
  value: string
}

/** 包含行内子节点的 Markdown 节点。 */
export interface MarkdownChildrenNode {
  /** 支持的容器节点类型。 */
  type: 'paragraph' | 'strong' | 'emphasis' | 'deletion' | 'blockquote'
  /** 受控渲染的子节点。 */
  children: MarkdownRenderNode[]
}

/** Markdown 标题节点。 */
export interface MarkdownHeadingNode {
  /** 节点类型。 */
  type: 'heading'
  /** 标题层级。 */
  depth: MarkdownHeadingDepth
  /** 标题中的行内节点。 */
  children: MarkdownRenderNode[]
}

/** Markdown 行内代码节点。 */
export interface MarkdownInlineCodeNode {
  /** 节点类型。 */
  type: 'inlineCode'
  /** 代码内容。 */
  value: string
}

/** Markdown 代码块节点。 */
export interface MarkdownCodeBlockNode {
  /** 节点类型。 */
  type: 'codeBlock'
  /** 代码内容。 */
  value: string
  /** 可选的语言标识。 */
  language: string
}

/** Markdown 换行或分隔线节点。 */
export interface MarkdownBreakNode {
  /** 节点类型。 */
  type: 'lineBreak' | 'horizontalRule'
}

/** Markdown 安全链接节点。 */
export interface MarkdownLinkNode {
  /** 节点类型。 */
  type: 'link'
  /** 通过安全校验的地址，危险地址为 null。 */
  href: string | null
  /** 链接标题。 */
  title: string
  /** 链接中的行内节点。 */
  children: MarkdownRenderNode[]
}

/** Markdown 安全图片节点。 */
export interface MarkdownImageNode {
  /** 节点类型。 */
  type: 'image'
  /** 通过安全校验的图片地址。 */
  src: string
  /** 图片替代文本。 */
  alt: string
  /** 图片标题。 */
  title: string
}

/** Markdown 列表节点。 */
export interface MarkdownListNode {
  /** 节点类型。 */
  type: 'list'
  /** 是否为有序列表。 */
  ordered: boolean
  /** 有序列表的起始序号。 */
  start?: number
  /** 每个列表项对应的受控节点。 */
  items: MarkdownRenderNode[][]
}

/** Markdown 表格单元格。 */
export interface MarkdownTableCell {
  /** 单元格对齐方式。 */
  align: MarkdownTableAlign
  /** 单元格中的行内节点。 */
  children: MarkdownRenderNode[]
}

/** Markdown 表格节点。 */
export interface MarkdownTableNode {
  /** 节点类型。 */
  type: 'table'
  /** 表头单元格。 */
  header: MarkdownTableCell[]
  /** 表格数据行。 */
  rows: MarkdownTableCell[][]
}

/** MDC 渲染器允许输出的受控节点。 */
export type MarkdownRenderNode =
  | MarkdownTextNode
  | MarkdownChildrenNode
  | MarkdownHeadingNode
  | MarkdownInlineCodeNode
  | MarkdownCodeBlockNode
  | MarkdownBreakNode
  | MarkdownLinkNode
  | MarkdownImageNode
  | MarkdownListNode
  | MarkdownTableNode

/**
 * 将任意标题层级约束到 HTML 支持的范围。
 *
 * @param depth marked 解析出的标题层级。
 * @returns 1 到 6 之间的标题层级。
 */
function normalizeHeadingDepth(depth: number): MarkdownHeadingDepth {
  return Math.min(6, Math.max(1, depth)) as MarkdownHeadingDepth
}

/**
 * 校验 Markdown 链接，只允许 HTTP、邮件和本地相对地址。
 *
 * @param href marked 解析出的链接地址。
 * @returns 可安全写入锚点的地址，危险地址返回 null。
 */
export function normalizeMarkdownLinkHref(href: string): string | null {
  const normalizedHref = href.trim()
  const hasControlCharacter = Array.from(normalizedHref).some((character) => {
    const characterCode = character.charCodeAt(0)
    return characterCode <= 31 || characterCode === 127
  })

  if (!normalizedHref || hasControlCharacter) return null
  if (/^(?:https?:|mailto:)/i.test(normalizedHref)) return normalizedHref
  if (/^(?:\/\/|\\\\)/.test(normalizedHref)) return null
  if (/^[a-z][a-z\d+.-]*:/i.test(normalizedHref)) return null
  return normalizedHref
}

/**
 * 校验 Markdown 图片地址，仅允许 HTTP(S) 和站内相对路径。
 *
 * @param src marked 解析出的图片地址。
 * @returns 可安全写入图片节点的地址，危险地址返回 null。
 */
export function normalizeMarkdownImageSrc(src: string): string | null {
  const normalizedSrc = src.trim()
  const hasControlCharacter = Array.from(normalizedSrc).some((character) => {
    const characterCode = character.charCodeAt(0)
    return characterCode <= 31 || characterCode === 127
  })

  if (!normalizedSrc || hasControlCharacter) return null
  if (/^https?:/i.test(normalizedSrc)) return normalizedSrc
  if (/^(?:\/\/|\\\\)/.test(normalizedSrc)) return null
  if (/^[a-z][a-z\d+.-]*:/i.test(normalizedSrc)) return null
  return normalizedSrc
}

/**
 * 将 marked 表格单元格转换为受控节点。
 *
 * @param cell marked 表格单元格。
 * @returns MDC 表格单元格。
 */
function normalizeTableCell(cell: Tokens.TableCell): MarkdownTableCell {
  return {
    align: cell.align,
    children: normalizeMarkdownTokens(cell.tokens),
  }
}

/**
 * 将单个 marked Token 转换为受控节点。
 *
 * @param token marked Token。
 * @returns 一个或多个 MDC 渲染节点。
 */
function normalizeMarkdownToken(token: Token): MarkdownRenderNode[] {
  switch (token.type) {
    case 'space':
    case 'def':
      return []
    case 'text': {
      const textToken = token as Tokens.Text
      if (textToken.tokens?.length) return normalizeMarkdownTokens(textToken.tokens)
      return [{ type: 'text', value: textToken.text }]
    }
    case 'escape':
      return [{ type: 'text', value: (token as Tokens.Escape).text }]
    case 'html':
      return [{ type: 'text', value: (token as Tokens.HTML | Tokens.Tag).text }]
    case 'paragraph':
      return [{ type: 'paragraph', children: normalizeMarkdownTokens((token as Tokens.Paragraph).tokens) }]
    case 'heading': {
      const headingToken = token as Tokens.Heading
      return [{
        type: 'heading',
        depth: normalizeHeadingDepth(headingToken.depth),
        children: normalizeMarkdownTokens(headingToken.tokens),
      }]
    }
    case 'strong':
      return [{ type: 'strong', children: normalizeMarkdownTokens((token as Tokens.Strong).tokens) }]
    case 'em':
      return [{ type: 'emphasis', children: normalizeMarkdownTokens((token as Tokens.Em).tokens) }]
    case 'del':
      return [{ type: 'deletion', children: normalizeMarkdownTokens((token as Tokens.Del).tokens) }]
    case 'codespan':
      return [{ type: 'inlineCode', value: (token as Tokens.Codespan).text }]
    case 'code': {
      const codeToken = token as Tokens.Code
      return [{ type: 'codeBlock', value: codeToken.text, language: codeToken.lang || '' }]
    }
    case 'br':
      return [{ type: 'lineBreak' }]
    case 'hr':
      return [{ type: 'horizontalRule' }]
    case 'blockquote':
      return [{ type: 'blockquote', children: normalizeMarkdownTokens((token as Tokens.Blockquote).tokens) }]
    case 'link': {
      const linkToken = token as Tokens.Link
      return [{
        type: 'link',
        href: normalizeMarkdownLinkHref(linkToken.href),
        title: linkToken.title || '',
        children: normalizeMarkdownTokens(linkToken.tokens),
      }]
    }
    case 'image': {
      const imageToken = token as Tokens.Image
      /** 经过安全校验的图片地址。 */
      const src = normalizeMarkdownImageSrc(imageToken.href)
      if (!src) return imageToken.text ? [{ type: 'text', value: imageToken.text }] : []
      return [{
        type: 'image',
        src,
        alt: imageToken.text,
        title: imageToken.title || '',
      }]
    }
    case 'checkbox':
      return [{ type: 'text', value: (token as Tokens.Checkbox).checked ? '[x] ' : '[ ] ' }]
    case 'list': {
      const listToken = token as Tokens.List
      const start = typeof listToken.start === 'number' ? listToken.start : undefined
      return [{
        type: 'list',
        ordered: listToken.ordered,
        ...(start === undefined ? {} : { start }),
        items: listToken.items.map(item => normalizeMarkdownTokens(item.tokens)),
      }]
    }
    case 'list_item':
      return normalizeMarkdownTokens((token as Tokens.ListItem).tokens)
    case 'table': {
      const tableToken = token as Tokens.Table
      return [{
        type: 'table',
        header: tableToken.header.map(normalizeTableCell),
        rows: tableToken.rows.map(row => row.map(normalizeTableCell)),
      }]
    }
    default:
      return token.raw ? [{ type: 'text', value: token.raw }] : []
  }
}

/**
 * 将 marked Token 列表归一化为 MDC 允许渲染的节点。
 *
 * @param tokens marked Token 列表。
 * @returns 受控的 MDC 渲染节点列表。
 */
export function normalizeMarkdownTokens(tokens: readonly Token[]): MarkdownRenderNode[] {
  return tokens.flatMap(normalizeMarkdownToken)
}
