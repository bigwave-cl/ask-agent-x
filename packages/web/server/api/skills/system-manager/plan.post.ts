import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

export default defineEventHandler(async () => {
  try {
    return await skillsManager.planSystemSkillRepair()
  } catch (error) {
    throwSkillsApiError(error)
  }
})
