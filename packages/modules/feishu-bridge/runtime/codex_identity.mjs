/** Web 桥接客户端的稳定来源标识。 */
export const bridgeWebClientName = "askagent_x_bridge_chat";

/** 飞书桥接客户端的稳定来源标识。 */
export const bridgeFeishuClientName = "feishu_codex_bridge";

/** 兼容仍将 App Server 会话标为 vscode 的 Codex 版本。 */
export const bridgeThreadSourceKinds = Object.freeze(["appServer", "vscode"]);

/** 保留运行环境，但避免继承父进程的桌面客户端身份并切换到桥接专用 Codex Home。 */
export function createBridgeCodexEnvironment(environment = process.env, codexHome) {
  const childEnvironment = { ...environment };
  delete childEnvironment.CODEX_INTERNAL_ORIGINATOR_OVERRIDE;
  if (codexHome) childEnvironment.CODEX_HOME = codexHome;
  return childEnvironment;
}

/** 在协议边界识别 App Server 会话及旧版本创建的桥接会话。 */
export function isBridgeThreadSource(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.source === "appServer") return true;
  return value.source === "vscode"
    && (value.originator === bridgeWebClientName || value.originator === bridgeFeishuClientName);
}
