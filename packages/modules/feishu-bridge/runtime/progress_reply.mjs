import { splitReply } from "./messages.mjs";

function markdownContent(text) {
  const trimmed = String(text || "（Codex 本轮没有返回文本。）").trim();
  if (/^[\[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return `\`\`\`json\n${trimmed}\n\`\`\``;
    } catch { /* Keep non-JSON text as Markdown. */ }
  }
  let inCodeBlock = false;
  return trimmed.split("\n").map((line) => {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    if (inCodeBlock) return line;
    return line
      .replace(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/, "**$1**")
      .replace(/`([^`\n]+)`/g, "$1");
  }).join("\n");
}

export function progressCard(text, state = "working", senderId = null) {
  const appearance = {
    working: { title: "Codex · 处理中", template: "blue" },
    complete: { title: "Codex · 已完成", template: "green" },
    failed: { title: "Codex · 执行失败", template: "red" },
    cancelled: { title: "Codex · 已取消", template: "grey" },
    paused: { title: "Codex · 已暂停", template: "grey" },
  }[state];
  const mention = state !== "working" && /^ou_[a-zA-Z0-9]+$/.test(senderId ?? "")
    ? `<at id=${senderId}>发起人</at>\n\n`
    : "";
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: { tag: "plain_text", content: appearance.title },
      template: appearance.template,
    },
    elements: [{ tag: "markdown", content: mention + markdownContent(text) }],
  };
}

export class ProgressReply {
  constructor({ client, sourceMessageId, senderId, fallbackReply, queued = false, throttleMs = 3000, heartbeatMs = 30000 }) {
    this.client = client;
    this.sourceMessageId = sourceMessageId;
    this.senderId = senderId;
    this.queued = queued;
    this.queueWaitSeconds = 0;
    this.fallbackReply = fallbackReply;
    this.throttleMs = throttleMs;
    this.heartbeatMs = heartbeatMs;
    this.startedAt = Date.now();
    this.status = queued ? "前面有任务正在处理" : "已收到，等待处理";
    this.lastProgressAt = null;
    this.text = "";
    this.messageId = null;
    this.closed = false;
    this.lastSent = "";
    this.updateChain = Promise.resolve();
  }

  async start() {
    const initial = this.queued ? "已收到，正在排队；Codex 尚未开始本条请求。" : "已收到，等待处理…";
    try {
      const result = await this.client.im.message.reply({
        path: { message_id: this.sourceMessageId },
        data: { msg_type: "interactive", content: JSON.stringify(progressCard(initial, "working", this.senderId)) },
      });
      if (result.code !== 0 || !result.data?.message_id) {
        throw new Error(`Feishu progress reply failed (${result.code ?? "no message ID"})`);
      }
      this.messageId = result.data.message_id;
      this.lastSent = initial;
      this.heartbeat = setInterval(() => this.schedule(), this.heartbeatMs);
      return true;
    } catch (error) {
      console.error(`[bridge] progress reply unavailable for ${this.sourceMessageId}: ${error.message}`);
      return false;
    }
  }

  noteStatus(status) {
    if (this.closed) return;
    this.status = status;
    this.lastProgressAt = Date.now();
    this.schedule();
  }

  beginExecution() {
    if (this.closed) return;
    if (this.queued) this.queueWaitSeconds = Math.floor((Date.now() - this.startedAt) / 1000);
    this.queued = false;
    this.startedAt = Date.now();
    this.lastProgressAt = this.startedAt;
    this.status = "准备请求与附件";
    this.schedule();
  }

  noteText(delta) {
    if (this.closed || !delta) return;
    this.text = `${this.text}${delta}`.slice(-3000);
    this.lastProgressAt = Date.now();
    this.schedule();
  }

  displayText() {
    const now = Date.now();
    const seconds = Math.floor((now - this.startedAt) / 1000);
    if (this.queued) return `排队中 · ${seconds} 秒\n前面有任务正在处理；Codex 尚未开始本条请求。`;
    const idleSeconds = this.lastProgressAt === null ? null : Math.floor((now - this.lastProgressAt) / 1000);
    const lastProgress = idleSeconds === null
      ? "尚未收到 Codex 执行事件"
      : `${new Date(this.lastProgressAt).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（${idleSeconds} 秒前）`;
    const queueWait = this.queueWaitSeconds ? `（此前排队 ${this.queueWaitSeconds} 秒）` : "";
    const heading = `处理中 · ${seconds} 秒${queueWait}\n当前阶段：${this.status}\n最近状态变化：${lastProgress}`;
    let waiting = "";
    if (idleSeconds !== null && idleSeconds >= 300) {
      waiting = "\n⚠️ 超过 5 分钟没有新的执行事件，任务可能停滞；桥接心跳不能确认 Codex 仍在推进。";
    } else if (idleSeconds !== null && idleSeconds >= 60) {
      waiting = "\n等待 Codex 或工具返回；卡片计时更新不代表执行有新进展。";
    }
    return this.text.trim() ? `${heading}${waiting}\n\n${this.text.trim()}` : `${heading}${waiting}`;
  }

  schedule() {
    if (this.closed || !this.messageId || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.throttleMs);
  }

  async update(text, state = "working") {
    const result = await this.client.im.message.patch({
      path: { message_id: this.messageId },
      data: { content: JSON.stringify(progressCard(text, state, this.senderId)) },
    });
    if (result.code !== 0) throw new Error(`Feishu progress update failed (${result.code ?? "unknown"})`);
    this.lastSent = text;
  }

  async flush() {
    if (this.closed || !this.messageId) return;
    const text = this.displayText();
    if (text === this.lastSent) return;
    this.updateChain = this.updateChain.then(() => this.update(text)).catch((error) => {
      console.error(`[bridge] progress update failed for ${this.sourceMessageId}: ${error.message}`);
    });
    await this.updateChain;
  }

  async finish(finalText, outcome = null) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.flushTimer);
    clearInterval(this.heartbeat);
    await this.updateChain;
    if (!this.messageId) {
      await this.fallbackReply(this.sourceMessageId, finalText);
      return;
    }
    const parts = splitReply(finalText, 7000);
    try {
      await this.update(parts[0], outcome ?? (finalText.startsWith("Codex 执行失败：") ? "failed" : "complete"));
    } catch (error) {
      console.error(`[bridge] final progress update failed for ${this.sourceMessageId}: ${error.message}`);
      await this.fallbackReply(this.sourceMessageId, parts[0]);
    }
    for (const part of parts.slice(1)) await this.fallbackReply(this.sourceMessageId, part);
  }
}
