/** AskX 本地图标支持的分类。 */
export const askxIconCategories = ['actions', 'navigation', 'status', 'objects'] as const

/** AskX 本地图标分类。 */
export type AskxIconCategory = typeof askxIconCategories[number]

/** AskX 本地图标分类的展示名称。 */
export const askxIconCategoryLabels: Record<AskxIconCategory, string> = {
  actions: '操作',
  navigation: '导航',
  status: '状态',
  objects: '对象',
}

/** AskX 项目当前可用的本地图标清单。 */
export const askxIconCatalog = [
  { name: 'askx-actions:close', category: 'actions' },
  { name: 'askx-actions:copy', category: 'actions' },
  { name: 'askx-actions:delete', category: 'actions' },
  { name: 'askx-actions:erase', category: 'actions' },
  { name: 'askx-actions:preview', category: 'actions' },
  { name: 'askx-actions:hide', category: 'actions' },
  { name: 'askx-actions:refresh', category: 'actions' },
  { name: 'askx-actions:settings', category: 'actions' },
  { name: 'askx-actions:external-link', category: 'actions' },
  { name: 'askx-actions:confirm', category: 'actions' },
  { name: 'askx-actions:adjust', category: 'actions' },
  { name: 'askx-actions:download', category: 'actions' },
  { name: 'askx-actions:upload', category: 'actions' },
  { name: 'askx-actions:more', category: 'actions' },
  { name: 'askx-actions:search', category: 'actions' },
  { name: 'askx-navigation:arrow-up', category: 'navigation' },
  { name: 'askx-navigation:arrow-down', category: 'navigation' },
  { name: 'askx-navigation:arrow-left', category: 'navigation' },
  { name: 'askx-navigation:arrow-right', category: 'navigation' },
  { name: 'askx-navigation:chevron-down', category: 'navigation' },
  { name: 'askx-navigation:chevron-left', category: 'navigation' },
  { name: 'askx-navigation:chevron-right', category: 'navigation' },
  { name: 'askx-navigation:enter', category: 'navigation' },
  { name: 'askx-status:check', category: 'status' },
  { name: 'askx-status:warning', category: 'status' },
  { name: 'askx-status:info', category: 'status' },
  { name: 'askx-status:loading', category: 'status' },
  { name: 'askx-status:lock', category: 'status' },
  { name: 'askx-status:error', category: 'status' },
  { name: 'askx-status:star', category: 'status' },
  { name: 'askx-objects:agent', category: 'objects' },
  { name: 'askx-objects:skills', category: 'objects' },
  { name: 'askx-objects:layout', category: 'objects' },
  { name: 'askx-objects:layers', category: 'objects' },
  { name: 'askx-objects:model', category: 'objects' },
  { name: 'askx-objects:file', category: 'objects' },
  { name: 'askx-objects:language', category: 'objects' },
  { name: 'askx-objects:palette', category: 'objects' },
  { name: 'askx-objects:map', category: 'objects' },
  { name: 'askx-objects:pointer', category: 'objects' },
  { name: 'askx-objects:schedule', category: 'objects' },
  { name: 'askx-objects:selection', category: 'objects' },
  { name: 'askx-objects:branch', category: 'objects' },
] as const satisfies ReadonlyArray<{
  name: `askx-${AskxIconCategory}:${string}`
  category: AskxIconCategory
}>

/** AskX 本地图标名称。 */
export type AskxIconName = typeof askxIconCatalog[number]['name']

/**
 * 从完整图标名称中取得对应的 SVG 文件名。
 *
 * @param name AskX 完整图标名称。
 * @returns 不含扩展名的 SVG 文件名。
 */
export function getAskxIconFileName(name: AskxIconName) {
  return name.slice(name.indexOf(':') + 1)
}
