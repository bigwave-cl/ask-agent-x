export default defineEventHandler(() => {
    throw createError({ statusCode: 410, statusMessage: 'Thread bindings have expired; select a Codex project / 会话绑定已停用，请选择 Codex 项目' })
})
