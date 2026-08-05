import { selectLocalDirectories } from '../../../utils/localDirectoryPicker.js'
import { throwSkillsApiError } from '../../../utils/skills.js'

export default defineEventHandler(async () => {
  try {
    return { directories: await selectLocalDirectories({ prompt: '选择 Skill 同步目标文件夹' }) }
  } catch (error) {
    throwSkillsApiError(error)
  }
})
