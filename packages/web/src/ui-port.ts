import { createServer } from 'node:net'

/** 五位端口的最小值。 */
const MIN_FIVE_DIGIT_PORT = 10_000
/** 避免极少数系统分配到四位端口时无限重试。 */
const MAX_PORT_SELECTION_ATTEMPTS = 12

/**
 * 请求一个由操作系统分配的当前可用本地端口，并在返回前释放探测监听。
 * @param host 只允许绑定的本地回环地址。
 * @returns 操作系统分配的端口。
 */
async function requestAvailableLocalPort(host: '127.0.0.1'): Promise<number> {
  const server = createServer()
  server.unref()

  return new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

/**
 * 选择一个当前可用的五位本地 UI 端口。
 * @param host 只允许绑定的本地回环地址。
 * @returns 可供发布版 UI 启动使用的五位端口。
 */
export async function selectAvailableUiPort(host: '127.0.0.1' = '127.0.0.1'): Promise<number> {
  for (let attempt = 0; attempt < MAX_PORT_SELECTION_ATTEMPTS; attempt += 1) {
    const port = await requestAvailableLocalPort(host)
    if (port >= MIN_FIVE_DIGIT_PORT) return port
  }

  throw new Error('无法分配可用的五位本地 UI 端口。')
}
