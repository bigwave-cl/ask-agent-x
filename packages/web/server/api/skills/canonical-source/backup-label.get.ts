import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

/** 返回清空表单默认使用的备份名称。 */
export default defineEventHandler(async (): Promise<{ label: string }> => {
    try {
        return { label: await skillsManager.suggestCanonicalBackupLabel() }
    }
    catch (error) {
        throwSkillsApiError(error)
    }
})
