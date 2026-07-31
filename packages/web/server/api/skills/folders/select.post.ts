import { selectLocalDirectories } from '../../../utils/localDirectoryPicker.js'
import { throwSkillsApiError } from '../../../utils/skills.js'

export default defineEventHandler(async () => {
  try {
    return { directories: await selectLocalDirectories() }
  } catch (error) {
    throwSkillsApiError(error)
  }
})
