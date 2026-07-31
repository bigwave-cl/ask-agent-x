import { describe, expect, it } from 'vitest'
import { parseSelectedLocalDirectories } from './localDirectoryPicker.js'

describe('parseSelectedLocalDirectories', () => {
  it('解析、去重并排序绝对目录', () => {
    expect(parseSelectedLocalDirectories('["/tmp/zeta","/tmp/alpha","/tmp/zeta"]')).toEqual([
      { name: 'alpha', path: '/tmp/alpha' },
      { name: 'zeta', path: '/tmp/zeta' },
    ])
  })

  it('拒绝浏览器伪造的相对路径', () => {
    expect(() => parseSelectedLocalDirectories('["skills/demo"]')).toThrow('无效路径')
  })
})
