import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../../utils/skills.js'

const requestSchema = z.object({ nameOrId: z.string().min(1) })

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.planUsage(input.nameOrId)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
