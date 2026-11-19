import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

/** 会话锁等待策略。 */
export interface BridgeThreadLockOptions {
  /** 关闭会话或取消任务时中止等待。 */
  signal?: AbortSignal
  /** 最长排队时间，默认两小时。 */
  timeoutMs?: number
}
/** 进程之间共用的会话执行锁；同一 thread 同时只有一轮受管执行。 */
export async function acquireBridgeThreadLock(directory: string, threadId: string, options: BridgeThreadLockOptions = {}): Promise<() => Promise<void>> {
  if (!threadId) throw new Error('Thread ID is required')
  const lockDirectory = join(directory, 'thread-locks')
  await mkdir(lockDirectory, { recursive: true, mode: 0o700 })
  const lockPath = join(lockDirectory, `${createHash('sha256').update(threadId).digest('hex')}.lock`)
  const token = randomUUID()
  const deadline = Date.now() + (options.timeoutMs ?? 2 * 60 * 60 * 1000)
  while (Date.now() <= deadline) {
    options.signal?.throwIfAborted()
    try {
      const handle = await open(lockPath, 'wx', 0o600)
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, token })) } finally { await handle.close() }
      let released = false
      return async () => {
        if (released) return
        released = true
        try {
          const record = JSON.parse(await readFile(lockPath, 'utf8')) as { token?: string }
          if (record.token === token) await unlink(lockPath)
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    // 崩溃留下的锁不按超时强抢，只在进程确实不存在时回收。
    try {
      const record = JSON.parse(await readFile(lockPath, 'utf8')) as { pid?: number, token?: string }
      if (Number.isSafeInteger(record.pid) && Number(record.pid) > 0) {
        try { process.kill(Number(record.pid), 0) } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
            // 并发回收只能有一个进程赢得回收锁，避免删除其他进程刚获得的新锁。
            const reclaimPath = `${lockPath}.reclaim`
            let reclaimed = false
            try {
              const handle = await open(reclaimPath, 'wx', 0o600)
              await handle.close()
              reclaimed = true
              const latest = JSON.parse(await readFile(lockPath, 'utf8')) as { token?: string }
              if (latest.token === record.token) await unlink(lockPath)
            } catch (failure) {
              if (!['ENOENT', 'EEXIST'].includes((failure as NodeJS.ErrnoException).code ?? '')) throw failure
            } finally { if (reclaimed) await unlink(reclaimPath) }
          }
        }
      }
    } catch (error) {
      if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(options.signal?.reason ?? new Error('Thread queue cancelled')) }
      const timer = setTimeout(() => { options.signal?.removeEventListener('abort', abort); resolve() }, 100)
      options.signal?.addEventListener('abort', abort, { once: true })
      if (options.signal?.aborted) abort()
    })
  }
  throw new Error('Thread is busy; timed out waiting for the previous turn')
}
