import { skillsManager, throwSkillsApiError } from '../../utils/skills.js'

export default defineEventHandler(async () => {
  try {
    return await skillsManager.stats()
  } catch (error) {
    throwSkillsApiError(error)
  }
})
