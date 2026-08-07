import { describe, expect, it } from 'vitest'
import { resolveSkillsScanInvocationMode } from './skills-scan-mode.js'

describe('resolveSkillsScanInvocationMode', () => {
  it('无参数时执行完整整理', () => {
    expect(resolveSkillsScanInvocationMode({ platforms: [], directories: [] })).toBe('full-reconcile')
  })

  it('任一来源参数存在时执行定向导入', () => {
    expect(resolveSkillsScanInvocationMode({ platforms: ['claude'], directories: [] })).toBe('targeted-import')
    expect(resolveSkillsScanInvocationMode({ platforms: [], directories: ['/tmp/skills'] })).toBe('targeted-import')
  })

  it('JSON 始终保持只读', () => {
    expect(resolveSkillsScanInvocationMode({ json: true, platforms: ['claude'], directories: [] })).toBe('read-only')
  })
})
