const COLLECTION_PATTERN = /^\/_askx\/icon\/askx-(actions|navigation|status|objects|platforms)\.json$/
const ICON_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type LocalIconCategory = 'actions' | 'navigation' | 'status' | 'objects' | 'platforms'

export interface LocalIconRequest {
  category: LocalIconCategory
  prefix: `askx-${LocalIconCategory}`
  icons: string[]
}

export function parseLocalIconRequest(path: string, method: string, icons: unknown): LocalIconRequest | null {
  if (method !== 'GET' || typeof icons !== 'string') return null

  const match = path.match(COLLECTION_PATTERN)
  if (!match) return null

  const names = [...new Set(icons.split(',').filter(name => ICON_NAME_PATTERN.test(name)))].slice(0, 100)
  if (!names.length) return null

  const category = match[1] as LocalIconCategory
  return {
    category,
    prefix: `askx-${category}`,
    icons: names,
  }
}
