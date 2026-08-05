import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectPlatforms, managedDirectoryLinkType, platformDescriptors } from './index.js'

describe('platformDescriptors', () => {
  it('为 macOS 生成 POSIX 用户级 Skills 目录', () => {
    const descriptors = platformDescriptors('/Users/demo', 'posix')

    expect(descriptors.find((platform) => platform.id === 'codex')?.skillsDir).toBe('/Users/demo/.codex/skills')
    expect(descriptors.find((platform) => platform.id === 'claude')?.skillsDir).toBe('/Users/demo/.claude/skills')
    expect(descriptors.find((platform) => platform.id === 'cursor')?.skillsDir).toBe('/Users/demo/.cursor/skills')
  })

  it('为 Windows 生成 win32 用户级 Skills 目录', () => {
    const descriptors = platformDescriptors('C:\\Users\\demo', 'windows')

    expect(descriptors.find((platform) => platform.id === 'codex')?.skillsDir).toBe('C:\\Users\\demo\\.codex\\skills')
    expect(descriptors.find((platform) => platform.id === 'claude')?.skillsDir).toBe('C:\\Users\\demo\\.claude\\skills')
    expect(descriptors.find((platform) => platform.id === 'cursor')?.skillsDir).toBe('C:\\Users\\demo\\.cursor\\skills')
  })

  it('macOS 使用目录软链，Windows 使用目录 junction', () => {
    expect(managedDirectoryLinkType('darwin')).toBe('dir')
    expect(managedDirectoryLinkType('win32')).toBe('junction')
  })
})

describe('detectPlatforms', () => {
  it('根目录代理能力不依赖应用安装状态', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-platform-home-'))
    await mkdir(join(home, '.codex'), { recursive: true })
    const originalPath = process.env.PATH
    process.env.PATH = ''
    try {
      const codex = (await detectPlatforms(home)).find((platform) => platform.id === 'codex')
      expect(codex).toMatchObject({ installed: true, linkSupported: true })
    } finally {
      process.env.PATH = originalPath
    }
  })

  it('未配置 CLI 时仍能识别桌面客户端', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-platform-home-'))
    await mkdir(join(home, 'Applications', 'Claude.app'), { recursive: true })
    const originalPath = process.env.PATH
    process.env.PATH = ''
    try {
      const claude = (await detectPlatforms(home, 'darwin')).find((platform) => platform.id === 'claude')
      expect(claude).toMatchObject({ installed: true, linkSupported: true })
      expect(claude?.notes.join(' ')).toContain('Claude.app')
    } finally {
      process.env.PATH = originalPath
    }
  })
})
