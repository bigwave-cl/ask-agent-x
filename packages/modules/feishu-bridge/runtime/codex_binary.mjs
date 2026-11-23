import { constants } from "node:fs";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** 判断路径是否指向当前用户可执行的文件。 */
async function isExecutable(filePath) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** 返回 macOS 桌面版常见的 Codex CLI 安装位置。 */
function desktopCandidates(binary) {
  if (process.platform !== "darwin" || binary !== "codex") return [];
  return [
    "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
    path.join(os.homedir(), "Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"),
    "/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
  ];
}

/**
 * 在当前进程 PATH 和桌面版安装位置中解析 Codex CLI。
 * @param binary 配置中的命令名或绝对路径。
 * @param environment 解析 PATH 时使用的环境快照。
 * @returns 可执行文件路径；找不到时保留原配置值，让调用方返回原生启动错误。
 */
export async function resolveCodexBinary(binary, environment = process.env) {
  if (path.isAbsolute(binary) || binary.includes("/") || binary.includes("\\")) return binary;
  const pathEntries = (environment.PATH ?? "").split(path.delimiter).filter(Boolean);
  const candidates = pathEntries.map(entry => path.join(entry, binary));
  candidates.push(...desktopCandidates(binary));
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) return candidate;
  }
  return binary;
}
