import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { stableHash, type UserConsent } from '@askx/core'
import type { SkillsManifestStore } from './manifest-store.js'
import { readSkillMetadata } from './skill-metadata.js'
import { hashSkillDirectory } from './scanner.js'
import {
  skillFileUpdatePlanSchema,
  type ManagedSkillDetail,
  type ManagedSkillFile,
  type ManagedSkillRecord,
  type ManagedSkillTreeNode,
  type SkillFileUpdatePlan,
  type SkillFileUpdateReceipt,
} from './skill-types.js'

/** 在线编辑允许的单文件最大字节数。 */
const MAX_EDITABLE_FILE_BYTES = 512 * 1024
/** 单个 Skill 允许展示的最大目录节点数。 */
const MAX_TREE_NODES = 4_000
/** 单个 Skill 允许展示的最大目录深度。 */
const MAX_TREE_DEPTH = 24
/** 无扩展名但明确属于文本的文件名。 */
const TEXT_FILENAMES = new Set(['SKILL.md', 'AGENTS.md', 'LICENSE', '.gitignore', '.npmignore'])
/** 允许在线查看和编辑的文本扩展名。 */
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.csv', '.html', '.js', '.json', '.jsx', '.md', '.mdx', '.mjs', '.py', '.sh', '.svg', '.toml', '.ts', '.tsx', '.txt', '.vue', '.xml', '.yaml', '.yml', '.zsh',
])
/** 文本模板文件允许追加的安全后缀。 */
const TEXT_TEMPLATE_SUFFIXES = ['.example', '.sample', '.template'] as const

/** 文件更新计划中参与稳定 hash 的字段。 */
type UnsignedSkillFileUpdatePlan = Omit<SkillFileUpdatePlan, 'hash'>

/** Skill 文件管理器依赖。 */
export interface SkillFileManagerContext {
  /** Skills manifest 存储。 */
  manifestStore: SkillsManifestStore
}

/** 计算一段二进制内容的 SHA-256 指纹。 */
function hashContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

/** 将本机相对路径转换为界面与接口统一使用的 POSIX 路径。 */
function toPortablePath(path: string): string {
  return path.split(sep).join('/')
}

/** 提取普通文件或文本模板文件的有效扩展名。 */
function resolveTextExtension(name: string): string {
  const normalizedName = name.toLowerCase()
  const templateSuffix = TEXT_TEMPLATE_SUFFIXES.find((suffix) => normalizedName.endsWith(suffix))
  return extname(templateSuffix ? normalizedName.slice(0, -templateSuffix.length) : normalizedName)
}

/** 判断文件名是否属于可安全编辑的 UTF-8 文本。 */
function isEditableTextFile(name: string, size: number): boolean {
  return size <= MAX_EDITABLE_FILE_BYTES && (TEXT_FILENAMES.has(name) || TEXT_EXTENSIONS.has(resolveTextExtension(name)))
}

/** 根据文件扩展名返回编辑器语言标识。 */
function resolveFileLanguage(path: string): string {
  const extension = resolveTextExtension(path).slice(1)
  if (extension === 'yml') return 'yaml'
  if (extension === 'md' || extension === 'mdx') return 'markdown'
  if (extension === 'mjs' || extension === 'cjs') return 'javascript'
  return extension || 'text'
}

/** 校验 manifest 记录严格对应 AskX 统一源中的直接子目录。 */
async function resolveManagedSkill(context: SkillFileManagerContext, skillId: string): Promise<{ manifest: NonNullable<Awaited<ReturnType<SkillsManifestStore['read']>>>, record: ManagedSkillRecord }> {
  const manifest = await context.manifestStore.read()
  if (!manifest?.initializedAt) throw new Error('Skills 管理尚未初始化。')
  const record = manifest.skills.find((entry) => entry.id === skillId)
  if (!record) throw new Error('受管 Skill 不存在或已经移除。')
  const canonicalRoot = resolve(context.manifestStore.dataDir, 'skills')
  const expectedPath = resolve(canonicalRoot, record.name)
  if (resolve(record.canonicalPath) !== expectedPath || dirname(expectedPath) !== canonicalRoot) throw new Error('Skill 统一源路径超出 AskX 管理范围。')
  const rootStat = await lstat(expectedPath)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('受管 Skill 根目录不是可编辑的真实目录。')
  return { manifest, record }
}

/** 校验并解析 Skill 根目录内的既有普通文件，拒绝路径穿越和软链接。 */
async function resolveManagedFile(record: ManagedSkillRecord, portablePath: string): Promise<{ absolutePath: string, stat: Awaited<ReturnType<typeof stat>> }> {
  if (!portablePath || portablePath.includes('\0') || isAbsolute(portablePath)) throw new Error('Skill 文件路径无效。')
  const normalizedParts = portablePath.split('/').filter(Boolean)
  if (!normalizedParts.length || normalizedParts.some((part) => part === '.' || part === '..')) throw new Error('Skill 文件路径无效。')
  const root = resolve(record.canonicalPath)
  let current = root
  for (const part of normalizedParts) {
    current = join(current, part)
    const entryStat = await lstat(current)
    if (entryStat.isSymbolicLink()) throw new Error('不能读取或修改 Skill 中的软链接。')
  }
  const child = relative(root, current)
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Skill 文件路径超出受管目录。')
  const fileStat = await stat(current)
  if (!fileStat.isFile()) throw new Error('目标不是普通文件。')
  if (!isEditableTextFile(basename(current), fileStat.size)) throw new Error('该文件不是支持在线查看和编辑的文本文件。')
  return { absolutePath: current, stat: fileStat }
}

/** 读取可选的 Skill Manager 版本号。 */
async function readManagedVersion(skillPath: string): Promise<string | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(join(skillPath, '.skill-manager.json'), 'utf8'))
    if (typeof value === 'object' && value !== null && 'version' in value && typeof value.version === 'string' && value.version.trim()) return value.version.trim()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
  }
  return undefined
}

/** 枚举目录树但绝不跟随其中的软链接。 */
async function readSkillTree(root: string): Promise<{ tree: ManagedSkillTreeNode[], fileCount: number }> {
  let nodeCount = 0
  let fileCount = 0
  /** 递归读取一个真实目录。 */
  async function visit(directory: string, depth: number): Promise<ManagedSkillTreeNode[]> {
    if (depth > MAX_TREE_DEPTH) throw new Error(`Skill 目录层级超过 ${MAX_TREE_DEPTH} 层，无法安全展示。`)
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name))
    const nodes: ManagedSkillTreeNode[] = []
    for (const entry of entries) {
      nodeCount += 1
      if (nodeCount > MAX_TREE_NODES) throw new Error(`Skill 目录包含超过 ${MAX_TREE_NODES} 个节点，无法完整展示。`)
      const absolutePath = join(directory, entry.name)
      const path = toPortablePath(relative(root, absolutePath))
      if (entry.isSymbolicLink()) {
        nodes.push({ name: entry.name, path, kind: 'symlink', editable: false })
        continue
      }
      if (entry.isDirectory()) {
        nodes.push({ name: entry.name, path, kind: 'directory', editable: false, children: await visit(absolutePath, depth + 1) })
        continue
      }
      if (!entry.isFile()) continue
      const fileStat = await stat(absolutePath)
      fileCount += 1
      nodes.push({ name: entry.name, path, kind: 'file', size: fileStat.size, editable: isEditableTextFile(entry.name, fileStat.size) })
    }
    return nodes
  }
  return { tree: await visit(root, 0), fileCount }
}

/** 读取受管 Skill 的元数据和目录结构。 */
export async function inspectManagedSkillDetail(context: SkillFileManagerContext, skillId: string): Promise<ManagedSkillDetail> {
  const { record } = await resolveManagedSkill(context, skillId)
  const [metadata, managedVersion, structure] = await Promise.all([
    readSkillMetadata(record.canonicalPath),
    readManagedVersion(record.canonicalPath),
    readSkillTree(record.canonicalPath),
  ])
  return {
    ...record,
    ...(metadata.description ? { description: metadata.description } : {}),
    ...(managedVersion || metadata.version ? { version: managedVersion ?? metadata.version } : {}),
    ...structure,
  }
}

/** 读取受管 Skill 中的一个 UTF-8 文本文件。 */
export async function readManagedSkillFile(context: SkillFileManagerContext, skillId: string, path: string): Promise<ManagedSkillFile> {
  const { record } = await resolveManagedSkill(context, skillId)
  const file = await resolveManagedFile(record, path)
  const bytes = await readFile(file.absolutePath)
  if (bytes.includes(0)) throw new Error('该文件包含二进制内容，不能在线编辑。')
  return {
    skillId,
    path: toPortablePath(relative(record.canonicalPath, file.absolutePath)),
    content: bytes.toString('utf8'),
    contentHash: hashContent(bytes),
    size: bytes.byteLength,
    language: resolveFileLanguage(path),
  }
}

/** 为受管 Skill 文件更新生成不可静默执行的确认计划。 */
export async function createSkillFileUpdatePlan(context: SkillFileManagerContext, skillId: string, path: string, nextContent: string, previousContentHash: string): Promise<SkillFileUpdatePlan> {
  if (Buffer.byteLength(nextContent, 'utf8') > MAX_EDITABLE_FILE_BYTES) throw new Error('更新后的文件超过 512 KB 限制。')
  const { manifest, record } = await resolveManagedSkill(context, skillId)
  const currentSkillHash = await hashSkillDirectory(record.canonicalPath)
  if (currentSkillHash !== record.contentHash) throw new Error('Skill 内容已经变化，请刷新后再编辑。')
  const currentFile = await readManagedSkillFile(context, skillId, path)
  if (currentFile.contentHash !== previousContentHash) throw new Error('Skill 文件已经变化，请刷新后再编辑。')
  const nextContentHash = hashContent(nextContent)
  if (nextContentHash === previousContentHash) throw new Error('文件内容没有变化。')
  const unsigned: UnsignedSkillFileUpdatePlan = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    skillId,
    skillName: record.name,
    path: currentFile.path,
    manifestRevision: manifest.revision,
    skillContentHash: currentSkillHash,
    previousContentHash,
    nextContent,
    nextContentHash,
  }
  return skillFileUpdatePlanSchema.parse({ ...unsigned, hash: stableHash(unsigned) })
}

/** 应用经过用户确认的受管 Skill 文件更新，并在失败时恢复原文件。 */
export async function applySkillFileUpdatePlan(context: SkillFileManagerContext, inputPlan: SkillFileUpdatePlan, consent: UserConsent): Promise<SkillFileUpdateReceipt> {
  const plan = skillFileUpdatePlanSchema.parse(inputPlan)
  const { hash: _hash, ...unsigned } = plan
  if (stableHash(unsigned) !== plan.hash || consent.planHash !== plan.hash) throw new Error('Skill 文件更新计划或用户授权已经失效。')
  const { manifest, record } = await resolveManagedSkill(context, plan.skillId)
  if (manifest.revision !== plan.manifestRevision || record.name !== plan.skillName || record.contentHash !== plan.skillContentHash) throw new Error('Skills manifest 已经变化，请重新打开文件。')
  if (await hashSkillDirectory(record.canonicalPath) !== plan.skillContentHash) throw new Error('Skill 内容已经变化，请重新打开文件。')
  const currentFile = await readManagedSkillFile(context, plan.skillId, plan.path)
  if (currentFile.contentHash !== plan.previousContentHash) throw new Error('Skill 文件已经变化，请重新打开文件。')
  if (hashContent(plan.nextContent) !== plan.nextContentHash) throw new Error('Skill 文件更新内容与计划不一致。')

  const transactionRoot = join(context.manifestStore.dataDir, 'transactions', `skill-file-${plan.id}`)
  const backupPath = join(transactionRoot, 'original')
  const temporaryPath = `${currentFile.path ? join(record.canonicalPath, ...currentFile.path.split('/')) : record.canonicalPath}.askx-${plan.id}.tmp`
  const targetPath = join(record.canonicalPath, ...currentFile.path.split('/'))
  const currentMode = (await stat(targetPath)).mode & 0o777
  let originalMoved = false
  let replacementMoved = false
  try {
    await mkdir(transactionRoot, { recursive: true, mode: 0o700 })
    await writeFile(temporaryPath, plan.nextContent, { encoding: 'utf8', mode: currentMode })
    await rename(targetPath, backupPath)
    originalMoved = true
    await rename(temporaryPath, targetPath)
    replacementMoved = true
    const updatedFile = await readManagedSkillFile(context, plan.skillId, plan.path)
    if (updatedFile.contentHash !== plan.nextContentHash) throw new Error('Skill 文件写入后验证失败。')
    const skillContentHash = await hashSkillDirectory(record.canonicalPath)
    const appliedAt = new Date().toISOString()
    const saved = await context.manifestStore.write({
      ...manifest,
      skills: manifest.skills.map((entry) => entry.id === record.id ? { ...entry, contentHash: skillContentHash, updatedAt: appliedAt } : entry),
    }, manifest.revision)
    await rm(transactionRoot, { recursive: true, force: true }).catch(() => undefined)
    return {
      id: randomUUID(),
      planHash: plan.hash,
      appliedAt,
      skillId: record.id,
      path: plan.path,
      contentHash: plan.nextContentHash,
      skillContentHash,
      manifestRevision: saved.revision,
    }
  } catch (error) {
    const rollbackErrors: unknown[] = []
    try {
      if (replacementMoved) await rm(targetPath, { force: true })
      if (originalMoved) await rename(backupPath, targetPath)
      if (originalMoved && hashContent(await readFile(targetPath)) !== plan.previousContentHash) throw new Error('原文件回滚后验证失败。')
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    if (!rollbackErrors.length) await rm(transactionRoot, { recursive: true, force: true }).catch(() => undefined)
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], 'Skill 文件更新失败且未能完整回滚。')
    throw error
  }
}
