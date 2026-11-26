import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BridgeRelationsConflictError, BridgeSidebarPreferenceValidationError, BridgeRelationsStore, type BridgeRelationsInput } from './bridge-relations.js'

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
  it('records group management updates and preserves timestamps on read-only saves', async () => {
    const [store] = await stores()
    const input: BridgeRelationsInput = { groups: [{ chatId: 'oc_A', name: 'A' }], projectGroups: [], threadGroups: [] }
    const first = await store.replace(input, 0)
    expect(first.groups[0]?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const second = await store.replace(input, first.revision)
    expect(second.groups[0]?.updatedAt).toBe(first.groups[0]?.updatedAt)
    const changed = await store.replace({ ...input, groups: [{ chatId: 'oc_A', name: 'Renamed' }] }, second.revision)
    expect(changed.groups[0]?.updatedAt).not.toBe(second.groups[0]?.updatedAt)
  })

  it('migrates one v1 project relation to the active project state', async () => {
    const [store] = await stores()
    await writeFile(store.path, JSON.stringify({ version: 1, revision: 4, groups: [{ chatId: 'oc_A', name: 'A' }], projectGroups: [{ chatId: 'oc_A', projectPath: '/projects/demo' }], threadGroups: [] }))
    const snapshot = await store.read()
    expect(snapshot.version).toBe(2)
    expect(snapshot.projectGroups).toEqual([{ chatId: 'oc_A', projectPath: '/projects/demo', active: true }])
    expect(snapshot.migrationConflicts).toEqual([])
  })

  it('keeps v1 multi-project ambiguity as an explicit migration conflict', async () => {
    const [store] = await stores()
    await writeFile(store.path, JSON.stringify({ version: 1, revision: 2, groups: [{ chatId: 'oc_A', name: 'A' }], projectGroups: [{ chatId: 'oc_A', projectPath: '/projects/a' }, { chatId: 'oc_A', projectPath: '/projects/b' }], threadGroups: [] }))
    const snapshot = await store.read()
    expect(snapshot.projectGroups.every(link => !link.active)).toBe(true)
    expect(snapshot.migrationConflicts).toEqual([{ chatId: 'oc_A', projectPaths: ['/projects/a', '/projects/b'] }])
  })

  it.each([1, 2])('保留 %s 个显式停用的历史项目，重新读取时不激活或伪造迁移冲突', async count => {
    /** 独立读取者验证持久化后仍保持显式状态。 */
    const [writer, reader] = await stores()
    /** 当前快照允许没有活动项目，同时保留历史关联。 */
    const input: BridgeRelationsInput = {
      groups: [{ chatId: 'oc_A', name: 'A' }],
      projectGroups: Array.from({ length: count }, (_, index) => ({ chatId: 'oc_A', projectPath: `/projects/history-${index}`, active: false })),
      threadGroups: [],
    }
    const saved = await writer.replace(input, 0)
    expect(saved.projectGroups).toEqual(input.projectGroups)
    expect(saved.migrationConflicts).toEqual([])
    expect(await reader.read()).toEqual(saved)
  })

  it('rejects two active projects for one group', async () => {
    const [store] = await stores()
    await expect(store.replace({ groups: [{ chatId: 'oc_A', name: 'A' }], projectGroups: [{ chatId: 'oc_A', projectPath: '/projects/a', active: true }, { chatId: 'oc_A', projectPath: '/projects/b', active: true }], threadGroups: [] }, 0)).rejects.toThrow('only one active project')
  })

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

describe('群组侧栏共享偏好', () => {
  it('旧文件保持未初始化，迁移过滤过期身份并由首个浏览器确定共享偏好', async () => {
    /** 跨实例读取者与写入者。 */
    const [writer, reader] = await stores()
    /** 初始化旧版关系。 */
    const initial = await writer.replace(shared(), 0)
    expect(initial.sidebarPreferences).toBeUndefined()
    /** 首个浏览器的历史排列。 */
    const migrated = await writer.updateSidebarPreferences({ type: 'migrate', preferences: { order: ['obsolete', 'oc_B', 'oc_B', 'oc_A'], collapsed: ['oc_A', 'obsolete'] } }, initial.revision)
    expect(migrated.sidebarPreferences).toEqual({ order: ['oc_B', 'oc_A'], collapsed: ['oc_A'] })
    expect(migrated.groups).toEqual(initial.groups)
    expect(await reader.read()).toEqual(migrated)
    expect(await reader.updateSidebarPreferences({ type: 'migrate', preferences: { order: [], collapsed: [] } }, initial.revision)).toEqual(migrated)
  })

  it('全量关系往返保留已保存偏好，不能借关系写入覆盖偏好', async () => {
    /** 独立写入者。 */
    const [store] = await stores()
    /** 基础关系。 */
    const first = await store.replace(shared(), 0)
    /** 显式折叠群组。 */
    const folded = await store.updateSidebarPreferences({ type: 'open', chatId: 'oc_A', open: false }, first.revision)
    /** 旧客户端不携带偏好，仍需保存共享值。 */
    const replaced = await store.replace(shared(), folded.revision)
    expect(replaced.sidebarPreferences).toEqual(folded.sidebarPreferences)
    /** 新客户端原样展开快照，偏好字段也可以安全往返。 */
    const { version: _version, revision: _revision, ...data } = replaced
    expect((await store.replace({ ...data, sidebarPreferences: { order: [], collapsed: [] } }, replaced.revision)).sidebarPreferences).toEqual(folded.sidebarPreferences)
  })

  it('竞争写入要求重载版本，重试目标群意图保留其他群修改与顺序', async () => {
    /** 两个浏览器共享存储。 */
    const [a, b] = await stores()
    /** 初始关系版本。 */
    const first = await a.replace(shared(), 0)
    /** 浏览器 A 改变顺序。 */
    const ordered = await a.updateSidebarPreferences({ type: 'order', order: ['oc_B', 'oc_A'] }, first.revision)
    await expect(b.updateSidebarPreferences({ type: 'open', chatId: 'oc_B', open: false }, first.revision)).rejects.toBeInstanceOf(BridgeRelationsConflictError)
    /** 浏览器 B 重载后只提交自己的折叠意图。 */
    const folded = await b.updateSidebarPreferences({ type: 'open', chatId: 'oc_B', open: false }, ordered.revision)
    expect(folded.sidebarPreferences).toEqual({ order: ['oc_B', 'oc_A'], collapsed: ['oc_B'] })
    expect(await a.updateSidebarPreferences({ type: 'open', chatId: 'oc_B', open: false }, folded.revision)).toEqual(folded)
    expect(folded.groups).toEqual(first.groups)
    await expect(a.updateSidebarPreferences({ type: 'order', order: ['oc_A'] }, folded.revision)).rejects.toBeInstanceOf(BridgeSidebarPreferenceValidationError)
    await expect(a.updateSidebarPreferences({ type: 'order', order: ['oc_A', 'oc_A'] }, folded.revision)).rejects.toThrow('every current group')
    expect(await a.read()).toEqual(folded)
  })

  it('重复折叠保持多个折叠项的顺序和版本，未知群组为语义错误', async () => {
    /** 当前关系存储。 */
    const [store] = await stores()
    /** 初始化当前目录。 */
    const initial = await store.replace(shared(), 0)
    /** 依次折叠两个群组。 */
    const first = await store.updateSidebarPreferences({ type: 'open', chatId: 'oc_A', open: false }, initial.revision)
    /** 原顺序须在重复操作后仍保持。 */
    const second = await store.updateSidebarPreferences({ type: 'open', chatId: 'oc_B', open: false }, first.revision)
    expect(second.sidebarPreferences?.collapsed).toEqual(['oc_A', 'oc_B'])
    expect(await store.updateSidebarPreferences({ type: 'open', chatId: 'oc_A', open: false }, second.revision)).toEqual(second)
    await expect(store.updateSidebarPreferences({ type: 'open', chatId: 'oc_Missing', open: false }, second.revision)).rejects.toBeInstanceOf(BridgeSidebarPreferenceValidationError)
    expect(await store.read()).toEqual(second)
  })

  it('空目录不消费迁移，首次同步后仍能迁移', async () => {
    /** 尚未同步群组的存储。 */
    const [store] = await stores()
    expect((await store.updateSidebarPreferences({ type: 'migrate', preferences: { order: ['oc_B'], collapsed: [] } }, 0)).sidebarPreferences).toBeUndefined()
    /** 首次同步关系。 */
    const synced = await store.replace(shared(), 0)
    expect((await store.updateSidebarPreferences({ type: 'migrate', preferences: { order: ['oc_B'], collapsed: [] } }, synced.revision)).sidebarPreferences?.order).toEqual(['oc_B'])
  })
})
