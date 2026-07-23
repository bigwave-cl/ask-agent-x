import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, readlink } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { stableHash } from '@askx/core'
import { platformDescriptors, type PlatformId } from '@askx/platform-adapters'

export interface SkillLocation {
  platform: PlatformId | 'askx'
  name: string
  path: string
  kind: 'directory' | 'symlink'
  target?: string
  contentHash?: string
}

export interface SkillConflict {
  name: string
  hashes: string[]
  locations: string[]
}

export interface SkillsTopology {
  roots: Array<{ platform: PlatformId | 'askx'; path: string; exists: boolean }>
  skills: SkillLocation[]
  conflicts: SkillConflict[]
  brokenLinks: string[]
  fingerprint: string
}

async function hashDirectory(root: string): Promise<string> {
  const hash = createHash('sha256')
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const path = join(directory, entry.name)
      const name = relative(root, path)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) hash.update(name).update('\0').update(await readFile(path)).update('\0')
      else if (entry.isSymbolicLink()) hash.update(name).update('\0link:').update(await readlink(path)).update('\0')
    }
  }
  await visit(root)
  return hash.digest('hex')
}

export async function scanSkills(homeDir: string, dataDir: string): Promise<SkillsTopology> {
  const roots = [
    ...platformDescriptors(homeDir).map(({ id, skillsDir }) => ({ platform: id, path: skillsDir })),
    { platform: 'askx' as const, path: join(dataDir, 'skills') },
  ]
  const skills: SkillLocation[] = []
  const brokenLinks: string[] = []
  const rootStates: SkillsTopology['roots'] = []

  for (const root of roots) {
    try {
      const entries = await readdir(root.path, { withFileTypes: true })
      rootStates.push({ ...root, exists: true })
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
        const path = join(root.path, entry.name)
        const stat = await lstat(path)
        if (stat.isSymbolicLink()) {
          const target = await readlink(path)
          try {
            const contentHash = await hashDirectory(path)
            skills.push({ platform: root.platform, name: entry.name, path, kind: 'symlink', target, contentHash })
          } catch {
            brokenLinks.push(path)
            skills.push({ platform: root.platform, name: entry.name, path, kind: 'symlink', target })
          }
        } else {
          skills.push({
            platform: root.platform,
            name: entry.name,
            path,
            kind: 'directory',
            contentHash: await hashDirectory(path),
          })
        }
      }
    } catch {
      rootStates.push({ ...root, exists: false })
    }
  }

  const grouped = new Map<string, SkillLocation[]>()
  for (const skill of skills.filter((entry) => entry.contentHash)) {
    grouped.set(skill.name, [...(grouped.get(skill.name) ?? []), skill])
  }
  const conflicts = [...grouped.entries()].flatMap(([name, entries]) => {
    const hashes = [...new Set(entries.map((entry) => entry.contentHash as string))]
    return hashes.length > 1 ? [{ name, hashes, locations: entries.map((entry) => entry.path) }] : []
  })
  return {
    roots: rootStates,
    skills,
    conflicts,
    brokenLinks,
    fingerprint: stableHash({ roots: rootStates, skills, conflicts, brokenLinks }),
  }
}
