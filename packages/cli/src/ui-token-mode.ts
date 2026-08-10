/** UI Token 命令应优先读取的服务类型。 */
export type UiTokenServicePreference = 'development' | 'installed'

/**
 * 根据 CLI 调用入口判断 Token 查询顺序。
 * @param lifecycleEvent 包管理器注入的当前脚本名称。
 * @returns 仓库脚本优先开发服务，直接安装命令优先后台服务。
 */
export function resolveUiTokenServicePreference(lifecycleEvent = process.env.npm_lifecycle_event): UiTokenServicePreference {
  return lifecycleEvent === 'askx' ? 'development' : 'installed'
}
