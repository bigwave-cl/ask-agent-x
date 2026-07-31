import type { SkillPlatformId } from '@askx/module-skills/skill-types'
import type { AskxIconName } from './iconCatalog'

/** Agent 平台在界面中的品牌信息。 */
export interface SkillPlatformPresentation {
  /** 面向用户的平台名称。 */
  name: string
  /** 平台对应的本地品牌图标。 */
  icon: AskxIconName
}

/** Skills 当前支持平台的统一品牌信息。 */
export const skillPlatformPresentations: Record<SkillPlatformId, SkillPlatformPresentation> = {
  codex: { name: 'ChatGPT / Codex', icon: 'askx-platforms:chatgpt-codex' },
  claude: { name: 'Claude Code', icon: 'askx-platforms:claude-code' },
  cursor: { name: 'Cursor', icon: 'askx-platforms:cursor' },
}

/**
 * 获取扫描位置对应的平台品牌信息。
 *
 * @param platform 扫描位置的平台标识。
 * @returns 平台名称和本地图标。
 */
export function getSkillPlatformPresentation(platform: SkillPlatformId | 'askx' | 'custom'): SkillPlatformPresentation {
  if (platform === 'askx') return { name: 'AskX', icon: 'askx-objects:skills' }
  if (platform === 'custom') return { name: 'Local folder', icon: 'askx-objects:file' }
  return skillPlatformPresentations[platform]
}
