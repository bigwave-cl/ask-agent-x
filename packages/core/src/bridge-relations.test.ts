import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BridgeRelationsConflictError, BridgeRelationsStore, type BridgeRelationsInput } from './bridge-relations.js'

/** 各测试独占的临时目录。 */
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
/** 创建两个共享同一磁盘位置的独立 owner。 */
async function stores() {
  const directory = await mkdtemp(join(tmpdir(), 'askx-relations-test-'))
  directories.push(directory)
  return [new BridgeRelationsStore(directory), new BridgeRelationsStore(directory)] as const
}
/** 两个群显式共享同一项目和会话的关系。 */
function shared(): BridgeRelationsInput {
  return {
    groups: [{ chatId: 'oc_A', name: 'A' }, { chatId: 'oc_B', name: 'B' }],
    projectGroups: [{ chatId: 'oc_A', projectPath: '/projects/demo' }, { chatId: 'oc_B', projectPath: '/projects/demo' }],
    threadGroups: [{ chatId: 'oc_A', projectPath: '/projects/demo', threadId: 'thread-1' }, { chatId: 'oc_B', projectPath: '/projects/demo', threadId: 'thread-1' }],
  }
}

/** 控制目标操作进入和退出，稳定采样持锁的中间态。 */
function barrier() {
  /** 外部测试释放当前关卡。 */
  let release!: () => void
  /** 等待关卡被释放。 */
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

describe('BridgeRelationsStore', () => {
  it('目标变更持锁时仍可读取，等待的旧版本保存会在变更成功后冲突', async () => {
    /** 两个独立 owner 共用磁盘文件锁。 */
    const [first, second] = await stores()
    /** 变更开始前的完整关联。 */
    const original = await first.replace(shared(), 0)
    /** 标记目标操作已经取得锁。 */
    const entered = barrier()
    /** 控制目标操作何时完成。 */
    const finish = barrier()
    /** 正在执行的目标变更。 */
    const guarded = first.guardCatalogChange(async snapshot => {
      expect(snapshot).toEqual(original)
      entered.release()
      await finish.promise
      return 'catalog updated'
    })
    await entered.promise
    /** 在目标操作持锁期间发起的旧关联保存。 */
    let settled = false
    /** 防止拒绝结果在测试等待期间成为未处理 rejection。 */
    const waiting = second.replace({ ...shared(), threadGroups: [] }, original.revision).then(
      value => { settled = true; return { value, error: null } },
      (error: unknown) => { settled = true; return { value: null, error } },
    )
    try {
      expect(await second.read()).toEqual(original)
      await new Promise(resolve => setTimeout(resolve, 60))
      expect(settled).toBe(false)
    } finally { finish.release() }
    expect(await guarded).toBe('catalog updated')
    /** 旧校验结果不应覆盖变更后的版本。 */
    const result = await waiting
    expect(result.error).toBeInstanceOf(BridgeRelationsConflictError)
    expect(await second.read()).toEqual({ ...original, revision: original.revision + 1 })
  })

  it('目标变更异常也使旧保存失效，并释放锁允许新版本重试', async () => {
    /** 两个独立 owner 共用磁盘文件锁。 */
    const [first, second] = await stores()
    /** 变更开始前的完整关联。 */
    const original = await first.replace(shared(), 0)
    /** 标记目标操作已经取得锁。 */
    const entered = barrier()
    /** 控制失败发生的时机。 */
    const finish = barrier()
    /** 应原样向调用方传递的目标操作错误。 */
    const failure = new Error('catalog changed before failure')
    /** 捕获异常，避免操作结束前发生未处理 rejection。 */
    const guarded = first.guardCatalogChange(async () => {
      entered.release()
      await finish.promise
      throw failure
    }).catch((error: unknown) => error)
    await entered.promise
    /** 等待目标操作释放锁的旧版本提交。 */
    let settled = false
    /** 将失败转换为可核对的结果。 */
    const waiting = second.replace({ ...shared(), threadGroups: [] }, original.revision).then(
      value => { settled = true; return { value, error: null } },
      (error: unknown) => { settled = true; return { value: null, error } },
    )
    try {
      expect(await second.read()).toEqual(original)
      await new Promise(resolve => setTimeout(resolve, 60))
      expect(settled).toBe(false)
    } finally { finish.release() }
    expect(await guarded).toBe(failure)
    expect((await waiting).error).toBeInstanceOf(BridgeRelationsConflictError)
    /** 失败后的最新版本依然保留先前关联。 */
    const invalidated = await second.read()
    expect(invalidated).toEqual({ ...original, revision: original.revision + 1 })
    /** 使用最新版本可以重新校验并提交，证明文件锁已释放。 */
    const retried = await second.replace({ ...shared(), threadGroups: [] }, invalidated.revision)
    expect(retried.revision).toBe(original.revision + 2)
    expect(retried.projectGroups).toEqual(original.projectGroups)
    expect(retried.threadGroups).toEqual([])
  })

  it('独立 store 竞争同一个 revision 时仅允许一个提交且不丢失胜出快照', async () => {
    const [first, second] = await stores()
    const candidates = [shared(), { groups: [{ chatId: 'oc_C', name: 'C' }], projectGroups: [], threadGroups: [] }]
    const results = await Promise.allSettled([first.replace(candidates[0]!, 0), second.replace(candidates[1]!, 0)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(BridgeRelationsConflictError)
    const fulfilled = results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<unknown>
    expect(await second.read()).toEqual(fulfilled.value)
    expect((await first.read()).revision).toBe(1)
  })

  it('允许多群共享会话，但共享会话必须保持同一个项目', async () => {
    const [store] = await stores()
    const snapshot = await store.replace(shared(), 0)
    expect(snapshot.threadGroups).toHaveLength(2)
    const invalid = shared()
    invalid.projectGroups[1]!.projectPath = '/projects/other'
    invalid.threadGroups[1]!.projectPath = '/projects/other'
    await expect(store.replace(invalid, 1)).rejects.toThrow()
    expect(await store.read()).toEqual(snapshot)
  })

  it('移除一个群的项目和会话关系后仍保留另一个群的授权', async () => {
    const [store] = await stores()
    await store.replace(shared(), 0)
    const input = shared()
    input.projectGroups = input.projectGroups.filter(item => item.chatId !== 'oc_A')
    input.threadGroups = input.threadGroups.filter(item => item.chatId !== 'oc_A')
    const snapshot = await store.replace(input, 1)
    expect(snapshot.threadGroups).toEqual([{ chatId: 'oc_B', projectPath: '/projects/demo', threadId: 'thread-1' }])
    expect(snapshot.groups).toHaveLength(2)
  })

  it('非法路径、孤立关系和重复群不改变已有文件', async () => {
    const [store] = await stores()
    await store.replace(shared(), 0)
    const before = await readFile(store.path, 'utf8')
    const invalidInputs = [
      { ...shared(), projectGroups: [{ chatId: 'oc_A', projectPath: 'relative' }] },
      { ...shared(), projectGroups: [] },
      { ...shared(), groups: [{ chatId: 'oc_A', name: 'A' }, { chatId: 'oc_A', name: 'duplicate' }] },
    ]
    for (const input of invalidInputs) {
      await expect(store.replace(input, 1)).rejects.toThrow()
      expect(await readFile(store.path, 'utf8')).toBe(before)
    }
  })
})
