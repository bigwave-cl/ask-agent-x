import { z } from 'zod'
import { skillsManager, throwSkillsApiError } from '../../utils/skills.js'

const requestSchema = z.object({ receiptId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  try {
    const input = requestSchema.parse(await readBody(event))
    return await skillsManager.rollbackReceipt(input.receiptId)
  } catch (error) {
    throwSkillsApiError(error)
  }
})
