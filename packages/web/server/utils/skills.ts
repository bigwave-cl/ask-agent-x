import { defaultContext } from '@askx/core'
import { SkillsManager } from '@askx/module-skills'

/** Web 与 CLI 共用的本地 Skills 管理实例。 */
export const skillsManager = new SkillsManager(defaultContext())

/**
 * 将 Skills 领域错误映射为可恢复的 HTTP 冲突。
 * @param error 原始错误。
 */
export function throwSkillsApiError(error: unknown): never {
  const message = error instanceof Error ? error.message : 'Skills 操作失败。'
  const conflict = /变化|revision|manifest|重新扫描|hash|已存在|占用|失效/.test(message)
  throw createError({ statusCode: conflict ? 409 : 400, statusMessage: message })
}
