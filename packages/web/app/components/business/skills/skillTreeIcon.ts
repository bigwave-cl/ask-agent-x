import type { ManagedSkillTreeNode } from '@askx/module-skills/skill-types'
import type { AskxIconName } from '@/lib/iconCatalog'

/** 不改变底层文件类型的模板后缀。 */
const templateSuffixes = ['.example', '.sample', '.template'] as const
/** 脚本与程序源码扩展名。 */
const codeExtensions = new Set(['c', 'cc', 'cjs', 'cpp', 'cs', 'go', 'java', 'js', 'jsx', 'kt', 'kts', 'mjs', 'php', 'py', 'rb', 'rs', 'sql', 'swift', 'ts', 'tsx'])
/** 配置文件扩展名。 */
const configExtensions = new Set(['env', 'ini', 'toml', 'yaml', 'yml'])
/** HTML 与结构化标记扩展名。 */
const htmlExtensions = new Set(['html', 'svg', 'vue', 'xml'])
/** 图片文件扩展名。 */
const imageExtensions = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp'])
/** Shell 脚本扩展名。 */
const shellExtensions = new Set(['bash', 'sh', 'zsh'])
/** 样式文件扩展名。 */
const styleExtensions = new Set(['css', 'less', 'sass', 'scss'])
/** 普通文档扩展名。 */
const textExtensions = new Set(['csv', 'txt'])

/** 提取文件真实语义扩展名。 */
function resolveExtension(name: string): string {
  const normalizedName = name.toLowerCase()
  const templateSuffix = templateSuffixes.find((suffix) => normalizedName.endsWith(suffix))
  const semanticName = templateSuffix ? normalizedName.slice(0, -templateSuffix.length) : normalizedName
  return semanticName.includes('.') ? semanticName.slice(semanticName.lastIndexOf('.') + 1) : ''
}

/**
 * 根据 Skill 目录节点语义选择本地图标。
 *
 * @param name 文件或目录名称。
 * @param kind 节点类型。
 * @param expanded 目录是否处于展开状态。
 * @returns 对应的 AskX 本地图标名称。
 */
export function resolveSkillTreeIcon(name: string, kind: ManagedSkillTreeNode['kind'], expanded = false): AskxIconName {
  if (kind === 'directory') return expanded ? 'askx-objects:folder-open' : 'askx-objects:folder'
  if (kind === 'symlink') return 'askx-objects:file-link'

  const normalizedName = name.toLowerCase()
  const extension = resolveExtension(normalizedName)
  if (normalizedName === '.gitignore' || normalizedName === '.npmignore' || normalizedName.startsWith('.env')) return 'askx-objects:file-config'
  if (extension === 'md' || extension === 'mdx') return 'askx-objects:file-markdown'
  if (extension === 'json' || extension === 'jsonc') return 'askx-objects:file-json'
  if (codeExtensions.has(extension)) return 'askx-objects:file-code'
  if (configExtensions.has(extension)) return 'askx-objects:file-config'
  if (htmlExtensions.has(extension)) return extension === 'svg' ? 'askx-objects:file-image' : 'askx-objects:file-html'
  if (imageExtensions.has(extension)) return 'askx-objects:file-image'
  if (shellExtensions.has(extension)) return 'askx-objects:file-shell'
  if (styleExtensions.has(extension)) return 'askx-objects:file-style'
  if (textExtensions.has(extension)) return 'askx-objects:file-text'
  return 'askx-objects:file'
}
