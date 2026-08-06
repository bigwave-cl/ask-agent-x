import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { useNuxtApp } from '#app'
import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, onScopeDispose, readonly, ref, shallowRef, watch } from 'vue'
import type {
  MarkdownRenderNode,
  MarkdownTableCell,
} from './markdownTokens'
import { useMarkdownTypewriterScheduler } from './useMarkdownTypewriterScheduler'

/** MDC 打字机单次追赶使用的目标帧数。 */
const typewriterCatchUpFrameCount = 15
/** 允许渐进裁剪的最大 Markdown 源码长度。 */
const maxProgressiveSourceLength = 20_000

/** MDC 打字机参数。 */
interface UseMarkdownTypewriterOptions {
  /** 调用方最新传入的完整 Markdown。 */
  sourceValue: ComputedRef<string>
  /** 当前已经提交给 marked 的 Markdown。 */
  committedValue: ShallowRef<string>
  /** 当前 Markdown 对应的安全渲染节点。 */
  nodes: ComputedRef<MarkdownRenderNode[]>
  /** 当前文档稳定标识。 */
  cacheKey: ComputedRef<string>
  /** 是否启用节点级打字机。 */
  isEnabled: ComputedRef<boolean>
}

/** MDC 打字机返回值。 */
interface UseMarkdownTypewriterReturn {
  /** 当前允许渲染的安全节点。 */
  visibleNodes: ComputedRef<MarkdownRenderNode[]>
  /** 当前已经展示的安全节点单元数。 */
  visibleUnitCount: Readonly<Ref<number>>
  /** 当前是否仍在提交或展示内容。 */
  isTyping: ComputedRef<boolean>
}

/** 节点裁剪结果。 */
interface MarkdownNodeSliceResult {
  /** 当前预算内允许展示的节点。 */
  nodes: MarkdownRenderNode[]
  /** 本次实际消费的可见单元数。 */
  consumedUnits: number
}

/** 表格单元格裁剪结果。 */
interface MarkdownTableCellSliceResult {
  /** 保持原列结构的表格单元格。 */
  cells: MarkdownTableCell[]
  /** 当前单元格集合实际消费的可见单元数。 */
  consumedUnits: number
}

/**
 * 管理单个 MDC 实例的流式快照提交和节点级打字机。
 *
 * @param options Markdown 源值、解析节点和展示开关。
 * @returns 当前可见节点、展示进度和运行状态。
 */
export function useMarkdownTypewriter(
  options: UseMarkdownTypewriterOptions,
): UseMarkdownTypewriterReturn {
  /** 页面级共享打字机调度器。 */
  const scheduler = useMarkdownTypewriterScheduler()
  /** 当前 Nuxt 应用状态，用于避免 SSR 水合阶段重播动画。 */
  const nuxtApp = useNuxtApp()
  /** 当前 MDC 实例使用的稳定调度标识。 */
  const taskId = Symbol('mdc-typewriter')
  /** 用户系统的减少动态效果偏好。 */
  const preferredReducedMotion = usePreferredReducedMotion()
  /** 尚未提交给 marked 的最新 Markdown。 */
  const pendingValue = shallowRef(options.sourceValue.value)
  /** 当前已经展示的安全节点单元数。 */
  const visibleUnitCount = ref(0)
  /** 已按节点对象缓存的可见单元数量。 */
  const nodeUnitCountCache = new WeakMap<object, number>()
  /** 已按文本节点缓存的 Unicode code point。 */
  const nodeTextUnitCache = new WeakMap<object, string[]>()
  /** 当前文档稳定标识。 */
  let activeCacheKey = options.cacheKey.value
  /** 当前文档是否已经完整展示过。 */
  let hasCompletedCurrentDocument = !shouldAnimate()

  /** 当前安全节点树包含的可见单元总数。 */
  const totalUnitCount = computed(() => countMarkdownNodes(options.nodes.value))
  /** 当前是否仍有源快照或可见节点等待推进。 */
  const isTyping = computed(() => options.isEnabled.value && (
    pendingValue.value !== options.committedValue.value
    || visibleUnitCount.value < totalUnitCount.value
  ))
  /** 当前可用于模板渲染的渐进节点树。 */
  const visibleNodes = computed(() => {
    const nodes = options.nodes.value
    if (!shouldAnimate() || visibleUnitCount.value >= totalUnitCount.value) return nodes
    return sliceMarkdownNodes(nodes, visibleUnitCount.value).nodes
  })

  if (shouldAnimate()) {
    visibleUnitCount.value = 0
    scheduleNextFrame()
  }
  else {
    completeImmediately()
  }

  watch(
    [options.sourceValue, options.cacheKey, options.isEnabled, preferredReducedMotion],
    ([nextValue, nextCacheKey, isEnabled], [previousValue, previousCacheKey, wasEnabled]) => {
      pendingValue.value = nextValue

      if (nextCacheKey !== activeCacheKey || nextCacheKey !== previousCacheKey) {
        activeCacheKey = nextCacheKey
        hasCompletedCurrentDocument = false
        options.committedValue.value = nextValue
        if (shouldAnimate()) {
          visibleUnitCount.value = 0
          scheduleNextFrame()
        }
        else {
          completeImmediately()
        }
        return
      }

      if (!isEnabled || preferredReducedMotion.value === 'reduce' || import.meta.server) {
        completeImmediately()
        return
      }

      if (!wasEnabled && previousValue === nextValue && hasCompletedCurrentDocument) {
        completeImmediately()
        return
      }

      scheduleNextFrame()
    },
    { flush: 'sync' },
  )

  onScopeDispose(() => scheduler.remove(taskId))

  /** @returns 当前实例是否允许执行渐进节点裁剪。 */
  function shouldAnimate(): boolean {
    return import.meta.client
      && !nuxtApp.isHydrating
      && options.isEnabled.value
      && preferredReducedMotion.value !== 'reduce'
      && options.sourceValue.value.length <= maxProgressiveSourceLength
  }

  /** 将当前 MDC 加入共享调度器。 */
  function scheduleNextFrame(): void {
    scheduler.schedule(taskId, advanceTypewriter)
  }

  /**
   * 提交最新快照并推进一次节点展示。
   *
   * @returns 当前实例是否仍需继续调度。
   */
  function advanceTypewriter(): boolean {
    if (!options.isEnabled.value || preferredReducedMotion.value === 'reduce') {
      completeImmediately()
      return false
    }

    if (pendingValue.value !== options.committedValue.value) {
      options.committedValue.value = pendingValue.value
      visibleUnitCount.value = Math.min(visibleUnitCount.value, totalUnitCount.value)
    }

    if (options.committedValue.value.length > maxProgressiveSourceLength) {
      completeImmediately()
      return false
    }

    /** 当前节点树仍未展示的可见单元数量。 */
    const remainingUnits = Math.max(0, totalUnitCount.value - visibleUnitCount.value)
    if (!remainingUnits) {
      hasCompletedCurrentDocument = true
      return pendingValue.value !== options.committedValue.value
    }

    /** 当前帧用于自适应追赶的可见单元数量。 */
    const frameUnits = Math.max(1, Math.ceil(remainingUnits / typewriterCatchUpFrameCount))
    visibleUnitCount.value = Math.min(
      totalUnitCount.value,
      visibleUnitCount.value + frameUnits,
    )
    hasCompletedCurrentDocument = visibleUnitCount.value >= totalUnitCount.value
    return !hasCompletedCurrentDocument || pendingValue.value !== options.committedValue.value
  }

  /** 立即提交并完整展示当前最新 Markdown。 */
  function completeImmediately(): void {
    scheduler.remove(taskId)
    options.committedValue.value = pendingValue.value
    visibleUnitCount.value = totalUnitCount.value
    hasCompletedCurrentDocument = true
  }

  /**
   * 统计节点数组包含的可见单元数量。
   *
   * @param nodes Markdown 安全节点。
   * @returns 可见单元总数。
   */
  function countMarkdownNodes(nodes: MarkdownRenderNode[]): number {
    return nodes.reduce((total, node) => total + countMarkdownNode(node), 0)
  }

  /**
   * 统计单个 Markdown 节点包含的可见单元数量。
   *
   * @param node Markdown 安全节点。
   * @returns 当前节点的可见单元数。
   */
  function countMarkdownNode(node: MarkdownRenderNode): number {
    const cachedCount = nodeUnitCountCache.get(node)
    if (cachedCount !== undefined) return cachedCount

    /** 当前节点包含的可见单元数量。 */
    let unitCount = 0
    switch (node.type) {
      case 'text':
      case 'inlineCode':
      case 'codeBlock':
        unitCount = getNodeTextUnits(node).length
        break
      case 'lineBreak':
      case 'horizontalRule':
      case 'image':
        unitCount = 1
        break
      case 'list':
        unitCount = node.items.reduce((total, item) => total + countMarkdownNodes(item), 0)
        break
      case 'table': {
        const tableUnits = [node.header, ...node.rows]
          .flatMap(row => row)
          .reduce((total, cell) => total + countMarkdownNodes(cell.children), 0)
        unitCount = Math.max(1, tableUnits)
        break
      }
      default:
        unitCount = countMarkdownNodes(node.children)
    }
    nodeUnitCountCache.set(node, unitCount)
    return unitCount
  }

  /**
   * 获取文本节点对应的 Unicode code point。
   *
   * @param node 文本、行内代码或代码块节点。
   * @returns 可安全裁剪的文本单元。
   */
  function getNodeTextUnits(
    node: Extract<MarkdownRenderNode, { type: 'text' | 'inlineCode' | 'codeBlock' }>,
  ): string[] {
    const cachedUnits = nodeTextUnitCache.get(node)
    if (cachedUnits) return cachedUnits
    /** 当前文本节点拆分后的 Unicode code point。 */
    const textUnits = Array.from(node.value)
    nodeTextUnitCache.set(node, textUnits)
    return textUnits
  }

  /**
   * 按可见单元预算裁剪 Markdown 节点数组。
   *
   * @param nodes 完整安全节点。
   * @param availableUnits 当前可见单元预算。
   * @returns 裁剪后的节点及实际消费数量。
   */
  function sliceMarkdownNodes(
    nodes: MarkdownRenderNode[],
    availableUnits: number,
  ): MarkdownNodeSliceResult {
    if (availableUnits <= 0) return { nodes: [], consumedUnits: 0 }
    /** 当前预算允许展示的节点。 */
    const visibleNodes: MarkdownRenderNode[] = []
    /** 当前已经消费的可见单元数。 */
    let consumedUnits = 0

    for (const node of nodes) {
      const remainingUnits = availableUnits - consumedUnits
      if (remainingUnits <= 0) break
      /** 当前完整节点包含的可见单元数。 */
      const nodeUnits = countMarkdownNode(node)
      if (nodeUnits <= remainingUnits) {
        visibleNodes.push(node)
        consumedUnits += nodeUnits
        continue
      }

      const slicedNode = sliceMarkdownNode(node, remainingUnits)
      if (slicedNode.node) visibleNodes.push(slicedNode.node)
      consumedUnits += slicedNode.consumedUnits
      break
    }

    return { nodes: visibleNodes, consumedUnits }
  }

  /**
   * 按预算裁剪单个 Markdown 节点。
   *
   * @param node 完整安全节点。
   * @param availableUnits 当前节点可用预算。
   * @returns 裁剪节点及实际消费数量。
   */
  function sliceMarkdownNode(
    node: MarkdownRenderNode,
    availableUnits: number,
  ): { node: MarkdownRenderNode | null, consumedUnits: number } {
    if (availableUnits <= 0) return { node: null, consumedUnits: 0 }

    switch (node.type) {
      case 'text':
      case 'inlineCode':
      case 'codeBlock': {
        const visibleText = getNodeTextUnits(node).slice(0, availableUnits).join('')
        return {
          node: visibleText ? { ...node, value: visibleText } : null,
          consumedUnits: Array.from(visibleText).length,
        }
      }
      case 'lineBreak':
      case 'horizontalRule':
      case 'image':
        return { node, consumedUnits: 1 }
      case 'list':
        return sliceMarkdownListNode(node, availableUnits)
      case 'table':
        return sliceMarkdownTableNode(node, availableUnits)
      default: {
        const slicedChildren = sliceMarkdownNodes(node.children, availableUnits)
        return {
          node: slicedChildren.nodes.length
            ? { ...node, children: slicedChildren.nodes }
            : null,
          consumedUnits: slicedChildren.consumedUnits,
        }
      }
    }
  }

  /**
   * 按顺序裁剪列表项。
   *
   * @param node 完整列表节点。
   * @param availableUnits 当前列表可用预算。
   * @returns 裁剪后的列表节点及实际消费数量。
   */
  function sliceMarkdownListNode(
    node: Extract<MarkdownRenderNode, { type: 'list' }>,
    availableUnits: number,
  ): { node: MarkdownRenderNode | null, consumedUnits: number } {
    /** 当前允许展示的列表项。 */
    const visibleItems: MarkdownRenderNode[][] = []
    /** 当前列表已经消费的可见单元数。 */
    let consumedUnits = 0
    for (const item of node.items) {
      const remainingUnits = availableUnits - consumedUnits
      if (remainingUnits <= 0) break
      const itemUnits = countMarkdownNodes(item)
      if (itemUnits <= remainingUnits) {
        visibleItems.push(item)
        consumedUnits += itemUnits
        continue
      }
      const slicedItem = sliceMarkdownNodes(item, remainingUnits)
      if (slicedItem.nodes.length) visibleItems.push(slicedItem.nodes)
      consumedUnits += slicedItem.consumedUnits
      break
    }
    return {
      node: visibleItems.length ? { ...node, items: visibleItems } : null,
      consumedUnits,
    }
  }

  /**
   * 保持列结构并裁剪表格正文。
   *
   * @param node 完整表格节点。
   * @param availableUnits 当前表格可用预算。
   * @returns 裁剪后的表格节点及实际消费数量。
   */
  function sliceMarkdownTableNode(
    node: Extract<MarkdownRenderNode, { type: 'table' }>,
    availableUnits: number,
  ): { node: MarkdownRenderNode, consumedUnits: number } {
    const headerSlice = sliceMarkdownTableCells(node.header, availableUnits)
    /** 当前允许展示的表格数据行。 */
    const visibleRows: MarkdownTableCell[][] = []
    /** 当前表格已经消费的可见单元数。 */
    let consumedUnits = headerSlice.consumedUnits

    if (consumedUnits >= countMarkdownTableCells(node.header)) {
      for (const row of node.rows) {
        const remainingUnits = availableUnits - consumedUnits
        if (remainingUnits <= 0) break
        const rowUnits = countMarkdownTableCells(row)
        if (rowUnits <= remainingUnits) {
          visibleRows.push(row)
          consumedUnits += rowUnits
          continue
        }
        const rowSlice = sliceMarkdownTableCells(row, remainingUnits)
        visibleRows.push(rowSlice.cells)
        consumedUnits += rowSlice.consumedUnits
        break
      }
    }

    return {
      node: {
        ...node,
        header: headerSlice.cells,
        rows: visibleRows,
      },
      consumedUnits: Math.max(1, consumedUnits),
    }
  }

  /**
   * 按顺序裁剪一组表格单元格并保留全部列。
   *
   * @param cells 完整表格单元格。
   * @param availableUnits 当前单元格集合可用预算。
   * @returns 保持列结构的单元格及实际消费数量。
   */
  function sliceMarkdownTableCells(
    cells: MarkdownTableCell[],
    availableUnits: number,
  ): MarkdownTableCellSliceResult {
    /** 当前可见的表格单元格。 */
    const visibleCells: MarkdownTableCell[] = []
    /** 当前单元格集合已经消费的可见单元数。 */
    let consumedUnits = 0
    for (const cell of cells) {
      const remainingUnits = Math.max(0, availableUnits - consumedUnits)
      const cellUnits = countMarkdownNodes(cell.children)
      if (cellUnits <= remainingUnits) {
        visibleCells.push(cell)
        consumedUnits += cellUnits
        continue
      }
      const slicedCell = sliceMarkdownNodes(cell.children, remainingUnits)
      visibleCells.push({ ...cell, children: slicedCell.nodes })
      consumedUnits += slicedCell.consumedUnits
    }
    return { cells: visibleCells, consumedUnits }
  }

  /**
   * 统计一组表格单元格包含的可见单元数。
   *
   * @param cells 表格单元格。
   * @returns 可见单元总数。
   */
  function countMarkdownTableCells(cells: MarkdownTableCell[]): number {
    return cells.reduce((total, cell) => total + countMarkdownNodes(cell.children), 0)
  }

  return {
    visibleNodes,
    visibleUnitCount: readonly(visibleUnitCount),
    isTyping,
  }
}
