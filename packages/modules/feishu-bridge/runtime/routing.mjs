import { randomUUID } from "node:crypto";
import { BridgeRelationsConflictError } from "@askx/core/bridge-relations";

/** 管理员私聊选择和跨进程关系提交的唯一运行时入口。 */
export class RoutingCoordinator {
  constructor({ relations, adminOpenId, listProjects, notify, timeoutMs = 15 * 60 * 1000 }) {
    Object.assign(this, { relations, adminOpenId, listProjects, notify, timeoutMs });
    this.pending = new Map();
    this.closed = false;
    this.operation = Promise.resolve();
  }

  /** 串行重读关系并通过 revision 提交，冲突时重新计算。 */
  mutate(update) {
    const task = async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        if (this.closed) throw new Error("Bridge stopped");
        const snapshot = await this.relations.read();
        const next = await update(snapshot);
        try { return await this.relations.replace({ groups: next.groups, projectGroups: next.projectGroups, threadGroups: next.threadGroups, migrationConflicts: next.migrationConflicts }, snapshot.revision); }
        catch (error) {
          if (!(error instanceof BridgeRelationsConflictError) || attempt === 4) throw error;
        }
      }
    };
    const next = this.operation.then(task, task);
    this.operation = next.catch(() => {});
    return next;
  }

  /** 选择只属于对应请求；超时和停机均释放原消息。 */
  choose(label, options, incoming) {
    if (this.closed) return Promise.reject(new Error("Bridge stopped"));
    if (!this.adminOpenId) return Promise.reject(new Error("No routing administrator configured"));
    if (!options.length) return Promise.reject(new Error("No available project candidates"));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Administrator selection expired"));
      }, this.timeoutMs);
      this.pending.set(requestId, { options, resolve, reject, timer, incoming });
      void this.notify(`${label}\n${options.map((value, index) => `${index + 1}. ${value.label ?? value}`).join("\n")}\n回复 / Reply: ${requestId} <编号 / number>`).catch((error) => {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }

  /** 严格检查私聊发送人、请求标识和编号，消费后立即失效。 */
  async answer(event) {
    if (event?.message?.chat_type !== "p2p" || event.sender?.sender_type !== "user" || event.sender?.sender_id?.open_id !== this.adminOpenId) return false;
    if (event.message.message_type !== "text") return false;
    let text;
    try { text = JSON.parse(event.message.content).text; } catch { return false; }
    const match = /^([a-f0-9-]{36})\s+([1-9]\d*)$/.exec(String(text).trim());
    if (!match) return false;
    const request = this.pending.get(match[1]);
    const selected = request?.options[Number(match[2]) - 1];
    if (selected === undefined) return false;
    this.pending.delete(match[1]);
    clearTimeout(request.timer);
    request.resolve(selected);
    return true;
  }

  /** 原消息等待选择；已有显式关联才允许复用会话。 */
  async resolve(incoming, { fresh = false } = {}) {
    let snapshot = await this.relations.read();
    const group = snapshot.groups.find((row) => row.chatId === incoming.chatId);
    if (!group) throw new Error("Group is not registered; sync Feishu groups before starting a conversation");
    const activeProject = snapshot.projectGroups.find((row) => row.chatId === incoming.chatId && row.active);
    if (!activeProject) throw new Error("No active project is bound to this group; bind a project before starting a conversation");
    const projectPath = activeProject.projectPath;
    if (!(await this.listProjects()).includes(projectPath)) throw new Error("The active project no longer exists");
    snapshot = await this.relations.read();
    if (!snapshot.projectGroups.some((row) => row.chatId === incoming.chatId && row.projectPath === projectPath && row.active)) throw new Error("The active project changed; retry the message");
    const threads = snapshot.threadGroups.filter((row) => row.chatId === incoming.chatId && row.projectPath === projectPath);
    if (fresh || threads.length === 0) return { projectPath, threadId: null, ...(fresh ? { explicitNew: true } : {}) };
    if (threads.length === 1) return { projectPath, threadId: threads[0].threadId };
    const selected = await this.choose(`选择会话 / Select session: ${incoming.chatId} (${incoming.messageId})`, [...threads.map((row) => ({ label: row.threadId, threadId: row.threadId })), { label: "新会话 / New session", threadId: null }], incoming);
    const route = { projectPath, threadId: selected.threadId };
    await this.validate(incoming.chatId, route);
    if (!selected.threadId) route.explicitNew = true;
    return route;
  }

  /** 提交和执行前重新核验项目与当前关系，不信任历史回复缓存。 */
  async validate(chatId, route) {
    if (this.closed) throw new Error("Bridge stopped");
    if (!(await this.listProjects()).includes(route.projectPath)) throw new Error("Selected project no longer exists");
    const state = await this.relations.read();
    if (!state.projectGroups.some((row) => row.chatId === chatId && row.projectPath === route.projectPath && row.active)) throw new Error("Project is not active for this group");
    if (route.threadId && !state.threadGroups.some((row) => row.chatId === chatId && row.projectPath === route.projectPath && row.threadId === route.threadId)) throw new Error("Thread association was revoked");
    return state;
  }

  /** 新会话只关联原请求群组，不推断其他群关系。 */
  link(chatId, projectPath, threadId) {
    return this.mutate(async (state) => {
      if (!(await this.listProjects()).includes(projectPath)) throw new Error("Selected project no longer exists");
      if (!state.projectGroups.some((row) => row.chatId === chatId && row.projectPath === projectPath && row.active)) throw new Error("Project is not active for this group");
      return { ...state, threadGroups: state.threadGroups.some((row) => row.chatId === chatId && row.threadId === threadId) ? state.threadGroups : [...state.threadGroups, { chatId, projectPath, threadId }] };
    });
  }

  /** 清除本群关联，不影响其他群共享的会话。 */
  clear(chatId) {
    for (const [id, request] of this.pending) {
      if (request.incoming?.chatId !== chatId) continue;
      clearTimeout(request.timer);
      this.pending.delete(id);
      request.reject(new Error("Group session selection cleared"));
    }
    return this.mutate((state) => ({ ...state, threadGroups: state.threadGroups.filter((row) => row.chatId !== chatId) }));
  }

  /** 取消仅限来源群的等待请求。 */
  cancel(incoming) {
    const references = [incoming.parentId, incoming.rootId].filter(Boolean);
    const candidates = [...this.pending.entries()].filter(([, request]) => request.incoming?.chatId === incoming.chatId && (!references.length || references.includes(request.incoming.messageId)));
    if (candidates.length !== 1) return false;
    const [id, request] = candidates[0];
    this.pending.delete(id);
    clearTimeout(request.timer);
    request.reject(new Error("Routing request cancelled"));
    return true;
  }

  close() {
    this.closed = true;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error("Bridge stopped")); }
    this.pending.clear();
  }
}
