import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { settingsStore } from '../../utils/settings.js'

function clean(line: string): string {
    return line.replace(/(secret|token|authorization|prompt)=?[^\s,;]+/gi, '$1=[REDACTED]')
}

export default defineEventHandler(async event => {
    const query = getQuery(event)
    const limit = Math.min(Math.max(Number.parseInt(String(query.limit ?? '40'), 10) || 40, 1), 500)
    const settings = await settingsStore.read()
    const file = join(settings.bridge.paths.stateDir, 'bridge.log')
    try {
        const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean).slice(-limit).map(clean)
        return { file, lines }
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { file, lines: [] }
        throw error
    }
})
