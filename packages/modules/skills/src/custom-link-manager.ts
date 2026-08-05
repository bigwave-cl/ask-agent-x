import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readlink, rename, symlink, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { stableHash, type UserConsent } from '@askx/core'
import { managedDirectoryLinkType } from '@askx/platform-adapters'
import type { SkillsManifestStore } from './manifest-store.js'
import {
  customLinkPlanSchema,
  type CustomLinkAction,
  type CustomLinkMoveOperation,
  type CustomLinkPlan,
  type CustomLinkReceipt,
  type ManagedCustomLinkBinding,
} from './skill-types.js'
import { verifyManagedLink } from './skills-verifier.js'

/** 文件系统路径的只读快照。 */
interface CustomLinkPathSnapshot {
  /** 快照路径。 */
  path: string
  /** 路径类型。 */
  kind: 'missing' | 'symlink' | 'directory' | 'file' | 'other'
  /** 软链保存的原始目标。 */
  linkTarget?: string | undefined
}

/** 自定义软链计划中参与 hash 的字段。 */
type UnsignedCustomLinkPlan = Omit<CustomLinkPlan, 'hash'>

/** 自定义软链管理所需依赖。 */
export interface CustomLinkManagerContext {
  /** Skills manifest 存储。 */
  manifestStore: SkillsManifestStore
}

/** 读取一个路径的稳定只读快照。 */
async function inspectLinkPath(path: string): Promise<CustomLinkPathSnapshot> {
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

/** 断言目标路径不存在。 */
async function assertPathMissing(path: string, message: string): Promise<void> {
  if ((await inspectLinkPath(path)).kind !== 'missing') throw new Error(message)
}

/** 断言目标路径存在。 */
async function assertPathExists(path: string, message: string): Promise<void> {
  if ((await inspectLinkPath(path)).kind === 'missing') throw new Error(message)
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

/** 获取自定义目录取消绑定期间默认保存受管软链的固定路径。 */
function defaultSuspendedPath(binding: ManagedCustomLinkBinding): string {
  const safeId = binding.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16)
  if (!safeId) throw new Error(`自定义目录绑定标识无效：${binding.id}`)
  return join(dirname(binding.path), `.askx-custom-${safeId}-skills-link`)
}

/** 获取自定义目录取消绑定期间保存受管软链的路径。 */
function resolveSuspendedPath(binding: ManagedCustomLinkBinding): string {
  return binding.suspendedPath ?? defaultSuspendedPath(binding)
}

/** 判断候选路径是否严格位于指定目录内部。 */
function isPathInside(parent: string, candidate: string): boolean {
  const child = relative(resolve(parent), resolve(candidate))
  return Boolean(child) && !child.startsWith('..') && !isAbsolute(child)
}

/** 校验绑定关系只涉及用户选择路径和 AskX 自有目录。 */
function assertBindingScope(context: CustomLinkManagerContext, binding: ManagedCustomLinkBinding): void {
  if (!isAbsolute(binding.path)) throw new Error(`自定义软链路径必须是绝对路径：${binding.path}`)
  if (resolve(binding.target) !== resolve(join(context.manifestStore.dataDir, 'skills'))) throw new Error(`自定义软链统一源超出 AskX 管理范围：${binding.target}`)
  const expectedSuspendedPath = defaultSuspendedPath(binding)
  if (binding.suspendedPath && resolve(binding.suspendedPath) !== resolve(expectedSuspendedPath)) throw new Error(`自定义软链隐藏路径不匹配：${binding.path}`)
  if (binding.originalRootBackup && !isPathInside(join(context.manifestStore.dataDir, 'backups', 'skills'), binding.originalRootBackup.backupPath)) {
    throw new Error(`自定义目录原始备份超出 AskX 管理范围：${binding.originalRootBackup.backupPath}`)
  }
}

/** 生成当前绑定和全部相关路径的检测指纹。 */
async function createDetectionFingerprint(binding: ManagedCustomLinkBinding, suspendedPath: string): Promise<string> {
  const backupPath = binding.originalRootBackup?.backupPath
  const [active, suspended, backup] = await Promise.all([
    inspectLinkPath(binding.path),
    inspectLinkPath(suspendedPath),
    backupPath ? inspectLinkPath(backupPath) : Promise.resolve(undefined),
  ])
  return stableHash({ binding, active, suspended, backup })
}

/** 校验已取消的自定义软链处于可恢复状态。 */
async function verifySuspendedState(binding: ManagedCustomLinkBinding, suspendedPath: string): Promise<void> {
  await verifyManagedLink(suspendedPath, binding.target)
  const backup = binding.originalRootBackup
  if (!backup) {
    await assertPathMissing(binding.path, `自定义目录在取消软链期间已被占用：${binding.path}`)
    return
  }
  await assertPathExists(binding.path, `接入前的自定义目录未恢复：${binding.path}`)
  await assertPathMissing(backup.backupPath, `自定义目录备份位置在取消软链期间被占用：${backup.backupPath}`)
  if (await isManagedLink(binding.path, binding.target)) throw new Error(`接入前的自定义目录未恢复：${binding.path}`)
}

/** 校验已接入的自定义软链处于可取消状态。 */
async function verifyConnectedState(binding: ManagedCustomLinkBinding, suspendedPath: string): Promise<void> {
  await verifyManagedLink(binding.path, binding.target)
  await assertPathMissing(suspendedPath, `自定义软链隐藏保留路径已被占用：${suspendedPath}`)
  if (binding.originalRootBackup) {
    await assertPathExists(binding.originalRootBackup.backupPath, `接入前的自定义目录备份已丢失：${binding.originalRootBackup.backupPath}`)
  }
}

/** 校验自定义软链已删除且接入前目录保持恢复状态。 */
async function verifyDeletedState(binding: ManagedCustomLinkBinding, suspendedPath: string): Promise<void> {
  await assertPathMissing(suspendedPath, `待删除的自定义软链仍然存在：${suspendedPath}`)
  if (!binding.originalRootBackup) {
    await assertPathMissing(binding.path, `自定义目录删除配置后出现未授权路径：${binding.path}`)
    return
  }
  await assertPathExists(binding.path, `接入前的自定义目录未恢复：${binding.path}`)
  await assertPathMissing(binding.originalRootBackup.backupPath, `自定义目录原备份尚未恢复：${binding.originalRootBackup.backupPath}`)
  if (await isManagedLink(binding.path, binding.target)) throw new Error(`自定义目录仍指向统一源：${binding.path}`)
}

/** 根据当前绑定状态解析需要执行的原子移动操作。 */
async function resolveMoveOperations(binding: ManagedCustomLinkBinding, action: CustomLinkAction, suspendedPath: string): Promise<CustomLinkMoveOperation[]> {
  if (action === 'resume') {
    if (!binding.suspendedAt && !binding.suspendedPath) {
      await verifyConnectedState(binding, suspendedPath)
      return []
    }
    if (!binding.suspendedAt || !binding.suspendedPath) throw new Error(`自定义软链取消状态不完整：${binding.path}`)
    await verifySuspendedState(binding, binding.suspendedPath)
    const operations: CustomLinkMoveOperation[] = []
    if (binding.originalRootBackup) operations.push({
      kind: 'move-path',
      role: 'original-root',
      source: binding.originalRootBackup.originalPath,
      target: binding.originalRootBackup.backupPath,
    })
    operations.push({ kind: 'move-path', role: 'managed-link', source: binding.suspendedPath, target: binding.path })
    return operations
  }

  if (binding.suspendedAt && binding.suspendedPath) {
    await verifySuspendedState(binding, binding.suspendedPath)
    return []
  }
  await verifyConnectedState(binding, suspendedPath)
  const operations: CustomLinkMoveOperation[] = [
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

/** 生成自定义目录软链的取消、恢复或删除计划。 */
export async function createCustomLinkPlan(context: CustomLinkManagerContext, bindingId: string, action: CustomLinkAction): Promise<CustomLinkPlan> {
  const manifest = await context.manifestStore.read()
  if (!manifest?.initializedAt) throw new Error('Skills 管理尚未初始化。')
  const binding = (manifest.customLinkBindings ?? []).find((entry) => entry.id === bindingId)
  if (!binding) throw new Error(`自定义软链绑定不存在：${bindingId}`)
  assertBindingScope(context, binding)
  const suspendedPath = resolveSuspendedPath(binding)
  const operations = await resolveMoveOperations(binding, action, suspendedPath)
  const unsigned: UnsignedCustomLinkPlan = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    bindingId: binding.id,
    name: binding.name,
    action,
    path: binding.path,
    target: binding.target,
    suspendedPath,
    ...(binding.originalRootBackup ? { originalRootBackup: binding.originalRootBackup } : {}),
    manifestRevision: manifest.revision,
    detectionFingerprint: await createDetectionFingerprint(binding, suspendedPath),
    operations,
  }
  return customLinkPlanSchema.parse({ ...unsigned, hash: stableHash(unsigned) })
}

/** 生成操作后的自定义目录绑定。 */
function createNextBinding(binding: ManagedCustomLinkBinding, action: Exclude<CustomLinkAction, 'delete'>, suspendedPath: string, updatedAt: string): ManagedCustomLinkBinding {
  if (action === 'suspend') return { ...binding, updatedAt, suspendedAt: updatedAt, suspendedPath }
  const { suspendedAt: _suspendedAt, suspendedPath: _suspendedPath, ...activeBinding } = binding
  return { ...activeBinding, updatedAt }
}

/** 执行一个经过预检的路径移动。 */
async function applyMoveOperation(operation: CustomLinkMoveOperation, linkTarget: string): Promise<void> {
  await assertPathExists(operation.source, `待移动路径不存在：${operation.source}`)
  await assertPathMissing(operation.target, `移动目标已被占用：${operation.target}`)
  if (operation.role === 'managed-link') await verifyManagedLink(operation.source, linkTarget)
  await mkdir(dirname(operation.target), { recursive: true, mode: 0o700 })
  await rename(operation.source, operation.target)
}

/** 逆序恢复一个已经完成的路径移动。 */
async function rollbackMoveOperation(operation: CustomLinkMoveOperation, linkTarget: string): Promise<void> {
  await assertPathMissing(operation.source, `回滚源路径已被占用：${operation.source}`)
  await assertPathExists(operation.target, `回滚路径已经丢失：${operation.target}`)
  if (operation.role === 'managed-link') await verifyManagedLink(operation.target, linkTarget)
  await mkdir(dirname(operation.source), { recursive: true, mode: 0o700 })
  await rename(operation.target, operation.source)
}

/** 校验取消或恢复后的自定义软链状态。 */
async function verifyAppliedState(binding: ManagedCustomLinkBinding, action: Exclude<CustomLinkAction, 'delete'>, suspendedPath: string): Promise<void> {
  if (action === 'suspend') {
    await verifySuspendedState({ ...binding, suspendedAt: new Date(0).toISOString(), suspendedPath }, suspendedPath)
    return
  }
  await verifyConnectedState(binding, suspendedPath)
}

/** 应用经过确认的自定义目录软链计划，并在失败时恢复全部路径。 */
export async function applyCustomLinkPlan(context: CustomLinkManagerContext, inputPlan: CustomLinkPlan, consent: UserConsent): Promise<CustomLinkReceipt> {
  const plan = customLinkPlanSchema.parse(inputPlan)
  const { hash: _hash, ...unsigned } = plan
  if (stableHash(unsigned) !== plan.hash || consent.planHash !== plan.hash) throw new Error('自定义软链计划或用户授权已经失效。')

  const manifest = await context.manifestStore.read()
  if (!manifest || manifest.revision !== plan.manifestRevision) throw new Error('Skills manifest 已经变化，请重新操作。')
  const binding = (manifest.customLinkBindings ?? []).find((entry) => entry.id === plan.bindingId)
  if (!binding || binding.name !== plan.name || binding.path !== plan.path || binding.target !== plan.target) throw new Error('自定义软链绑定已经变化，请重新操作。')
  assertBindingScope(context, binding)
  if (stableHash(binding.originalRootBackup ?? null) !== stableHash(plan.originalRootBackup ?? null)) throw new Error('自定义目录原始备份关系已经变化，请重新操作。')
  if (await createDetectionFingerprint(binding, plan.suspendedPath) !== plan.detectionFingerprint) throw new Error('自定义软链状态已经变化，请重新操作。')
  const expectedOperations = await resolveMoveOperations(binding, plan.action, plan.suspendedPath)
  if (stableHash(expectedOperations) !== stableHash(plan.operations)) throw new Error('自定义软链操作已经变化，请重新操作。')

  const appliedAt = new Date().toISOString()
  if (plan.action !== 'delete' && !expectedOperations.length) {
    return {
      id: randomUUID(),
      planHash: plan.hash,
      bindingId: plan.bindingId,
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

  const appliedOperations: CustomLinkMoveOperation[] = []
  let removedLinkTarget: string | undefined
  try {
    for (const operation of expectedOperations) {
      await applyMoveOperation(operation, binding.target)
      appliedOperations.push(operation)
    }

    if (plan.action === 'delete') {
      await verifyManagedLink(plan.suspendedPath, binding.target)
      removedLinkTarget = await readlink(plan.suspendedPath)
      await unlink(plan.suspendedPath)
      await verifyDeletedState(binding, plan.suspendedPath)
      const saved = await context.manifestStore.write({
        ...manifest,
        customLinkBindings: (manifest.customLinkBindings ?? []).filter((entry) => entry.id !== binding.id),
      }, manifest.revision)
      return {
        id: randomUUID(),
        planHash: plan.hash,
        bindingId: plan.bindingId,
        action: plan.action,
        status: 'applied',
        appliedAt,
        manifestRevision: saved.revision,
        path: plan.path,
        target: plan.target,
        suspendedPath: plan.suspendedPath,
        ...(binding.originalRootBackup ? { originalRootBackup: binding.originalRootBackup } : {}),
      }
    }

    await verifyAppliedState(binding, plan.action, plan.suspendedPath)
    const nextBinding = createNextBinding(binding, plan.action, plan.suspendedPath, appliedAt)
    const saved = await context.manifestStore.write({
      ...manifest,
      customLinkBindings: (manifest.customLinkBindings ?? []).map((entry) => entry.id === binding.id ? nextBinding : entry),
    }, manifest.revision)
    return {
      id: randomUUID(),
      planHash: plan.hash,
      bindingId: plan.bindingId,
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
    if (removedLinkTarget) {
      try {
        await assertPathMissing(plan.suspendedPath, `软链删除回滚路径已被占用：${plan.suspendedPath}`)
        await mkdir(dirname(plan.suspendedPath), { recursive: true, mode: 0o700 })
        await symlink(removedLinkTarget, plan.suspendedPath, managedDirectoryLinkType())
        await verifyManagedLink(plan.suspendedPath, binding.target)
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    for (const operation of [...appliedOperations].reverse()) {
      try {
        await rollbackMoveOperation(operation, binding.target)
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], `自定义软链操作失败且自动恢复失败：${binding.path}`)
    throw error
  }
}
