import { describe, expect, it } from 'vitest'
import { resolveDemoSectionScrollTop } from './demoSectionScroll'

describe('resolveDemoSectionScrollTop', () => {
  it('基于 ScrollArea 当前滚动量计算目标位置', () => {
    expect(resolveDemoSectionScrollTop(4846, 0, 238, 20)).toBe(5064)
  })

  it('支持不在窗口顶部的嵌套滚动视口', () => {
    expect(resolveDemoSectionScrollTop(300, 64, 420, 24)).toBe(632)
  })

  it('不会产生负滚动位置', () => {
    expect(resolveDemoSectionScrollTop(0, 80, 60, 20)).toBe(0)
  })
})
