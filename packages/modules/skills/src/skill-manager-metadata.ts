import { createHash, randomBytes } from 'node:crypto'
import { lstat, readFile, readdir, readlink, writeFile } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { z } from 'zod'
import { skillManagerOwnerSchema } from './skill-types.js'

/** AskX 内置 Skill Manager 的名称。 */
export const ASKX_SKILL_MANAGER_NAME = 'askx-skill-manager'

/** Skill Manager 身份文件名称。 */
export const SKILL_MANAGER_METADATA_FILE = '.skill-manager.json'

/** Skill Manager 托管身份。 */
export type SkillManagerOwner = z.infer<typeof skillManagerOwnerSchema>

/** Skill Manager 身份文件 schema。 */
export const skillManagerMetadataSchema = z.object({
  schema: z.literal(1),
  skill_id: z.string().regex(/^skill_\d{2}_\d{3,4}_[a-f0-9]{10}$/),
  version: z.string().regex(/^\d{2}\.\d{3,4}\.\d+$/),
  local_only: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  managed_by: skillManagerOwnerSchema,
})

/** Skill Manager 身份文件。 */
export type SkillManagerMetadata = z.infer<typeof skillManagerMetadataSchema>

/** Skill Manager 元数据的可解释状态。 */
export type SkillManagerState = 'askx-managed' | 'bobo-managed' | 'unmanaged' | 'metadata-stale' | 'metadata-invalid'

/** Skill 事务和业务内容使用的两类指纹。 */
export interface ManagedSkillFingerprint {
  /** 事务校验使用的完整指纹。 */
  contentHash: string
  /** 版本管理使用的业务内容指纹。 */
  businessContentHash: string
}

/** 元数据只读检测结果。 */
export interface SkillManagerInspection {
  /** 当前 manager 状态。 */
  state: SkillManagerState
  /** 校验成功的 manager 元数据。 */
  metadata?: SkillManagerMetadata
  /** 无法使用元数据时的原因。 */
  error?: string
}

/** 托管声明的固定标题。 */
const MANAGED_HEADING = '## Managed By'

/** 返回 Asia/Shanghai 的日期版本前缀。 */
function versionDate(now: Date): { year: string; monthDay: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: '2-digit',
    month: 'numeric',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return { year: value('year'), monthDay: `${Number(value('month'))}${value('day')}` }
}

/** 生成新的 manager skill_id。 */
export function createManagerSkillId(now = new Date()): string {
  const date = versionDate(now)
  return `skill_${date.year}_${date.monthDay}_${randomBytes(5).toString('hex')}`
}

/** 生成或递增 `YY.MDD.N` 内容版本。 */
export function nextManagerVersion(previous?: string, now = new Date()): string {
  const date = versionDate(now)
  const prefix = `${date.year}.${date.monthDay}.`
  if (!previous?.startsWith(prefix)) return `${prefix}1`
  const sequence = Number(previous.slice(prefix.length))
  return `${prefix}${Number.isSafeInteger(sequence) && sequence > 0 ? sequence + 1 : 1}`
}

/** 比较两个 manager 日期版本。 */
export function compareManagerVersions(left: string, right: string): number | undefined {
  const parse = (value: string): number[] | undefined => {
    const matched = value.match(/^(\d{2})\.(\d{3,4})\.(\d+)$/)
    return matched ? matched.slice(1).map(Number) : undefined
  }
  const leftParts = parse(left)
  const rightParts = parse(right)
  if (!leftParts || !rightParts) return undefined
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!
    if (difference) return difference
  }
  return 0
}

/** 判断指定相对路径是否属于运行时 registry。 */
function isRuntimeRegistry(root: string, path: string): boolean {
  return basename(root) === ASKX_SKILL_MANAGER_NAME && (path === 'registry' || path.startsWith('registry/'))
}

/** 为 Skill 目录生成可配置排除项的稳定 SHA-256。 */
async function hashDirectory(root: string, businessOnly: boolean): Promise<string> {
  const hash = createHash('sha256')
  /** 按稳定顺序读取一个真实目录。 */
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const path = join(directory, entry.name)
      const name = relative(root, path).split('\\').join('/')
      if (isRuntimeRegistry(root, name)) continue
      if (businessOnly && (name === SKILL_MANAGER_METADATA_FILE || name === '.skill-sync.json')) continue
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) hash.update(name).update('\0').update(await readFile(path)).update('\0')
      else if (entry.isSymbolicLink()) hash.update(name).update('\0link:').update(await readlink(path)).update('\0')
    }
  }
  await visit(root)
  return hash.digest('hex')
}

/** 读取事务指纹和版本业务指纹。 */
export async function fingerprintManagedSkill(root: string): Promise<ManagedSkillFingerprint> {
  const [contentHash, businessContentHash] = await Promise.all([hashDirectory(root, false), hashDirectory(root, true)])
  return { contentHash, businessContentHash }
}

/** 读取并校验可选的 Skill Manager 身份。 */
export async function inspectSkillManagerMetadata(root: string, businessContentHash?: string): Promise<SkillManagerInspection> {
  try {
    const value: unknown = JSON.parse(await readFile(join(root, SKILL_MANAGER_METADATA_FILE), 'utf8'))
    const parsed = skillManagerMetadataSchema.safeParse(value)
    if (!parsed.success) return { state: 'metadata-invalid', error: parsed.error.issues[0]?.message ?? 'Skill Manager 元数据无效。' }
    const actualHash = businessContentHash ?? (await fingerprintManagedSkill(root)).businessContentHash
    if (parsed.data.content_sha256 !== actualHash) return { state: 'metadata-stale', metadata: parsed.data, error: 'Skill 业务内容与声明指纹不一致。' }
    return { state: parsed.data.managed_by === ASKX_SKILL_MANAGER_NAME ? 'askx-managed' : 'bobo-managed', metadata: parsed.data }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'unmanaged' }
    if (error instanceof SyntaxError) return { state: 'metadata-invalid', error: 'Skill Manager 元数据不是有效 JSON。' }
    return { state: 'metadata-invalid', error: (error as Error).message }
  }
}

/** 创建一份新的 AskX Skill Manager 元数据。 */
export function createSkillManagerMetadata(businessContentHash: string, localOnly: boolean, now = new Date()): SkillManagerMetadata {
  const timestamp = now.toISOString()
  return skillManagerMetadataSchema.parse({
    schema: 1,
    skill_id: createManagerSkillId(now),
    version: nextManagerVersion(undefined, now),
    local_only: localOnly,
    created_at: timestamp,
    updated_at: timestamp,
    content_sha256: businessContentHash,
    managed_by: ASKX_SKILL_MANAGER_NAME,
  })
}

/** 根据业务内容更新既有元数据，并可迁移 owner/local-only 范围。 */
export function updateSkillManagerMetadata(metadata: SkillManagerMetadata, businessContentHash: string, options: { migrateOwner?: boolean; localOnly?: boolean; bumpVersion?: boolean } = {}, now = new Date()): SkillManagerMetadata {
  return skillManagerMetadataSchema.parse({
    ...metadata,
    version: options.bumpVersion === false ? metadata.version : nextManagerVersion(metadata.version, now),
    local_only: options.localOnly ?? metadata.local_only,
    updated_at: now.toISOString(),
    content_sha256: businessContentHash,
    managed_by: options.migrateOwner ? ASKX_SKILL_MANAGER_NAME : metadata.managed_by,
  })
}

/** 原子写入前由事务目录承载，因此这里只负责稳定序列化身份文件。 */
export async function writeSkillManagerMetadata(root: string, metadata: SkillManagerMetadata): Promise<void> {
  await writeFile(join(root, SKILL_MANAGER_METADATA_FILE), `${JSON.stringify(skillManagerMetadataSchema.parse(metadata), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

/** 为 SKILL.md 增加或迁移 AskX 托管声明。 */
export async function ensureAskxManagedDeclaration(root: string, localOnly: boolean): Promise<void> {
  const path = join(root, 'SKILL.md')
  let source = await readFile(path, 'utf8')
  const block = `${MANAGED_HEADING}\n\nThis ${localOnly ? 'local-only ' : ''}skill is managed by \`askx-skill-manager\`.\nAfter using this skill, record usage through \`askx skills usage record\`.\n`
  const pattern = /\n## Managed By\n[\s\S]*?(?=\n## |$)/
  source = pattern.test(source) ? source.replace(pattern, `\n${block.trimEnd()}`) : `${source.trimEnd()}\n\n${block}`
  await writeFile(path, source, 'utf8')
}

/** 从 SKILL.md 中移除 AskX 自己写入的托管声明，不触碰其他 Managed By 内容。 */
export async function removeAskxManagedDeclaration(root: string): Promise<void> {
  const path = join(root, 'SKILL.md')
  const source = await readFile(path, 'utf8')
  const pattern = /\n## Managed By\n[\s\S]*?(?=\n## |$)/
  const next = source.replace(pattern, block => block.includes('`askx-skill-manager`') ? '' : block).replace(/\s+$/, '\n')
  if (next !== source) await writeFile(path, next, 'utf8')
}

/** 判断一个普通文件是否存在。 */
export async function managerMetadataExists(root: string): Promise<boolean> {
  try {
    return (await lstat(join(root, SKILL_MANAGER_METADATA_FILE))).isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
