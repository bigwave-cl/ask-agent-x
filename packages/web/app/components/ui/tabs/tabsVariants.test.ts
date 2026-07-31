import { describe, expect, it } from 'vitest'
import {
  tabsDefaultScrollable,
  tabsDefaultShape,
  tabsDefaultSize,
  tabsDefaultVariant,
} from './tabsTypes'
import { tabsListVariants, tabsTriggerClass } from './tabsVariants'

describe('Tabs 视觉契约', () => {
  it('沿用 PG 推荐的默认规格', () => {
    expect({
      variant: tabsDefaultVariant,
      size: tabsDefaultSize,
      shape: tabsDefaultShape,
      scrollable: tabsDefaultScrollable,
    }).toEqual({ variant: 'line', size: '40', shape: 'pill', scrollable: false })
  })

  it('为三种视觉形态生成 DS token 样式', () => {
    expect(tabsListVariants({ variant: 'line' })).toContain('gap-10')
    expect(tabsListVariants({ variant: 'tag' })).toContain('gap-2')
    expect(tabsListVariants({ variant: 'segment' })).toContain('bg-ds-fill-bw-transparent-5')
    expect(tabsTriggerClass).toContain('bg-ds-fill-brand-transparent-10')
    expect(tabsTriggerClass).toContain('group-data-[variant=line]/tabs-list:disabled:border-transparent')
  })

  it('横向滚动模式隐藏原生滚动条但保留滚动能力', () => {
    const className = tabsListVariants({ scrollable: true })
    expect(className).toContain('overflow-x-auto')
    expect(className).toContain('[scrollbar-width:none]')
  })
})
