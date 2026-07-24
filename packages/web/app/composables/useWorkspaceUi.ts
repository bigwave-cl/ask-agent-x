import type { AskXLocale } from '@askx/core'

export function useWorkspaceUi() {
  const locale = useState<AskXLocale>('askx-workspace-locale', () => 'zh-CN')

  return { locale }
}
