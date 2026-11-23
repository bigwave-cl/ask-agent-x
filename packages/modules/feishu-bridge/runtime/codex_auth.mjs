import fs from "node:fs";

/** 读取桥接配置使用的 API key，不把凭据内容写入日志或源文件。 */
export function readBridgeApiKey(authFile) {
  if (!authFile) return null;
  try {
    const value = JSON.parse(fs.readFileSync(authFile, "utf8"));
    const apiKey = value?.OPENAI_API_KEY;
    return typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Bridge Codex auth file could not be read: ${authFile}`);
  }
}

/** 确保独立 CODEX_HOME 已通过 app-server 官方认证接口完成登录。 */
export async function ensureBridgeCodexAuth(request, authFile) {
  if (!authFile) return { mode: null };
  const account = await request("account/read", { refreshToken: false });
  if (account?.account?.type) return { mode: account.account.type };
  if (account?.requiresOpenaiAuth !== true) return { mode: null };
  const apiKey = readBridgeApiKey(authFile);
  if (!apiKey) throw new Error(`Bridge Codex authentication is unavailable; configure a readable auth file: ${authFile}`);
  await request("account/login/start", { type: "apiKey", apiKey });
  return { mode: "apiKey" };
}

function quotedValue(section, name) {
  const match = section.match(new RegExp(`^\\s*${name}\\s*=\\s*"([^"\\n]*)"`, "m"));
  return match?.[1] ?? null;
}

function booleanValue(section, name) {
  const match = section.match(new RegExp(`^\\s*${name}\\s*=\\s*(true|false)`, "m"));
  return match ? match[1] === "true" : null;
}

/** 从用户现有 config.toml 提取非敏感的模型提供商设置。 */
export function readBridgeProviderConfig(configFile) {
  if (!configFile) return null;
  let content;
  try { content = fs.readFileSync(configFile, "utf8"); }
  catch (error) { return error?.code === "ENOENT" ? null : null; }
  const provider = quotedValue(content, "model_provider");
  if (!provider) return null;
  const model = quotedValue(content, "model");
  const sectionPattern = new RegExp(`^\\[model_providers\\.${provider.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\]\\s*$`, "m");
  const sectionMatch = sectionPattern.exec(content);
  if (!sectionMatch || sectionMatch.index === undefined) return null;
  const sectionStart = sectionMatch.index + sectionMatch[0].length;
  const nextSection = content.slice(sectionStart).search(/^\[/m);
  const section = content.slice(sectionStart, nextSection < 0 ? undefined : sectionStart + nextSection);
  const name = quotedValue(section, "name");
  const baseUrl = quotedValue(section, "base_url");
  const wireApi = quotedValue(section, "wire_api");
  const requiresOpenaiAuth = booleanValue(section, "requires_openai_auth");
  if (!name || !baseUrl) return null;
  return { model, provider, name, baseUrl, wireApi, requiresOpenaiAuth };
}

/** 将非敏感 provider 配置写入桥接专用 CODEX_HOME，避免修改 Codex App 配置。 */
export function ensureBridgeProviderConfig(codexHome, configFile) {
  const provider = readBridgeProviderConfig(configFile);
  if (!provider) return false;
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const configPath = `${codexHome}/config.toml`;
  let existing = "";
  try { existing = fs.readFileSync(configPath, "utf8"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const marker = "# AskX Bridge provider";
  const endMarker = "# End AskX Bridge provider";
  if (existing.includes(marker) && existing.includes(endMarker)) existing = existing.slice(existing.indexOf(endMarker) + endMarker.length).trim();
  else if (/^\s*model_provider\s*=/m.test(existing) && /\[model_providers\./m.test(existing)) return false;
  const lines = [
    "# AskX Bridge provider (generated from the configured Codex config.toml)",
    `model_provider = ${JSON.stringify(provider.provider)}`,
    ...(provider.model ? [`model = ${JSON.stringify(provider.model)}`] : []),
    `[model_providers.${provider.provider}]`,
    `name = ${JSON.stringify(provider.name)}`,
    `base_url = ${JSON.stringify(provider.baseUrl)}`,
    ...(provider.wireApi ? [`wire_api = ${JSON.stringify(provider.wireApi)}`] : []),
    ...(provider.requiresOpenaiAuth === null ? [] : [`requires_openai_auth = ${provider.requiresOpenaiAuth}`]),
    "# End AskX Bridge provider",
  ];
  const suffix = existing.trim();
  fs.writeFileSync(configPath, `${lines.join("\n")}\n${suffix ? `\n${suffix}\n` : ""}`, { mode: 0o600 });
  return true;
}
