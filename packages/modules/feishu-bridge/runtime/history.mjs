import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as lark from "@larksuiteoapi/node-sdk";
import { BridgeRelationsStore } from "@askx/core/bridge-relations";
import { resolveFeishuCredentials } from "@askx/core/bridge-credentials";
import { referencedContent } from "./messages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = process.env.ASKX_FEISHU_BRIDGE_CONFIG ?? path.join(root, "config.json");
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};

async function argumentsFrom(commandLine) {
  const options = { chatId: null, limit: 50, hours: 24, before: Math.floor(Date.now() / 1000) };
  for (let i = 0; i < commandLine.length; i += 2) {
    const key = commandLine[i];
    if (key === "--chat-id") {
      options.chatId = commandLine[i + 1];
      continue;
    }
    const value = Number(commandLine[i + 1]);
    if (!Number.isInteger(value)) throw new Error(`Invalid value for ${key}`);
    if (key === "--limit" && value >= 1 && value <= 200) options.limit = value;
    else if (key === "--hours" && value >= 1 && value <= 720) options.hours = value;
    else if (key === "--before" && value > 0) options.before = value;
    else throw new Error(`Unsupported history option: ${key}`);
  }
  const relations = await new BridgeRelationsStore(config.stateDir).read();
  if (!relations.groups.some((chat) => chat.chatId === options.chatId)) {
    throw new Error("Specify an allowed group with --chat-id");
  }
  return options;
}

function messageText(item) {
  let body;
  try { body = JSON.parse(item.body?.content ?? "{}"); } catch { return "[无法解析的消息]"; }
  if (item.msg_type === "text") return String(body.text ?? "");
  if (item.msg_type === "image") return "[图片]";
  if (item.msg_type === "post") {
    const candidates = [body, body.post, ...Object.values(body), ...Object.values(body.post ?? {})];
    const post = candidates.find((value) => Array.isArray(value?.content));
    if (!post) return "[富文本消息]";
    const parts = [post.title];
    for (const row of post.content) {
      if (!Array.isArray(row)) continue;
      parts.push(row.map((part) => {
        if (part.tag === "text") return part.text ?? "";
        if (part.tag === "a") return `${part.text ?? "链接"} (${part.href ?? part.url ?? ""})`;
        if (part.tag === "img") return "[图片]";
        if (part.tag === "at") return `@${part.user_name ?? part.open_id ?? "成员"}`;
        return "";
      }).join(""));
    }
    return parts.filter(Boolean).join("\n");
  }
  return referencedContent(item).text;
}

export async function fetchHistory(client, { chatId, limit, hours, before, allowedChatIds = [] }) {
  if (!allowedChatIds.includes(chatId)) throw new Error("Group is not allowed for history reads");
  const items = [];
  const start = before - hours * 3600;
  let pageToken;
  let hasMore = false;
  do {
    const result = await client.im.message.list({
      params: {
        container_id_type: "chat",
        container_id: chatId,
        start_time: String(start),
        end_time: String(before),
        sort_type: "ByCreateTimeDesc",
        page_size: Math.min(50, limit - items.length),
        ...(pageToken ? { page_token: pageToken } : {}),
      },
    });
    if (result.code !== 0) throw new Error(`Feishu history read failed (${result.code ?? "unknown"})`);
    items.push(...(result.data?.items ?? []));
    hasMore = Boolean(result.data?.has_more);
    pageToken = result.data?.page_token;
  } while (items.length < limit && hasMore && pageToken);
  return {
    chatId,
    limit,
    hours,
    hasMore,
    messages: items.slice(0, limit).reverse().map((item) => ({
      id: item.message_id,
      at: new Date(Number(item.create_time)).toISOString(),
      sender: item.sender?.id ?? "unknown",
      senderType: item.sender?.sender_type ?? "unknown",
      type: item.msg_type,
      text: messageText(item).slice(0, 2000),
    })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = await argumentsFrom(process.argv.slice(2));
    options.allowedChatIds = [options.chatId];
    const account = await resolveFeishuCredentials(config.feishu);
    const client = new lark.Client({ appId: account.appId, appSecret: account.appSecret, appType: lark.AppType.SelfBuild, domain: lark.Domain.Feishu, loggerLevel: lark.LoggerLevel.error });
    console.log(JSON.stringify(await fetchHistory(client, options)));
  } catch (error) {
    console.error(`History read failed: ${error.message}`);
    process.exitCode = 1;
  }
}
