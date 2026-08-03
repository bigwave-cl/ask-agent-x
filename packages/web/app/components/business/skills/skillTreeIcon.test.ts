import { describe, expect, it } from 'vitest'
import { resolveSkillTreeIcon } from './skillTreeIcon'

describe('Skill 文件图标', () => {
  it('区分目录、软链接和常见源码文件', () => {
    expect(resolveSkillTreeIcon('scripts', 'directory')).toBe('askx-objects:folder')
    expect(resolveSkillTreeIcon('scripts', 'directory', true)).toBe('askx-objects:folder-open')
    expect(resolveSkillTreeIcon('shared', 'symlink')).toBe('askx-objects:file-link')
    expect(resolveSkillTreeIcon('SKILL.md', 'file')).toBe('askx-objects:file-markdown')
    expect(resolveSkillTreeIcon('index.ts', 'file')).toBe('askx-objects:file-code')
    expect(resolveSkillTreeIcon('page.html', 'file')).toBe('askx-objects:file-html')
    expect(resolveSkillTreeIcon('theme.scss', 'file')).toBe('askx-objects:file-style')
    expect(resolveSkillTreeIcon('install.sh', 'file')).toBe('askx-objects:file-shell')
  })

  it('使用模板后缀前的真实文件类型', () => {
    expect(resolveSkillTreeIcon('config.local.json.example', 'file')).toBe('askx-objects:file-json')
    expect(resolveSkillTreeIcon('page.html.template', 'file')).toBe('askx-objects:file-html')
  })
})
