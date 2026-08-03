import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readlink, rename } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { stableHash, type UserConsent } from '@askx/core'
import type { SkillsManifestStore } from './manifest-store.js'
import { platformLinkPlanSchema, type ManagedPlatformBinding, type PlatformLinkAction, type PlatformLinkMoveOperation, type PlatformLinkPlan, type PlatformLinkReceipt, type SkillBackupMove, type SkillPlatformId } from './skill-types.js'
import { verifyManagedLink } from './skills-verifier.js'

/** 文件系统路径的只读快照。 */
interface LinkPathSnapshot {
  /** 快照路径。 */
  path: string
  /** 路径类型。 */
  kind: 'missing' | 'symlink' | 'directory' | 'file' | 'other'
  /** 软链保存的原始目标。 */
  linkTarget?: string | undefined
}

/** 平台软链计划中参与 hash 的字段。 */
type UnsignedPlatformLinkPlan = Omit<PlatformLinkPlan, 'hash'>

/** 平台软链管理所需依赖。 */
export interface PlatformLinkManagerContext {
  /** Skills manifest 存储。 */
  manifestStore: SkillsManifestStore
  /** 从旧事务回执恢复的平台原目录备份关系。 */
  originalRootBackups?: ReadonlyMap<SkillPlatformId, SkillBackupMove> | undefined
}

/** 读取一个路径的稳定只读快照。 */
async function inspectLinkPath(path: string): Promise<LinkPathSnapshot> {
  try {
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) return { path, kind: 'symlink', linkTarget: await readlink(path) }
    if (stat.isDirectory()) return { path, kind: 'directory' }
    if (stat.isFile()) return { path, kind: 'file' }
    return { path, kind: 'other' }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path, kind: 'missing' }
    throw error
  }
}

/** 判断路径当前是否不存在。 */
async function assertPathMissing(path: string, message: string): Promise<void> {
  const snapshot = await inspectLinkPath(path)
  if (snapshot.kind !== 'missing') throw new Error(message)
}

/** 判断路径当前是否存在。 */
async function assertPathExists(path: string, message: string): Promise<void> {
  const snapshot = await inspectLinkPath(path)
  if (snapshot.kind === 'missing') throw new Error(message)
}

/** 判断路径是否为当前 AskX 受管软链。 */
async function isManagedLink(path: string, target: string): Promise<boolean> {
  try {
    await verifyManagedLink(path, target)
    return true
  } catch {
    return false
  }
}

/** 获取平台取消绑定期间保存受管软链的固定路径。 */
function resolveSuspendedPath(binding: ManagedPlatformBinding): string {
  return binding.suspendedPath ?? join(dirname(binding.path), `.askx-${binding.platform}-skills-link`)
}

/** 判断候选路径是否严格位于指定目录内部。 */
function isPathInside(parent: string, candidate: string): boolean {
  const child = relative(resolve(parent), resolve(candidate))
  return Boolean(child) && !child.startsWith('..') && !isAbsolute(child)
}

/** 校验绑定关系只涉及平台路径和 AskX 自有目录。 */
function assertBindingScope(context: PlatformLinkManagerContext, binding: ManagedPlatformBinding): void {
  if (resolve(binding.target) !== resolve(join(context.manifestStore.dataDir, 'skills'))) throw new Error(`平台统一源超出 AskX 管理范围：${binding.target}`)
  const expectedSuspendedPath = join(dirname(binding.path), `.askx-${binding.platform}-skills-link`)
  if (binding.suspendedPath && resolve(binding.suspendedPath) !== resolve(expectedSuspendedPath)) throw new Error(`平台软链隐藏路径不匹配：${binding.platform}`)
  if (binding.originalRootBackup && !isPathInside(join(context.manifestStore.dataDir, 'backups', 'skills'), binding.originalRootBackup.backupPath)) {
    throw new Error(`平台原目录备份超出 AskX 管理范围：${binding.originalRootBackup.backupPath}`)
  }
}

/** 从 manifest 或旧回执构造完整的平台绑定关系。 */
function hydrateBinding(context: PlatformLinkManagerContext, binding: ManagedPlatformBinding): ManagedPlatformBinding {
  const originalRootBackup = binding.originalRootBackup ?? context.originalRootBackups?.get(binding.platform)
  if (!originalRootBackup) {
    assertBindingScope(context, binding)
    return binding
  }
  if (originalRootBackup.originalPath !== binding.path) throw new Error(`平台原目录备份关系不匹配：${binding.platform}`)
  const hydrated = { ...binding, originalRootBackup }
  assertBindingScope(context, hydrated)
  return hydrated
}

/** 生成当前绑定和全部相关路径的检测指纹。 */
async function createDetectionFingerprint(binding: ManagedPlatformBinding, suspendedPath: string): Promise<string> {
  const backupPath = binding.originalRootBackup?.backupPath
  const [active, suspended, backup] = await Promise.all([
    inspectLinkPath(binding.path),
    inspectLinkPath(suspendedPath),
    backupPath ? inspectLinkPath(backupPath) : Promise.resolve(undefined),
  ])
  return stableHash({ binding, active, suspended, backup })
}

/** 校验已取消绑定的平台处于可恢复状态。 */
async function verifySuspendedState(binding: ManagedPlatformBinding, suspendedPath: string): Promise<void> {
  await verifyManagedLink(suspendedPath, binding.target)
  const backup = binding.originalRootBackup
  if (!backup) {
    await assertPathMissing(binding.path, `平台 Skills 路径在取消软链期间已被占用：${binding.path}`)
    return
  }
  await assertPathExists(binding.path, `接入前的平台 Skills 目录未恢复：${binding.path}`)
  await assertPathMissing(backup.backupPath, `平台原目录的备份位置在取消软链期间被占用：${backup.backupPath}`)
  if (await isManagedLink(binding.path, binding.target)) throw new Error(`接入前的平台 Skills 目录未恢复：${binding.path}`)
}

/** 校验已接入的平台处于可取消状态。 */
async function verifyConnectedState(binding: ManagedPlatformBinding, suspendedPath: string): Promise<void> {
  await verifyManagedLink(binding.path, binding.target)
  await assertPathMissing(suspendedPath, `软链隐藏保留路径已被占用：${suspendedPath}`)
  if (binding.originalRootBackup) {
    await assertPathExists(binding.originalRootBackup.backupPath, `接入前的平台 Skills 目录备份已丢失：${binding.originalRootBackup.backupPath}`)
  }
}

/** 根据当前绑定状态解析幂等移动操作。 */
async function resolveMoveOperations(binding: ManagedPlatformBinding, action: PlatformLinkAction, suspendedPath: string): Promise<PlatformLinkMoveOperation[]> {
  if (action === 'suspend') {
    if (binding.suspendedAt && binding.suspendedPath) {
      await verifySuspendedState(binding, binding.suspendedPath)
      return []
    }
    await verifyConnectedState(binding, suspendedPath)
    const operations: PlatformLinkMoveOperation[] = [
      { kind: 'move-path', role: 'managed-link', source: binding.path, target: suspendedPath },
    ]
    if (binding.originalRootBackup) operations.push({
      kind: 'move-path',
      role: 'original-root',
      source: binding.originalRootBackup.backupPath,
      target: binding.originalRootBackup.originalPath,
    })
    return operations
  }

  if (!binding.suspendedAt && !binding.suspendedPath) {
    await verifyConnectedState(binding, suspendedPath)
    return []
  }
  if (!binding.suspendedAt || !binding.suspendedPath) throw new Error(`平台软链取消状态不完整：${binding.platform}`)
  await verifySuspendedState(binding, binding.suspendedPath)
  const operations: PlatformLinkMoveOperation[] = []
  if (binding.originalRootBackup) operations.push({
    kind: 'move-path',
    role: 'original-root',
    source: binding.originalRootBackup.originalPath,
    target: binding.originalRootBackup.backupPath,
  })
  operations.push({ kind: 'move-path', role: 'managed-link', source: binding.suspendedPath, target: binding.path })
  return operations
}

/** 生成平台软链取消或恢复计划。 */
export async function createPlatformLinkPlan(context: PlatformLinkManagerContext, platform: SkillPlatformId, action: PlatformLinkAction): Promise<PlatformLinkPlan> {
  const manifest = await context.manifestStore.read()
  if (!manifest?.initializedAt) throw new Error('Skills 管理尚未初始化。')
  const storedBinding = manifest.platformBindings.find((entry) => entry.platform === platform)
  if (!storedBinding) throw new Error(`平台尚未接入统一源：${platform}`)
  const binding = hydrateBinding(context, storedBinding)
  const suspendedPath = resolveSuspendedPath(binding)
  const operations = await resolveMoveOperations(binding, action, suspendedPath)
  const unsigned: UnsignedPlatformLinkPlan = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    platform,
    action,
    path: binding.path,
    target: binding.target,
    suspendedPath,
    ...(binding.originalRootBackup ? { originalRootBackup: binding.originalRootBackup } : {}),
    manifestRevision: manifest.revision,
    detectionFingerprint: await createDetectionFingerprint(binding, suspendedPath),
    operations,
  }
  return platformLinkPlanSchema.parse({ ...unsigned, hash: stableHash(unsigned) })
}

/** 生成操作后的平台绑定。 */
function createNextBinding(binding: ManagedPlatformBinding, action: PlatformLinkAction, suspendedPath: string, updatedAt: string): ManagedPlatformBinding {
  if (action === 'suspend') return { ...binding, updatedAt, suspendedAt: updatedAt, suspendedPath }
  const { suspendedAt: _suspendedAt, suspendedPath: _suspendedPath, ...activeBinding } = binding
  return { ...activeBinding, updatedAt }
}

/** 执行一个经过预检的路径移动。 */
async function applyMoveOperation(operation: PlatformLinkMoveOperation, linkTarget: string): Promise<void> {
  await assertPathExists(operation.source, `待移动路径不存在：${operation.source}`)
  await assertPathMissing(operation.target, `移动目标已被占用：${operation.target}`)
  if (operation.role === 'managed-link') await verifyManagedLink(operation.source, linkTarget)
  await mkdir(dirname(operation.target), { recursive: true, mode: 0o700 })
  await rename(operation.source, operation.target)
}

/** 逆序恢复一个已经完成的路径移动。 */
async function rollbackMoveOperation(operation: PlatformLinkMoveOperation, linkTarget: string): Promise<void> {
  await assertPathMissing(operation.source, `回滚源路径已被占用：${operation.source}`)
  await assertPathExists(operation.target, `回滚路径已经丢失：${operation.target}`)
  if (operation.role === 'managed-link') await verifyManagedLink(operation.target, linkTarget)
  await mkdir(dirname(operation.source), { recursive: true, mode: 0o700 })
  await rename(operation.target, operation.source)
}

/** 校验操作完成后的平台绑定状态。 */
async function verifyAppliedState(binding: ManagedPlatformBinding, action: PlatformLinkAction, suspendedPath: string): Promise<void> {
  if (action === 'suspend') {
    await verifySuspendedState({ ...binding, suspendedAt: new Date(0).toISOString(), suspendedPath }, suspendedPath)
    return
  }
  await verifyConnectedState(binding, suspendedPath)
}

/** 应用经过确认的平台软链计划，并在任一步失败时逆序恢复全部路径。 */
export async function applyPlatformLinkPlan(context: PlatformLinkManagerContext, inputPlan: PlatformLinkPlan, consent: UserConsent): Promise<PlatformLinkReceipt> {
  const plan = platformLinkPlanSchema.parse(inputPlan)
  const { hash: _hash, ...unsigned } = plan
  if (stableHash(unsigned) !== plan.hash || consent.planHash !== plan.hash) throw new Error('平台软链计划或用户授权已经失效。')

  const manifest = await context.manifestStore.read()
  if (!manifest || manifest.revision !== plan.manifestRevision) throw new Error('Skills manifest 已经变化，请重新操作。')
  const storedBinding = manifest.platformBindings.find((entry) => entry.platform === plan.platform)
  if (!storedBinding || storedBinding.path !== plan.path || storedBinding.target !== plan.target) throw new Error('平台绑定已经变化，请重新操作。')
  const binding = hydrateBinding(context, storedBinding)
  if (stableHash(binding.originalRootBackup ?? null) !== stableHash(plan.originalRootBackup ?? null)) throw new Error('平台原目录备份关系已经变化，请重新操作。')
  const detectionFingerprint = await createDetectionFingerprint(binding, plan.suspendedPath)
  if (detectionFingerprint !== plan.detectionFingerprint) throw new Error('平台软链状态已经变化，请重新操作。')
  const expectedOperations = await resolveMoveOperations(binding, plan.action, plan.suspendedPath)
  if (stableHash(expectedOperations) !== stableHash(plan.operations)) throw new Error('平台软链操作已经变化，请重新操作。')

  const appliedAt = new Date().toISOString()
  if (!expectedOperations.length) {
    return {
      id: randomUUID(),
      planHash: plan.hash,
      platform: plan.platform,
      action: plan.action,
      status: 'skipped',
      appliedAt,
      manifestRevision: manifest.revision,
      path: plan.path,
      target: plan.target,
      suspendedPath: plan.suspendedPath,
      ...(binding.originalRootBackup ? { originalRootBackup: binding.originalRootBackup } : {}),
    }
  }

  const appliedOperations: PlatformLinkMoveOperation[] = []
  try {
    for (const operation of expectedOperations) {
      await applyMoveOperation(operation, binding.target)
      appliedOperations.push(operation)
    }
    await verifyAppliedState(binding, plan.action, plan.suspendedPath)
    const nextBinding = createNextBinding(binding, plan.action, plan.suspendedPath, appliedAt)
    const saved = await context.manifestStore.write({
      ...manifest,
      platformBindings: manifest.platformBindings.map((entry) => entry.platform === plan.platform ? nextBinding : entry),
    }, manifest.revision)
    return {
      id: randomUUID(),
      planHash: plan.hash,
      platform: plan.platform,
      action: plan.action,
      status: 'applied',
      appliedAt,
      manifestRevision: saved.revision,
      path: plan.path,
      target: plan.target,
      suspendedPath: plan.suspendedPath,
      ...(binding.originalRootBackup ? { originalRootBackup: binding.originalRootBackup } : {}),
    }
  } catch (error) {
    const rollbackErrors: unknown[] = []
    for (const operation of [...appliedOperations].reverse()) {
      try {
        await rollbackMoveOperation(operation, binding.target)
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], `平台软链操作失败且自动恢复失败：${plan.platform}`)
    throw error
  }
}
