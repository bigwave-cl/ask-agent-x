import type { CanonicalSkillsBackup } from '@askx/module-skills/canonical-source-manager'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

export default defineEventHandler(async (): Promise<CanonicalSkillsBackup[]> => {
  try {
    return await skillsManager.canonicalBackups()
  } catch (error) {
    throwSkillsApiError(error)
  }
})
