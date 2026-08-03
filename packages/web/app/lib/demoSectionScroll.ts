/** Demo Section 滚动定位参数。 */
export interface DemoSectionScrollOptions {
  /** 目标与滚动视口顶部保留的距离。 */
  offset?: number
  /** 浏览器滚动行为。 */
  behavior?: ScrollBehavior
}

/**
 * 计算目标元素在自定义滚动视口中的绝对滚动位置。
 * @param viewportScrollTop 当前视口滚动距离。
 * @param viewportTop 视口相对浏览器窗口的顶部位置。
 * @param elementTop 目标元素相对浏览器窗口的顶部位置。
 * @param offset 目标顶部保留距离。
 * @returns 不小于零的视口滚动距离。
 */
export function resolveDemoSectionScrollTop(viewportScrollTop: number, viewportTop: number, elementTop: number, offset = 20): number {
  return Math.max(0, viewportScrollTop + elementTop - viewportTop - offset)
}

/**
 * 将 Demo Section 精确定位到 ScrollArea 视口顶部。
 * @param viewport ScrollArea 实际滚动视口；缺失时回退原生滚动。
 * @param element 需要定位的 Section 元素。
 * @param options 顶部偏移和滚动行为。
 */
export function scrollDemoSectionIntoView(viewport: HTMLElement | null, element: HTMLElement, options: DemoSectionScrollOptions = {}): void {
  const { behavior = 'auto', offset = 20 } = options
  if (!viewport) {
    element.scrollIntoView({ block: 'start', behavior })
    return
  }
  const viewportRect = viewport.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  viewport.scrollTo({
    top: resolveDemoSectionScrollTop(viewport.scrollTop, viewportRect.top, elementRect.top, offset),
    behavior,
  })
}
