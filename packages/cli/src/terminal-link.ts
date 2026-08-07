/** OSC 8 超链接起始标记。 */
const osc8Open = (url: string): string => `\u001B]8;;${url}\u001B\\`

/** OSC 8 超链接结束标记。 */
const osc8Close = '\u001B]8;;\u001B\\'

/** 终端链接使用的青色下划线样式。 */
const linkStyle = '\u001B[36m\u001B[4m'

/** 重置终端文本样式。 */
const styleReset = '\u001B[0m'

/**
 * 将 URL 格式化为可点击的终端超链接。
 * @param url 需要显示和打开的完整 URL。
 * @param interactive 当前输出是否连接交互终端。
 * @returns 支持时包含 OSC 8 控制序列，否则返回普通 URL。
 */
export function terminalUrl(url: string, interactive = Boolean(process.stdout.isTTY)): string {
  if (!interactive || /[\u0000-\u001F\u007F]/u.test(url)) return url
  return `${osc8Open(url)}${linkStyle}${url}${styleReset}${osc8Close}`
}
