/**
 * 在当前进程 PATH 和桌面版安装位置中解析 Codex CLI。
 * @param binary 配置中的命令名或绝对路径。
 * @param environment 解析 PATH 时使用的环境快照。
 * @returns 可执行文件路径；找不到时保留原配置值。
 */
export declare function resolveCodexBinary(binary: string, environment?: NodeJS.ProcessEnv): Promise<string>;
