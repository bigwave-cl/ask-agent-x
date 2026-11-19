import fs from "node:fs";
import path from "node:path";

export class BridgeState {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, "state.json");
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.data = { threads: {}, replyThreads: {}, seen: [], reactions: {} };
    }
    if (!this.data.threads || !Array.isArray(this.data.seen)) {
      throw new Error("Invalid bridge state; inspect it before restarting");
    }
    this.data.reactions ??= {};
    this.data.replyThreads ??= {};
    if (typeof this.data.reactions !== "object" || Array.isArray(this.data.reactions)) {
      throw new Error("Invalid bridge reaction state; inspect it before restarting");
    }
    if (typeof this.data.replyThreads !== "object" || Array.isArray(this.data.replyThreads)) {
      throw new Error("Invalid bridge reply-thread state; inspect it before restarting");
    }
  }

  save() {
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  hasSeen(messageId) {
    return this.data.seen.includes(messageId);
  }

  markSeen(messageId) {
    if (this.hasSeen(messageId)) return false;
    this.data.seen.push(messageId);
    this.data.seen = this.data.seen.slice(-2000);
    this.save();
    return true;
  }

  thread(chatId) {
    return this.data.threads[chatId] ?? null;
  }

  setThread(chatId, threadId) {
    this.data.threads[chatId] = threadId;
    this.save();
  }

  clearThread(chatId) {
    delete this.data.threads[chatId];
    for (const key of Object.keys(this.data.replyThreads)) {
      if (key.startsWith(`${chatId}:`)) delete this.data.replyThreads[key];
    }
    this.save();
  }

  replyThread(chatId, messageId) {
    return messageId ? this.data.replyThreads[`${chatId}:${messageId}`] ?? null : null;
  }

  setReplyThread(chatId, messageIds, threadId) {
    for (const messageId of messageIds.filter(Boolean)) {
      this.data.replyThreads[`${chatId}:${messageId}`] = threadId;
    }
    this.data.replyThreads = Object.fromEntries(Object.entries(this.data.replyThreads).slice(-500));
    this.save();
  }

  pendingReactions() {
    return Object.entries(this.data.reactions);
  }

  setReaction(messageId, reactionId) {
    this.data.reactions[messageId] = reactionId;
    this.save();
  }

  clearReaction(messageId) {
    delete this.data.reactions[messageId];
    this.save();
  }
}
