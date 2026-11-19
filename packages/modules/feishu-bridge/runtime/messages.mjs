export function parseRegistrationRequest(event, { botOpenId, registrationOwnerOpenId }) {
  const message = event?.message;
  const senderId = event?.sender?.sender_id?.open_id;
  if (!botOpenId || !registrationOwnerOpenId ||
      message?.chat_type !== "group" || message.message_type !== "text" ||
      !/^oc_[a-f0-9]{32}$/.test(message.chat_id ?? "") ||
      !message.message_id || event.sender?.sender_type !== "user" || !senderId) return null;
  if (!(message.mentions ?? []).some((mention) => mention.id?.open_id === botOpenId)) return null;
  let text;
  try { text = JSON.parse(message.content).text; } catch { return null; }
  if (typeof text !== "string") return null;
  for (const mention of message.mentions ?? []) {
    if (mention.id?.open_id === botOpenId && typeof mention.key === "string") text = text.replaceAll(mention.key, "");
  }
  if (text.trim().toLowerCase() !== "/register") return null;
  return {
    messageId: message.message_id,
    chatId: message.chat_id,
    senderId,
    authorized: senderId === registrationOwnerOpenId,
  };
}

export function parseMentionedMessage(event, { chatIds, botOpenId }) {
  const message = event?.message;
  if (!chatIds.includes(message?.chat_id) || message.chat_type !== "group") return null;
  if (event.sender?.sender_type !== "user" || !event.sender?.sender_id?.open_id) return null;
  if (!message.message_id) return null;
  let payload;
  try {
    payload = JSON.parse(message.content);
  } catch {
    return null;
  }
  if (message.message_type === "image") {
    if (typeof payload.image_key !== "string" || !payload.image_key) return null;
    return {
      kind: "image",
      messageId: message.message_id,
      chatId: message.chat_id,
      senderId: event.sender.sender_id.open_id,
      imageKeys: [payload.image_key],
    };
  }
  if (!["text", "post"].includes(message.message_type)) return null;
  const mentions = (message.mentions ?? []).filter((mention) => mention.id?.open_id === botOpenId);
  let text = "";
  let imageKeys = [];
  if (message.message_type === "text") {
    if (!mentions.length || typeof payload.text !== "string") return null;
    text = payload.text;
    for (const mention of message.mentions ?? []) {
      text = text.replaceAll(mention.key, mention.id?.open_id === botOpenId ? "" : `@${mention.name ?? "成员"}`);
    }
  } else {
    const candidates = [payload, payload.post, ...Object.values(payload), ...Object.values(payload.post ?? {})];
    const post = candidates.find((value) => Array.isArray(value?.content));
    if (!post || !Array.isArray(post.content)) return null;
    let mentionedInPost = false;
    const lines = [];
    for (const paragraph of post.content) {
      if (!Array.isArray(paragraph)) continue;
      let line = "";
      for (const part of paragraph) {
        if (part?.tag === "at" && [part.open_id, part.user_id].includes(botOpenId)) mentionedInPost = true;
        else if (part?.tag === "text" && typeof part.text === "string") line += part.text;
        else if (part?.tag === "a") {
          const label = String(part.text ?? "链接");
          const href = String(part.href ?? part.url ?? "");
          line += href ? `${label} (${href})` : label;
        }
        else if (["md", "lark_md"].includes(part?.tag)) line += String(part.text ?? part.content ?? "");
        else if (part?.tag === "img" && typeof part.image_key === "string") imageKeys.push(part.image_key);
      }
      if (line.trim()) lines.push(line.trim());
    }
    if (!mentions.length && !mentionedInPost) return null;
    text = [post.title, ...lines].filter(Boolean).join("\n");
  }
  text = text.trim();
  if (!text && !imageKeys.length) return null;
  return {
    kind: "prompt",
    messageId: message.message_id,
    chatId: message.chat_id,
    senderId: event.sender.sender_id.open_id,
    text,
    imageKeys,
    parentId: message.parent_id,
    rootId: message.root_id,
  };
}

export function referencedContent(item) {
  let payload;
  try { payload = JSON.parse(item.body?.content ?? "{}"); } catch { return { text: "[无法解析的引用消息]", imageKeys: [] }; }
  if (item.msg_type === "image") {
    return { text: "[图片]", imageKeys: typeof payload.image_key === "string" ? [payload.image_key] : [] };
  }
  if (item.msg_type === "text") return { text: String(payload.text ?? ""), imageKeys: [] };
  if (item.msg_type === "post") {
    const candidates = [payload, payload.post, ...Object.values(payload), ...Object.values(payload.post ?? {})];
    const post = candidates.find((value) => Array.isArray(value?.content));
    if (!post) return { text: "[富文本消息]", imageKeys: [] };
    const imageKeys = [];
    const text = [post.title];
    for (const row of post.content) {
      if (!Array.isArray(row)) continue;
      text.push(row.map((part) => {
        if (part.tag === "text") return part.text ?? "";
        if (part.tag === "a") return `${part.text ?? "链接"} (${part.href ?? part.url ?? ""})`;
        if (part.tag === "img" && part.image_key) { imageKeys.push(part.image_key); return "[图片]"; }
        return "";
      }).join(""));
    }
    return { text: text.filter(Boolean).join("\n"), imageKeys };
  }
  const links = [];
  const visit = (value, depth = 0) => {
    if (depth > 4) return;
    if (typeof value === "string") {
      for (const match of value.matchAll(/https:\/\/[^\s"<>]+/g)) {
        try {
          const url = new URL(match[0]);
          if (url.hostname.endsWith(".feishu.cn") || url.hostname.endsWith(".larksuite.com")) links.push(url.href);
        } catch { /* Ignore malformed links. */ }
      }
    } else if (Array.isArray(value)) value.forEach((part) => visit(part, depth + 1));
    else if (value && typeof value === "object") Object.values(value).forEach((part) => visit(part, depth + 1));
  };
  visit(payload);
  const uniqueLinks = [...new Set(links)].slice(0, 5);
  return {
    text: uniqueLinks.length ? `[${item.msg_type ?? "未知类型"}消息]\n${uniqueLinks.join("\n")}` : `[${item.msg_type ?? "未知类型"}消息]`,
    imageKeys: [],
  };
}

export function commandOf(text) {
  const command = text.trim().toLowerCase();
  if (command === "/new") return "new";
  if (command === "/clear") return "clear";
  if (command === "/help") return "help";
  if (command === "/cancel") return "cancel";
  if (command === "/pause") return "pause";
  const history = /^\/history(?:\s+(\d{1,3}))?(?:\s+([\s\S]+))?$/i.exec(text.trim());
  if (history) return {
    type: "history",
    limit: Math.min(200, Math.max(1, Number(history[1] ?? 50))),
    question: history[2]?.trim() || "请总结这段群聊的关键结论、待办和分歧。",
  };
  return null;
}

export function isLocalDeletionRequest(text) {
  const message = String(text ?? "").trim();
  if (!message) return false;
  if (/(?:^|\s)(?:rm|rmdir|unlink)(?:\s|$)|git\s+(?:clean|reset\s+--hard)|find\b[^\n]*\s-delete\b/i.test(message)) return true;
  if (/(?:删除|删掉|删去|移除|清空|清理|抹掉|擦除|销毁|卸载).{0,40}(?:文件|目录|文件夹|路径|磁盘|硬盘|电脑|本地|桌面|下载|工作区|仓库|代码|项目|缓存|worktree)/i.test(message)) return true;
  if (/(?:删除|删掉|清空|清理)(?:这(?:个|些)|它们?|掉)?(?:吧|掉)?(?:\s|$|[，。！!])/i.test(message)) return true;
  return /(?:delete|remove|wipe|erase|purge).{0,40}(?:local|computer|disk|file|folder|directory|workspace|repository|worktree|download|desktop)/i.test(message);
}

export function splitReply(text, limit = 3500) {
  const output = [];
  let rest = String(text || "（Codex 本轮没有返回文本。）");
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = limit;
    output.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  output.push(rest);
  return output;
}
