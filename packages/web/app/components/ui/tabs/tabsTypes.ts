import type { TabsListProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

/** Tabs 的视觉形态。 */
export type TabsVariant = 'line' | 'tag' | 'segment'

/** 单个 Tab Trigger 的实际高度。 */
export type TabsSize = '28' | '36' | '40' | '44'

/** Tag 与 Segment 的圆角形态。 */
export type TabsShape = 'regular' | 'pill'

/** AskX TabsList 对外属性。 */
export interface AskxTabsListProps extends TabsListProps {
  /** 根节点样式。 */
  class?: HTMLAttributes['class']
  /** 标签栏视觉形态。 */
  variant?: TabsVariant
  /** 单个标签高度。 */
  size?: TabsSize
  /** 标签圆角形态。 */
  shape?: TabsShape
  /** 内容溢出时是否允许横向滚动。 */
  scrollable?: boolean
}

/** 默认标签栏形态。 */
export const tabsDefaultVariant: TabsVariant = 'line'

/** 默认标签高度。 */
export const tabsDefaultSize: TabsSize = '40'

/** 默认标签圆角。 */
export const tabsDefaultShape: TabsShape = 'pill'

/** 默认关闭横向滚动。 */
export const tabsDefaultScrollable = false
