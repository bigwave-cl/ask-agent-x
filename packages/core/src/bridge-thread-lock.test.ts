import { createHash } from 'node:crypto'
import { getEventListeners } from 'node:events'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireBridgeThreadLock } from './bridge-thread-lock.js'

/** 测试使用的锁目录。 */
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
/** 返回隔离的系统临时目录。 */
async function directory() {
  const value = await mkdtemp(join(tmpdir(), 'askx-thread-lock-test-'))
  directories.push(value)
  return value
}

describe('acquireBridgeThreadLock', () => {
  it('同目录同 thread 互斥，等待者在先前回合释放后获得锁', async () => {
    const path = await directory()
    const release = await acquireBridgeThreadLock(path, 'shared')
    let acquired = false
    const waiting = acquireBridgeThreadLock(path, 'shared', { timeoutMs: 2000 }).then(unlock => { acquired = true; return unlock })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(acquired).toBe(false)
    await release()
    const unlock = await waiting
    expect(acquired).toBe(true)
    await unlock()
    expect(await readdir(join(path, 'thread-locks'))).toEqual([])
  })

  it('不同 thread 可以并行持锁，释放幂等', async () => {
    const path = await directory()
    const first = await acquireBridgeThreadLock(path, 'first')
    const second = await acquireBridgeThreadLock(path, 'second', { timeoutMs: 100 })
    expect(await readdir(join(path, 'thread-locks'))).toHaveLength(2)
    await first()
    await first()
    expect(await readdir(join(path, 'thread-locks'))).toHaveLength(1)
    await second()
  })

  it('中止等待会移除监听器且不会删除仍被持有的锁', async () => {
    const path = await directory()
    const release = await acquireBridgeThreadLock(path, 'abort')
    const controller = new AbortController()
    const queued = acquireBridgeThreadLock(path, 'abort', { signal: controller.signal })
    const assertion = expect(queued).rejects.toThrow('cancelled by test')
    await new Promise(resolve => setTimeout(resolve, 30))
    controller.abort(new Error('cancelled by test'))
    await assertion
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    expect(await readdir(join(path, 'thread-locks'))).toHaveLength(1)
    await release()
    expect(await readdir(join(path, 'thread-locks'))).toEqual([])
  })

  it('回收已退出进程留下的锁，不保留 reclaim 文件', async () => {
    const path = await directory()
    const lockDirectory = join(path, 'thread-locks')
    await mkdir(lockDirectory)
    const lockPath = join(lockDirectory, `${createHash('sha256').update('dead').digest('hex')}.lock`)
    // 使用系统不可能分配的 PID，避免触及任何实际进程。
    await writeFile(lockPath, JSON.stringify({ pid: 2147483647, token: 'dead-owner' }))
    const release = await acquireBridgeThreadLock(path, 'dead', { timeoutMs: 1000 })
    expect(await readdir(lockDirectory)).toHaveLength(1)
    await release()
    expect(await readdir(lockDirectory)).toEqual([])
  })
})
