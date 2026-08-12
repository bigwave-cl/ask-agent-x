import { createServer } from 'node:net'

/** 五位端口的最小值。 */
const MIN_FIVE_DIGIT_PORT = 10_000
/** 避免极少数系统分配到四位端口时无限重试。 */
const MAX_PORT_SELECTION_ATTEMPTS = 12

/** 本地 UI 端口已被其他进程占用。 */
export class UiPortInUseError extends Error {
    /** 被占用的本地端口。 */
    readonly port: number

    /**
   * 创建端口占用错误。
   * @param port 被占用的本地端口。
   */
    constructor(port: number) {
        super(`本地 UI 端口 ${port} 已被占用，请先停止占用该端口的服务再启动 AskAgent X。 / Local UI port ${port} is already in use. Stop the service using it before starting AskAgent X.`)
        this.name = 'UiPortInUseError'
        this.port = port
    }
}

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
 * 为首次启动的生产 UI 选择当前可用的五位端口。
 * @param host 只允许绑定的本地回环地址。
 * @returns 可供生产 UI 记忆并复用的五位端口。
 */
export async function selectAvailableUiPort(host: '127.0.0.1' = '127.0.0.1'): Promise<number> {
    for (let attempt = 0; attempt < MAX_PORT_SELECTION_ATTEMPTS; attempt += 1) {
        const port = await requestAvailableLocalPort(host)
        if (port >= MIN_FIVE_DIGIT_PORT) return port
    }

    throw new Error('无法分配可用的五位本地 UI 端口。')
}

/**
 * 确认指定回环端口当前可以监听，不自动切换到其他端口。
 * @param port 要检查的固定端口。
 * @param host 只允许绑定的本地回环地址。
 */
export async function assertUiPortAvailable(port: number, host: '127.0.0.1' = '127.0.0.1'): Promise<void> {
    const server = createServer()
    server.unref()
    await new Promise<void>((resolve, reject) => {
        server.once('error', (error: NodeJS.ErrnoException) => {
            reject(error.code === 'EADDRINUSE' ? new UiPortInUseError(port) : error)
        })
        server.listen(port, host, () => {
            server.close(error => error ? reject(error) : resolve())
        })
    })
}
