import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { UiPortInUseError } from './ui-port.js'
import { assertUiPortAvailable, selectAvailableUiPort } from './ui-port.js'

const servers: Server[] = []

afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

/** 请求一个测试专用的临时端口。 */
async function requestTestPort(): Promise<number> {
    const server = createServer()
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    await new Promise<void>(resolve => server.close(() => resolve()))
    return port
}

describe('本地 UI 生产端口', () => {
    it('首次启动选择已经释放且可以重新绑定的五位端口', async () => {
        const port = await selectAvailableUiPort()
        expect(port).toBeGreaterThanOrEqual(10_000)
        expect(port).toBeLessThanOrEqual(65_535)
    })

    it('指定端口可用时通过预检', async () => {
        await expect(assertUiPortAvailable(await requestTestPort())).resolves.toBeUndefined()
    })

    it('指定端口被占用时明确拒绝且不选择其他端口', async () => {
        const server = createServer()
        servers.push(server)
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 0

        await expect(assertUiPortAvailable(port)).rejects.toEqual(expect.objectContaining({
            name: 'UiPortInUseError',
            port,
        } satisfies Partial<UiPortInUseError>))
    })
})
