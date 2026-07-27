export const STATIC_FILE_PATTERN = /\.[a-z0-9]+$/i

export function isPublicAssetRequest(path: string, method: string) {
  return method === 'GET' && (
    path.startsWith('/_nuxt/')
    || path.startsWith('/__nuxt')
    || path.startsWith('/_i18n/')
    || path.startsWith('/_askx/icon/')
    || (!path.startsWith('/_askx/') && STATIC_FILE_PATTERN.test(path))
  )
}
