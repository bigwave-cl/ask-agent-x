import { describe, expect, it } from 'vitest'
import { buildLocalOpenInvocation } from './localPathOpener.js'

describe('buildLocalOpenInvocation', () => {
  it('在 macOS 中用 Finder 打开目录并定位文件', () => {
    const launcher = { command: 'open', prefixArgs: [] }
    expect(buildLocalOpenInvocation('system', '/tmp/skills', 'directory', 'darwin', launcher)).toEqual({ command: 'open', args: ['/tmp/skills'] })
    expect(buildLocalOpenInvocation('system', '/tmp/skills/SKILL.md', 'file', 'darwin', launcher)).toEqual({ command: 'open', args: ['-R', '/tmp/skills/SKILL.md'] })
  })

  it('在 Windows 中用资源管理器选择文件', () => {
    expect(buildLocalOpenInvocation('system', 'C:\\skills\\SKILL.md', 'file', 'win32', { command: 'explorer.exe', prefixArgs: [] })).toEqual({
      command: 'explorer.exe',
      args: ['/select,C:\\skills\\SKILL.md'],
    })
  })

  it('保留编辑器启动器参数并直接传入路径', () => {
    expect(buildLocalOpenInvocation('vscode', '/tmp/skills', 'directory', 'darwin', { command: 'open', prefixArgs: ['-a', 'Visual Studio Code'] })).toEqual({
      command: 'open',
      args: ['-a', 'Visual Studio Code', '/tmp/skills'],
    })
  })

  it('Linux 文件管理器打开文件所在目录', () => {
    expect(buildLocalOpenInvocation('system', '/tmp/skills/SKILL.md', 'file', 'linux', { command: 'xdg-open', prefixArgs: [] })).toEqual({
      command: 'xdg-open',
      args: ['/tmp/skills'],
    })
  })
})
