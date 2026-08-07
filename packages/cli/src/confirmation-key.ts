/** 写计划确认按键的最小状态。 */
export interface ConfirmationKeyState {
  /** 是否按下回车。 */
  return: boolean
  /** 是否按下 Esc。 */
  escape: boolean
}

/**
 * 将终端输入解析为写计划确认结果。
 * @param input Ink 返回的文本输入。
 * @param key 当前特殊按键状态。
 * @returns true 表示确认，false 表示放弃，undefined 表示继续等待。
 */
export function resolveConfirmationInput(input: string, key: ConfirmationKeyState): boolean | undefined {
  if (key.return) return true
  if (key.escape || input.toLocaleLowerCase() === 'q') return false
  return undefined
}
