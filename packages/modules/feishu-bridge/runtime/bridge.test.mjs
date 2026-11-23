import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect, vi } from 'vitest';
vi.mock('@askx/core/bridge-credentials', () => ({ resolveFeishuCredentials: vi.fn() }));
vi.mock('@askx/core/bridge-thread-lock', () => ({ acquireBridgeThreadLock: vi.fn(async () => async () => {}) }));
import { Bridge } from './bridge.mjs';

/** 用内存假客户端验证调度，不发出飞书业务消息。 */
function fixture() {
  let data = { revision: 0, groups: ['a', 'b', 'c'].map(chatId => ({ chatId, name: chatId })), projectGroups: ['a', 'b', 'c'].map(chatId => ({ chatId, projectPath: '/project', active: true })), threadGroups: ['a', 'b', 'c'].map(chatId => ({ chatId, projectPath: '/project', threadId: chatId === 'c' ? 'other' : 'shared' })) };
  const relations = { read: async () => structuredClone(data), replace: async (next, revision) => { expect(revision).toBe(data.revision); data = { ...next, revision: revision + 1 }; return data; } };
  const runs = [];
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const makeClient = () => ({ request: vi.fn(async () => ({ thread: { cwd: "/project" } })), start: vi.fn(async () => {}), stop() {}, runTurn: vi.fn(async (input) => {
    runs.push({ chatId: input.chatId, threadId: input.threadId });
    if (input.chatId === 'a') await blocked;
    return { threadId: input.threadId, text: `answer-${input.chatId}` };
  }) });
  const bridge = new Bridge({ client: {}, ws: { close() {} }, stateDir: '/mock-state', normalizeProject: async (path) => path, state: { replyThread: () => null, setReplyThread() {} }, codex: makeClient(), codexFactory: makeClient, relations, adminOpenId: 'admin', listProjects: async () => ['/project'], maxConcurrent: 3, perGroupConcurrent: 1, imageWaitMs: 0 });
  bridge.readReferences = async () => ({ text: '', images: [] });
  return { bridge, runs, release, relations };
}

/** 每项任务提供完成事件，覆盖执行和 finally 资源释放。 */
function job(chatId, threadId, replies) {
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  return { incoming: { chatId, messageId: `source-${chatId}`, text: 'question', imageKeys: [], receivedAt: Date.now(), route: { projectPath: '/project', threadId } }, progress: { beginExecution() {}, noteStatus() {}, finish: async (text) => replies.push({ chatId, text }) }, progressReady: Promise.resolve(), reaction: Promise.resolve(), abortController: new AbortController(), done, resolveDone };
}

test('two groups share exactly one serial thread while unrelated thread runs; answers return only to source', async () => {
  const { bridge, runs, release, relations } = fixture();
  const replies = [];
  const first = job('a', 'shared', replies);
  const second = job('b', 'shared', replies);
  const unrelated = job('c', 'other', replies);
  bridge.pendingJobs = [first, second, unrelated];
  bridge.drain();
  try {
    await unrelated.done;
    expect(runs).toEqual([{ chatId: 'a', threadId: 'shared' }, { chatId: 'c', threadId: 'other' }]);
    expect(replies).toEqual([{ chatId: 'c', text: 'answer-c' }]);
  } finally { release(); }
  await Promise.all([first.done, second.done]);
  expect(runs).toEqual([{ chatId: 'a', threadId: 'shared' }, { chatId: 'c', threadId: 'other' }, { chatId: 'b', threadId: 'shared' }]);
  expect(replies).toEqual([{ chatId: 'c', text: 'answer-c' }, { chatId: 'a', text: 'answer-a' }, { chatId: 'b', text: 'answer-b' }]);
  await bridge.router.clear('a');
  expect((await relations.read()).threadGroups).toContainEqual({ chatId: 'b', projectPath: '/project', threadId: 'shared' });
  expect((await relations.read()).threadGroups.some(row => row.chatId === 'a')).toBe(false);
  expect(bridge.activeCount).toBe(0);
});

test('cancel in another group cannot interrupt a shared thread job', async () => {
  const { bridge } = fixture();
  bridge.reply = vi.fn();
  const interruptTurn = vi.fn();
  const job = { incoming: { chatId: 'a', messageId: 'source-a' }, progress: { closed: false }, client: { interruptTurn } };
  bridge.activeJobs.set('source-a', job);
  await bridge.stopTask({ chatId: 'b', messageId: 'cancel-b', parentId: 'source-a' }, 'cancel');
  expect(interruptTurn).not.toHaveBeenCalled();
  expect(job.cancelRequested).toBeUndefined();
});

test('failed resume never silently creates a replacement thread', async () => {
  const { CodexClient } = await import('./codex_client.mjs');
  const eventHome = fs.mkdtempSync(path.join(os.tmpdir(), 'askx-runtime-events-'));
  const client = new CodexClient({ binary: 'mock', cwd: '/project', codexHome: eventHome });
  client.start = vi.fn(async () => {});
  client.request = vi.fn(async () => { throw new Error('resume unavailable'); });
  try {
    await expect(client.runTurn({ chatId: 'group-a', threadId: 'shared', prompt: 'test' })).rejects.toThrow('resume unavailable');
    expect(client.request.mock.calls.map(call => call[0])).toEqual(['thread/resume']);
  } finally { fs.rmSync(eventHome, { recursive: true, force: true }); }
});

test('stale reply cache cannot route to a thread without current group authorization', async () => {
  const { bridge, runs } = fixture();
  bridge.state.replyThread = () => 'revoked-thread';
  const replies = [];
  const task = job('b', 'shared', replies);
  bridge.pendingJobs = [task];
  bridge.drain();
  await task.done;
  expect(runs).toEqual([]);
  expect(replies).toHaveLength(1);
});

test('an unbound group does not hold an unrelated execution slot', async () => {
  const { bridge, runs } = fixture();
  await expect(bridge.router.resolve({ chatId: 'unassociated', messageId: 'waiting' })).rejects.toThrow('Group is not registered');
  const task = job('c', 'other', []);
  bridge.pendingJobs = [task];
  bridge.drain();
  await task.done;
  expect(runs).toEqual([{ chatId: 'c', threadId: 'other' }]);
});

test('after a shared cross-process lease wait, revoked authorization prevents resume and releases lease', async () => {
  const { acquireBridgeThreadLock } = await import('@askx/core/bridge-thread-lock');
  let unlockWait;
  const release = vi.fn(async () => {});
  vi.mocked(acquireBridgeThreadLock).mockImplementationOnce(() => new Promise(resolve => { unlockWait = () => resolve(release); }));
  const { bridge, runs, relations } = fixture();
  const replies = [];
  const task = job('b', 'shared', replies);
  bridge.pendingJobs = [task];
  bridge.drain();
  await vi.waitFor(() => expect(unlockWait).toBeTypeOf('function'));
  expect(runs).toEqual([]);
  expect(acquireBridgeThreadLock).toHaveBeenLastCalledWith('/mock-state', 'shared', { signal: expect.any(AbortSignal) });
  const state = await relations.read();
  await relations.replace({ groups: state.groups, projectGroups: state.projectGroups.filter(row => row.chatId !== 'b'), threadGroups: state.threadGroups.filter(row => row.chatId !== 'b') }, state.revision);
  unlockWait();
  await task.done;
  expect(runs).toEqual([]);
  expect(release).toHaveBeenCalledTimes(1);
  expect(replies).toHaveLength(1);
});

test('every completed bridge job stops its Codex client to discard loaded history', async () => {
  const { bridge } = fixture();
  bridge.codex.stop = vi.fn();
  const task = job('c', 'other', []);
  bridge.pendingJobs = [task];
  bridge.drain();
  await task.done;
  expect(bridge.codex.stop).toHaveBeenCalledTimes(1);
});

test('new thread invokes lease hook after association and before turn/start', async () => {
  const { CodexClient } = await import('./codex_client.mjs');
  const eventHome = fs.mkdtempSync(path.join(os.tmpdir(), 'askx-runtime-events-'));
  const client = new CodexClient({ binary: 'mock', cwd: '/project', codexHome: eventHome });
  const order = [];
  client.start = async () => {};
  client.request = async (method) => {
    order.push(method);
    if (method === 'thread/start') return { thread: { id: 'new-thread' } };
    if (method === 'turn/start') {
      setImmediate(() => client.handle({ method: 'turn/completed', params: { threadId: 'new-thread', turn: { status: 'completed' } } }));
      return { turn: { id: 'turn' } };
    }
    throw new Error('Unexpected RPC');
  };
  await client.runTurn({ chatId: 'group-a', prompt: 'test', onThread: async () => order.push('associate'), beforeTurn: async () => order.push('lease') });
  fs.rmSync(eventHome, { recursive: true, force: true });
  expect(order).toEqual(['thread/start', 'associate', 'lease', 'thread/read', 'turn/start']);
});
