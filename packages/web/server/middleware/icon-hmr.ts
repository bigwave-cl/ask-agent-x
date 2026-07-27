import { getIcons } from '@iconify/utils'
import { loadCustomCollection } from '@nuxt/icon/utils'
import { parseLocalIconRequest } from '../utils/localIcon.js'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) return

  const request = parseLocalIconRequest(
    getRequestURL(event).pathname,
    event.method,
    getQuery(event).icons,
  )
  if (!request) return

  const config = useRuntimeConfig(event)
  const directory = config.askxIconDirectories[request.category]
  const collection = await loadCustomCollection({ prefix: request.prefix, dir: directory }, directory)
  const icons = getIcons(collection, request.icons)
  if (!icons) return sendNoContent(event, 204)

  setResponseHeader(event, 'cache-control', 'no-store')
  return icons
})
