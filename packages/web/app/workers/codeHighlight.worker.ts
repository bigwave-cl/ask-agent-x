import type { LanguageFn } from 'highlight.js'
import type { CodeHighlightLanguage, CodeHighlightSegment } from '../lib/codeHighlight'
import type { CodeHighlightFailure, CodeHighlightRequest, CodeHighlightSuccess } from '../lib/codeHighlightProtocol'

/** lowlight 实例的最小运行时接口。 */
interface LowlightInstance {
  /** 使用指定语言生成受控 HAST。 */
  highlight: (language: string, source: string) => HighlightRoot
  /** 注册一个 Highlight.js grammar。 */
  register: (name: string, grammar: LanguageFn) => undefined
  /** 判断语言是否已经注册。 */
  registered: (language: string) => boolean
}

/** lowlight HAST 节点的最小结构。 */
interface HighlightNode {
  /** HAST 节点类型。 */
  type: string
  /** 文本节点内容。 */
  value?: string
  /** 元素标签名。 */
  tagName?: string
  /** 元素属性。 */
  properties?: { className?: unknown }
  /** 子节点。 */
  children?: HighlightNode[]
}

/** lowlight 返回的根节点。 */
interface HighlightRoot extends HighlightNode {
  /** 根节点类型。 */
  type: 'root'
  /** 代码高亮子节点。 */
  children: HighlightNode[]
}

/** Worker 作用域的最小消息接口。 */
interface HighlightWorkerScope {
  /** 接收主线程请求。 */
  onmessage: ((event: MessageEvent<CodeHighlightRequest>) => void) | null
  /** 向主线程发送结果。 */
  postMessage: (message: CodeHighlightSuccess | CodeHighlightFailure) => void
}

/** 每种语言对应的异步 grammar loader。 */
const grammarLoaders: Record<CodeHighlightLanguage, () => Promise<{ default: LanguageFn }>> = {
  bash: () => import('highlight.js/lib/languages/bash'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  go: () => import('highlight.js/lib/languages/go'),
  ini: () => import('highlight.js/lib/languages/ini'),
  java: () => import('highlight.js/lib/languages/java'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  php: () => import('highlight.js/lib/languages/php'),
  python: () => import('highlight.js/lib/languages/python'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  rust: () => import('highlight.js/lib/languages/rust'),
  scss: () => import('highlight.js/lib/languages/scss'),
  sql: () => import('highlight.js/lib/languages/sql'),
  swift: () => import('highlight.js/lib/languages/swift'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  xml: () => import('highlight.js/lib/languages/xml'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
}
/** 需要在同一语法中嵌套解析的依赖语言。 */
const grammarDependencies: Partial<Record<CodeHighlightLanguage, CodeHighlightLanguage[]>> = {
  dockerfile: ['bash'],
  php: ['xml'],
  xml: ['css', 'javascript'],
}

/** 正在创建或已经创建的 lowlight 实例。 */
let enginePromise: Promise<LowlightInstance> | undefined
/** 每种语言当前正在执行的注册任务。 */
const grammarPromises = new Map<CodeHighlightLanguage, Promise<void>>()
/** Worker 全局作用域。 */
const workerScope = self as unknown as HighlightWorkerScope

/**
 * 获取按需创建的 lowlight 实例。
 *
 * @returns 可复用的 lowlight 实例。
 */
function getEngine(): Promise<LowlightInstance> {
  enginePromise ??= import('lowlight').then(({ createLowlight }) => createLowlight() as LowlightInstance)
  return enginePromise
}

/**
 * 确保目标语言已经在 lowlight 中注册。
 *
 * @param language 标准代码语言。
 */
async function ensureLanguage(language: CodeHighlightLanguage): Promise<void> {
  const existingPromise = grammarPromises.get(language)
  if (existingPromise) return existingPromise

  const languages = [language, ...(grammarDependencies[language] ?? [])]
  const grammarPromise = Promise.all([getEngine(), ...languages.map((name) => grammarLoaders[name]())])
    .then(([engine, ...grammarModules]) => {
      languages.forEach((name, index) => {
        const grammarModule = grammarModules[index]
        if (grammarModule && !engine.registered(name)) engine.register(name, grammarModule.default)
      })
    })
    .catch((error) => {
      grammarPromises.delete(language)
      throw error
    })

  grammarPromises.set(language, grammarPromise)
  return grammarPromise
}

/**
 * 从 className 属性提取受控 Highlight.js scope。
 *
 * @param className lowlight HAST 的 className 属性。
 * @returns 仅包含 hljs-* 的 class 列表。
 */
function getAllowedScopes(className: unknown): string[] {
  if (!Array.isArray(className)) return []
  return className.filter((scope): scope is string => typeof scope === 'string' && /^hljs-[a-z\d_-]+$/iu.test(scope))
}

/**
 * 将 lowlight HAST 展平为 Vue 可以安全渲染的文本片段。
 *
 * @param nodes 当前 HAST 节点。
 * @param inheritedScopes 父级继承的语义作用域。
 * @param segments 输出片段。
 * @returns 节点是否全部符合受控结构。
 */
function flattenHighlightNodes(
  nodes: readonly HighlightNode[],
  inheritedScopes: readonly string[],
  segments: CodeHighlightSegment[],
): boolean {
  for (const node of nodes) {
    if (node.type === 'text') {
      if (typeof node.value !== 'string') return false
      if (node.value) segments.push({ value: node.value, scopes: [...inheritedScopes] })
      continue
    }

    if (node.type !== 'element' || node.tagName !== 'span' || !Array.isArray(node.children)) return false
    const scopes = [...inheritedScopes, ...getAllowedScopes(node.properties?.className)]
    if (!flattenHighlightNodes(node.children, scopes, segments)) return false
  }

  return true
}

/**
 * 执行一次语法高亮并发送结果。
 *
 * @param request 主线程高亮请求。
 */
async function handleHighlight(request: CodeHighlightRequest): Promise<void> {
  const startedAt = performance.now()

  try {
    await ensureLanguage(request.language)
    const engine = await getEngine()
    const tree = engine.highlight(request.language, request.source)
    const segments: CodeHighlightSegment[] = []

    if (!flattenHighlightNodes(tree.children, [], segments)) {
      workerScope.postMessage({
        type: 'highlight-failure',
        requestId: request.requestId,
        consumerId: request.consumerId,
        reason: 'invalid-result',
      })
      return
    }

    workerScope.postMessage({
      type: 'highlight-success',
      requestId: request.requestId,
      consumerId: request.consumerId,
      language: request.language,
      segments,
      durationMs: performance.now() - startedAt,
    })
  }
  catch {
    workerScope.postMessage({
      type: 'highlight-failure',
      requestId: request.requestId,
      consumerId: request.consumerId,
      reason: 'runtime-error',
    })
  }
}

workerScope.onmessage = (event) => {
  if (event.data.type === 'highlight') void handleHighlight(event.data)
}
