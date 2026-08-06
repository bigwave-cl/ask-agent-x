import { describe, expect, it } from 'vitest'
import { terminalUrl } from './terminal-link.js'

describe('终端 URL', () => {
  it('在交互终端中生成可点击的 OSC 8 链接', () => {
    const url = 'http://127.0.0.1:50835/?token=example'
    expect(terminalUrl(url, true)).toBe(`\u001B]8;;${url}\u001B\\${url}\u001B]8;;\u001B\\`)
  })

  it('在非交互输出中保留普通 URL', () => {
    const url = 'http://127.0.0.1:50835/?token=example'
    expect(terminalUrl(url, false)).toBe(url)
  })

  it('拒绝把控制字符写入超链接控制序列', () => {
    const unsafeUrl = 'http://127.0.0.1/\u001B]8;;unsafe'
    expect(terminalUrl(unsafeUrl, true)).toBe(unsafeUrl)
  })
})
