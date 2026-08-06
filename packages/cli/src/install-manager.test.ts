import { describe, expect, it } from 'vitest'
import { createUninstallInvocation, packageManagerFromInstallPath, packageManagerFromUserAgent } from './install-manager.js'

describe('安装包管理器识别', () => {
  it.each([
    ['npm/11.0.0 node/v22', 'npm'],
    ['pnpm/11.1.0 npm/? node/v22', 'pnpm'],
    ['yarn/1.22.22 npm/? node/v22', 'yarn'],
    ['bun/1.3.0 npm/? node/v22', 'bun'],
  ] as const)('从 %s 识别 %s', (userAgent, expected) => {
    expect(packageManagerFromUserAgent(userAgent)).toBe(expected)
  })

  it('从常见全局目录推断安装器', () => {
    expect(packageManagerFromInstallPath('/usr/local/lib/node_modules/askagent-x')).toBe('npm')
    expect(packageManagerFromInstallPath('/Users/me/Library/pnpm/global/5/node_modules/askagent-x')).toBe('pnpm')
    expect(packageManagerFromInstallPath('/Users/me/.config/yarn/global/node_modules/askagent-x')).toBe('yarn')
    expect(packageManagerFromInstallPath('/Users/me/.bun/install/global/node_modules/askagent-x')).toBe('bun')
  })

  it('为每个安装器生成对应卸载命令', () => {
    expect(createUninstallInvocation('npm', 'linux')).toEqual({ command: 'npm', args: ['remove', '--global', 'askagent-x'] })
    expect(createUninstallInvocation('pnpm', 'linux')).toEqual({ command: 'pnpm', args: ['remove', '--global', 'askagent-x'] })
    expect(createUninstallInvocation('yarn', 'linux')).toEqual({ command: 'yarn', args: ['global', 'remove', 'askagent-x'] })
    expect(createUninstallInvocation('bun', 'win32')).toEqual({ command: 'bun', args: ['remove', '--global', 'askagent-x'] })
  })
})
