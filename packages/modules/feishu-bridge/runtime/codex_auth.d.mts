/** 读取桥接配置使用的 API key。 */
export declare function readBridgeApiKey(authFile?: string): string | null;
/** 确保独立 CODEX_HOME 已完成 app-server 认证。 */
export declare function ensureBridgeCodexAuth(request: (method: string, params?: Record<string, unknown>) => Promise<any>, authFile?: string): Promise<{ mode: string | null }>;
/** 读取现有 Codex 配置中的非敏感 provider 设置。 */
export declare function readBridgeProviderConfig(configFile?: string): { model: string | null, provider: string, name: string, baseUrl: string, wireApi: string | null, requiresOpenaiAuth: boolean | null } | null;
/** 将 provider 设置写入桥接专用 CODEX_HOME。 */
export declare function ensureBridgeProviderConfig(codexHome: string, configFile?: string): boolean;
