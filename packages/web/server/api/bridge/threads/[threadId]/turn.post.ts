import { z } from 'zod'
import { bridgeThreadSessionManager } from '../../../../utils/bridge.js'
import { getBridgeGroupService } from '../../../../utils/bridge-settings.js'

const bodySchema = z.object({ prompt: z.string().trim().min(1).max(20_000), chatId: z.string().min(1), projectPath: z.string().min(1), clientMessageId: z.string().min(1).max(128) })

export default defineEventHandler(async event => {
    const threadId = z.string().min(1).max(256).parse(getRouterParam(event, 'threadId'))
    const input = bodySchema.parse(await readBody(event))
    try {
        const relations = await (await getBridgeGroupService()).read()
        if (!relations.projectGroups.some(link => link.chatId === input.chatId && link.projectPath === input.projectPath && link.active)) throw new Error('Project is read-only for this group / 当前项目已归档，只能查看')
        if (!relations.threadGroups.some(link => link.chatId === input.chatId && link.projectPath === input.projectPath && link.threadId === threadId)) throw new Error('Thread is not associated with this group / 会话不属于当前群组项目')
        const accepted = await bridgeThreadSessionManager.startTurn(threadId, input.prompt, input.projectPath, input.clientMessageId, { channel: 'web', chatId: input.chatId, projectPath: input.projectPath, senderName: 'Web', chatName: relations.groups.find(group => group.chatId === input.chatId)?.name, createdAt: new Date().toISOString() })
        return { ...accepted, ...(await bridgeThreadSessionManager.readConversation(threadId)) }
    }
    catch (error) {
        throw createError({ statusCode: 409, statusMessage: error instanceof Error ? error.message : 'Bridge chat unavailable' })
    }
})
