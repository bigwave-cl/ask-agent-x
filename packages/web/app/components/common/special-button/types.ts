import type { AskxIconName } from '@/lib/iconCatalog'

/** 特殊主题按钮尺寸。 */
export type SpecialButtonSize = 'default' | 'compact' | 'signal'

/** 特殊主题按钮色调预设。 */
export type SpecialButtonTone = 'theme' | 'ice'

/** 特殊主题按钮属性。 */
export interface SpecialButtonProps {
  /** 默认文案；未提供默认插槽时使用。 */
  label?: string
  /** 悬停后切换的文案；缺省时继续使用默认文案。 */
  activeLabel?: string
  /** 本地图标；传入 null 时不显示默认图标。 */
  icon?: AskxIconName | null
  /** 按钮尺寸。 */
  size?: SpecialButtonSize
  /** 按钮色调预设。 */
  tone?: SpecialButtonTone
  /** 自定义基础颜色；提供后覆盖色调预设。 */
  color?: string
  /** 原生按钮类型。 */
  type?: 'button' | 'submit' | 'reset'
  /** 是否禁用按钮。 */
  disabled?: boolean
}

/** 特殊主题按钮文字状态。 */
export interface SpecialButtonLabels {
  /** 默认状态字符。 */
  primary: string[]
  /** 交互状态字符。 */
  active: string[]
}

/**
 * 将按钮文案拆分为支持 Unicode 的字符序列。
 *
 * @param label 按钮文案。
 * @returns 可用于逐字动画的字符数组。
 */
export function splitSpecialButtonLabel(label: string) {
  return Array.from(label)
}

/**
 * 解析特殊主题按钮的两组动画文案。
 *
 * @param label 默认文案。
 * @param activeLabel 交互状态文案。
 * @returns 默认状态与交互状态字符。
 */
export function resolveSpecialButtonLabels(label = '', activeLabel?: string): SpecialButtonLabels {
  return {
    primary: splitSpecialButtonLabel(label),
    active: splitSpecialButtonLabel(activeLabel || label),
  }
}

/**
 * 判断按钮是否需要显示图标区域。
 *
 * @param hasIconSlot 是否提供图标插槽。
 * @param icon 默认图标名称。
 * @returns 存在插槽或默认图标时返回 true。
 */
export function shouldRenderSpecialButtonIcon(hasIconSlot: boolean, icon: AskxIconName | null) {
  return hasIconSlot || icon !== null
}
