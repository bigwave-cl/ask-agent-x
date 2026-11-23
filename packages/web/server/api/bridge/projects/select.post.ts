import { selectLocalDirectories } from '../../../utils/localDirectoryPicker.js'

/** 打开本机目录选择器，为项目导入返回一个候选目录。 */
export default defineEventHandler(async () => {
    try {
        return {
            directories: await selectLocalDirectories({
                prompt: '选择 Codex 项目文件夹',
                multipleSelectionsAllowed: false,
            }),
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : '无法打开项目目录选择器。'
        throw createError({ statusCode: 400, statusMessage: message })
    }
})
