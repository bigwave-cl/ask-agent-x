import { mkdtemp, mkdir, readdir as actualReaddir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const retryState = vi.hoisted(() => ({ target: '', failures: 0, failForever: false }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readdir: vi.fn(async (...args: Parameters<typeof actual.readdir>) => {
      if (String(args[0]) === retryState.target && (retryState.failForever || retryState.failures < 2)) {
        retryState.failures += 1
        const error = new Error('transient macOS denial') as NodeJS.ErrnoException
        error.code = 'EPERM'
        throw error
      }
      return actual.readdir(...args)
    }),
  }
})

import { scanSkills, SkillDirectoryAccessError } from './scanner.js'

describe('Skill 目录瞬时权限错误重试', () => {
  it('EPERM 消失后继续扫描，不要求用户修改系统权限', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-scanner-retry-'))
    const customRoot = join(home, 'shared-skills')
    await mkdir(join(customRoot, 'demo'), { recursive: true })
    await writeFile(join(customRoot, 'demo', 'SKILL.md'), '---\nname: demo\ndescription: retry test\n---\n')
    retryState.target = customRoot
    retryState.failures = 0
    retryState.failForever = false

    const report = await scanSkills(home, join(home, '.askx'), [], [customRoot])

    expect(retryState.failures).toBe(2)
    expect(report.groups.map((group) => group.name)).toEqual(['demo'])
  })

  it('持续 EPERM 时保留目录和错误码供入口层发起 macOS 授权', async () => {
    const home = await mkdtemp(join(tmpdir(), 'askx-scanner-denied-'))
    const customRoot = join(home, 'Desktop', 'shared-skills')
    await mkdir(join(customRoot, 'demo'), { recursive: true })
    await writeFile(join(customRoot, 'demo', 'SKILL.md'), '---\nname: demo\ndescription: permission test\n---\n')
    retryState.target = customRoot
    retryState.failures = 0
    retryState.failForever = true

    await expect(scanSkills(home, join(home, '.askx'), [], [customRoot])).rejects.toMatchObject({
      name: 'SkillDirectoryAccessError',
      path: customRoot,
      causeCode: 'EPERM',
    } satisfies Partial<SkillDirectoryAccessError>)
  })
})
