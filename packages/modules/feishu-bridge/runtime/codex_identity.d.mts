/** Web 桥接客户端的稳定来源标识。 */
export declare const bridgeWebClientName: "askagent_x_bridge_chat";
/** 飞书桥接客户端的稳定来源标识。 */
export declare const bridgeFeishuClientName: "feishu_codex_bridge";
/** 服务端来源候选范围，返回后须经来源核验。 */
export declare const bridgeThreadSourceKinds: readonly ["appServer", "vscode"];
/** 创建去除父进程桌面身份覆盖项的子进程环境。 */
export declare function createBridgeCodexEnvironment(environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
/** 核验协议记录是否属于 App Server 或已知桥接客户端。 */
export declare function isBridgeThreadSource(value: unknown): boolean;
