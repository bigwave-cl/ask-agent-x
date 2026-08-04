/** 支持按需加载 grammar 的标准代码语言。 */
export type CodeHighlightLanguage =
  | 'bash'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'css'
  | 'dockerfile'
  | 'go'
  | 'ini'
  | 'java'
  | 'javascript'
  | 'json'
  | 'kotlin'
  | 'markdown'
  | 'php'
  | 'python'
  | 'ruby'
  | 'rust'
  | 'scss'
  | 'sql'
  | 'swift'
  | 'typescript'
  | 'xml'
  | 'yaml'

/** 异步代码高亮的运行状态。 */
export type CodeHighlightStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'skipped' | 'failed'

/** 可由 Vue 安全渲染的单段代码文本。 */
export interface CodeHighlightSegment {
  /** 代码文本。 */
  value: string
  /** 仅包含 hljs-* 的受控语义作用域。 */
  scopes: string[]
}

/** 代码高亮的受控结果。 */
export interface CodeHighlightResult {
  /** 标准化后的语言；纯文本为空字符串。 */
  language: CodeHighlightLanguage | ''
  /** 是否已经完成语法高亮。 */
  highlighted: boolean
  /** 受控代码文本片段。 */
  segments: CodeHighlightSegment[]
}

/** 高亮任务跳过的原因。 */
export type CodeHighlightSkipReason = 'empty' | 'unsupported' | 'too-large' | 'too-many-lines' | null

/** 单次允许高亮的最大 UTF-8 字节数。 */
export const MAX_HIGHLIGHT_BYTES = 128 * 1024
/** 单次允许高亮的最大行数。 */
export const MAX_HIGHLIGHT_LINES = 4000

/** 语言别名到标准语言的映射。 */
const languageAliases: Readonly<Record<string, CodeHighlightLanguage>> = {
  bash: 'bash',
  c: 'c',
  cc: 'cpp',
  cjs: 'javascript',
  cpp: 'cpp',
  cs: 'csharp',
  csharp: 'csharp',
  css: 'css',
  docker: 'dockerfile',
  dockerfile: 'dockerfile',
  env: 'ini',
  go: 'go',
  html: 'xml',
  ini: 'ini',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  json: 'json',
  jsonc: 'json',
  jsx: 'javascript',
  kotlin: 'kotlin',
  kt: 'kotlin',
  kts: 'kotlin',
  markdown: 'markdown',
  md: 'markdown',
  mdx: 'markdown',
  mjs: 'javascript',
  php: 'php',
  py: 'python',
  python: 'python',
  rb: 'ruby',
  ruby: 'ruby',
  rs: 'rust',
  rust: 'rust',
  scss: 'scss',
  sh: 'bash',
  shell: 'bash',
  sql: 'sql',
  svg: 'xml',
  swift: 'swift',
  toml: 'ini',
  ts: 'typescript',
  tsx: 'typescript',
  typescript: 'typescript',
  vue: 'xml',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
}

/** 不需要语法高亮的纯文本别名。 */
const plaintextAliases = new Set(['', 'plain', 'plaintext', 'text', 'txt'])
/** 文件名中不改变底层语法类型的模板后缀。 */
const templateSuffixes = ['.example', '.sample', '.template'] as const

/**
 * 提取 Markdown fenced code 或调用方传入语言中的首个标识。
 *
 * @param language 原始语言字符串。
 * @returns 适合查询映射表的小写语言标识。
 */
function normalizeLanguageToken(language: string): string {
  return language.trim().toLowerCase().split(/[\s,{]/u, 1)[0] ?? ''
}

/**
 * 从文件名提取可用于识别语法的扩展名或特殊文件名。
 *
 * @param filename 文件名或相对路径。
 * @returns 小写扩展名；无扩展名时返回完整文件名。
 */
function getFilenameLanguageToken(filename: string): string {
  const basename = (filename.trim().split(/[\\/]/u).pop() ?? '').toLowerCase()
  const templateSuffix = templateSuffixes.find((suffix) => basename.endsWith(suffix))
  const semanticName = templateSuffix ? basename.slice(0, -templateSuffix.length) : basename
  const extensionIndex = semanticName.lastIndexOf('.')
  return extensionIndex > 0 ? semanticName.slice(extensionIndex + 1) : semanticName
}

/**
 * 根据显式语言和文件名解析标准高亮语言。
 *
 * @param language 调用方提供的语言。
 * @param filename 用于兜底识别的文件名。
 * @returns 标准语言；不支持或纯文本返回 null。
 */
export function resolveCodeHighlightLanguage(language = '', filename = ''): CodeHighlightLanguage | null {
  const languageToken = normalizeLanguageToken(language)
  if (plaintextAliases.has(languageToken)) {
    const extension = getFilenameLanguageToken(filename)
    return languageAliases[extension] ?? null
  }

  return languageAliases[languageToken] ?? languageAliases[getFilenameLanguageToken(filename)] ?? null
}

/**
 * 计算代码行数，不创建额外数组。
 *
 * @param source 原始代码。
 * @returns 至少为 1 的代码行数。
 */
function countSourceLines(source: string): number {
  let lines = 1
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) lines += 1
  }
  return lines
}

/**
 * 判断当前源码是否应该跳过高亮。
 *
 * @param source 原始代码。
 * @param language 标准高亮语言。
 * @returns 跳过原因；可以高亮时返回 null。
 */
export function getCodeHighlightSkipReason(source: string, language: CodeHighlightLanguage | null): CodeHighlightSkipReason {
  if (!source) return 'empty'
  if (!language) return 'unsupported'
  if (source.length > MAX_HIGHLIGHT_BYTES || new TextEncoder().encode(source).byteLength > MAX_HIGHLIGHT_BYTES) return 'too-large'
  if (countSourceLines(source) > MAX_HIGHLIGHT_LINES) return 'too-many-lines'
  return null
}

/**
 * 创建无需异步引擎的纯文本结果。
 *
 * @param source 原始代码。
 * @param language 已解析的标准语言。
 * @returns 只包含单个安全文本片段的结果。
 */
export function createPlainCodeHighlightResult(source: string, language: CodeHighlightLanguage | null = null): CodeHighlightResult {
  return {
    language: language ?? '',
    highlighted: false,
    segments: [{ value: source, scopes: [] }],
  }
}

/**
 * 判断两组高亮作用域是否完全一致。
 * @param left 左侧作用域。
 * @param right 右侧作用域。
 * @returns 顺序和值均一致时返回 true。
 */
function areCodeHighlightScopesEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((scope, index) => scope === right[index])
}

/**
 * 向结果中追加高亮片段，并合并相邻的相同作用域。
 * @param target 接收片段的数组。
 * @param segment 待追加片段。
 */
function appendCodeHighlightSegment(target: CodeHighlightSegment[], segment: CodeHighlightSegment): void {
  if (!segment.value) return
  const previous = target.at(-1)
  if (previous && areCodeHighlightScopesEqual(previous.scopes, segment.scopes)) {
    previous.value += segment.value
    return
  }
  target.push({ value: segment.value, scopes: [...segment.scopes] })
}

/**
 * 截取一段源码对应的高亮片段。
 * @param segments 完整高亮片段。
 * @param start 截取起点。
 * @param end 截取终点。
 * @returns 保留原作用域的局部片段。
 */
function sliceCodeHighlightSegments(segments: CodeHighlightSegment[], start: number, end: number): CodeHighlightSegment[] {
  const sliced: CodeHighlightSegment[] = []
  let offset = 0
  for (const segment of segments) {
    const segmentEnd = offset + segment.value.length
    const overlapStart = Math.max(start, offset)
    const overlapEnd = Math.min(end, segmentEnd)
    if (overlapStart < overlapEnd) {
      appendCodeHighlightSegment(sliced, {
        value: segment.value.slice(overlapStart - offset, overlapEnd - offset),
        scopes: segment.scopes,
      })
    }
    offset = segmentEnd
    if (offset >= end) break
  }
  return sliced
}

/**
 * 在 Worker 返回前为新源码保留未修改区域的既有高亮样式。
 * @param previous 上一次可用的高亮结果。
 * @param source 当前编辑器源码。
 * @param language 当前标准语言。
 * @returns 文本与当前源码一致的乐观高亮结果。
 */
export function createOptimisticCodeHighlightResult(
  previous: CodeHighlightResult,
  source: string,
  language: CodeHighlightLanguage | null,
): CodeHighlightResult {
  if (!source || !language || !previous.highlighted || previous.language !== language) {
    return createPlainCodeHighlightResult(source, language)
  }

  const previousSource = previous.segments.map((segment) => segment.value).join('')
  if (previousSource === source) return previous

  const sharedLength = Math.min(previousSource.length, source.length)
  let prefixLength = 0
  while (prefixLength < sharedLength && previousSource[prefixLength] === source[prefixLength]) prefixLength += 1

  let suffixLength = 0
  while (
    suffixLength < sharedLength - prefixLength
    && previousSource[previousSource.length - suffixLength - 1] === source[source.length - suffixLength - 1]
  ) suffixLength += 1

  const segments: CodeHighlightSegment[] = []
  const prefixSegments = sliceCodeHighlightSegments(previous.segments, 0, prefixLength)
  const suffixSegments = sliceCodeHighlightSegments(
    previous.segments,
    previousSource.length - suffixLength,
    previousSource.length,
  )
  for (const segment of prefixSegments) appendCodeHighlightSegment(segments, segment)

  const middleValue = source.slice(prefixLength, source.length - suffixLength)
  const prefixScopes = prefixSegments.at(-1)?.scopes ?? []
  const suffixScopes = suffixSegments[0]?.scopes ?? []
  appendCodeHighlightSegment(segments, {
    value: middleValue,
    scopes: prefixScopes.length > 0 && areCodeHighlightScopesEqual(prefixScopes, suffixScopes) ? prefixScopes : [],
  })
  for (const segment of suffixSegments) appendCodeHighlightSegment(segments, segment)

  return {
    language,
    highlighted: true,
    segments,
  }
}
