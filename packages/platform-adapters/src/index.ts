import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type PlatformId = 'agents' | 'codex' | 'claude' | 'cursor'

export interface PlatformDescriptor {
  id: PlatformId
  name: string
  command?: string
  skillsDir: string
  minimumLinkVersion?: string
}

export interface PlatformDetection extends PlatformDescriptor {
  installed: boolean
  skillsDirExists: boolean
  version?: string
  linkSupported: boolean
  notes: string[]
}

export function platformDescriptors(home = homedir()): PlatformDescriptor[] {
  return [
    { id: 'agents', name: 'Agents shared', skillsDir: join(home, '.agents', 'skills') },
    { id: 'codex', name: 'Codex', command: 'codex', skillsDir: join(home, '.codex', 'skills') },
    {
      id: 'claude',
      name: 'Claude Code',
      command: 'claude',
      skillsDir: join(home, '.claude', 'skills'),
      minimumLinkVersion: '2.1.203',
    },
    { id: 'cursor', name: 'Cursor', command: 'cursor', skillsDir: join(home, '.cursor', 'skills') },
  ]
}

function numericVersion(value: string): number[] {
  return value.match(/\d+(?:\.\d+){1,3}/)?.[0].split('.').map(Number) ?? []
}

export function versionAtLeast(actual: string, minimum: string): boolean {
  const left = numericVersion(actual)
  const right = numericVersion(minimum)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return true
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function detectPlatforms(home = homedir()): Promise<PlatformDetection[]> {
  return Promise.all(
    platformDescriptors(home).map(async (descriptor) => {
      let version: string | undefined
      if (descriptor.command) {
        try {
          const result = await execFileAsync(descriptor.command, ['--version'], { timeout: 1500 })
          version = `${result.stdout || result.stderr}`.trim()
        } catch {
          version = undefined
        }
      }
      const installed = descriptor.id === 'agents' ? await pathExists(descriptor.skillsDir) : Boolean(version)
      const linkSupported =
        installed &&
        (!descriptor.minimumLinkVersion || Boolean(version && versionAtLeast(version, descriptor.minimumLinkVersion)))
      const notes: string[] = []
      if (descriptor.id === 'agents') notes.push('Shared discovery directory; not a standalone Agent installation.')
      if (descriptor.id === 'cursor') notes.push('Cursor may discover Skills from additional compatible directories.')
      if (installed && !linkSupported && descriptor.minimumLinkVersion) {
        notes.push(`Linking requires ${descriptor.minimumLinkVersion} or newer.`)
      }
      return {
        ...descriptor,
        installed,
        skillsDirExists: await pathExists(descriptor.skillsDir),
        ...(version ? { version } : {}),
        linkSupported,
        notes,
      }
    }),
  )
}

