import type { ComputedRef } from 'vue'
import type enMessages from '../../i18n/locales/en.json'

type LocaleMessages = typeof enMessages

function isMessageAst(value: object): boolean {
  return 'type' in value && 'body' in value
}

export function useMessageSection<Key extends keyof LocaleMessages>(key: Key): ComputedRef<LocaleMessages[Key]> {
  const { rt, tm } = useI18n()

  function resolveMessageTree(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(resolveMessageTree)
    if (value && typeof value === 'object') {
      if (isMessageAst(value)) return rt(value as Parameters<typeof rt>[0])
      return Object.fromEntries(Object.entries(value).map(([entryKey, child]) => [entryKey, resolveMessageTree(child)]))
    }
    return typeof value === 'string' ? rt(value) : value
  }

  return computed(() => resolveMessageTree(tm(String(key))) as LocaleMessages[Key])
}
