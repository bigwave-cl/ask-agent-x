import { createServer } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { selectAvailableUiPort } from './ui-port.js'

/** 测试中用于确认端口已经释放的监听实例。 */
const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => {
    if (!server.listening) return resolve()
    server.close(() => resolve())
  })))
})

describe('selectAvailableUiPort', () => {
  it('返回已经释放且可以重新绑定的五位本地端口', async () => {
    const port = await selectAvailableUiPort()
    expect(port).toBeGreaterThanOrEqual(10_000)
    expect(port).toBeLessThanOrEqual(65_535)

    const server = createServer()
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
    expect(server.address()).toMatchObject({ port })
  })
})
