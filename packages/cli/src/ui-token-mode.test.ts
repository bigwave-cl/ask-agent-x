import { describe, expect, it } from 'vitest'
import { resolveUiTokenServicePreference } from './ui-token-mode.js'

describe('UI Token 服务选择', () => {
  it('通过 pnpm askx 调用时优先读取开发服务', () => {
    expect(resolveUiTokenServicePreference('askx')).toBe('development')
  })

  it('全局命令和其他脚本优先读取安装版后台服务', () => {
    expect(resolveUiTokenServicePreference(undefined)).toBe('installed')
    expect(resolveUiTokenServicePreference('dev')).toBe('installed')
  })
})
