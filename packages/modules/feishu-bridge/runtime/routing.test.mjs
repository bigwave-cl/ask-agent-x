import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BridgeRelationsConflictError, BridgeRelationsStore } from '@askx/core/bridge-relations';
import { RoutingCoordinator } from './routing.mjs';

const incoming = { chatId: 'group-a', messageId: 'message-a' };
function fixture(state = { revision: 0, groups: [{ chatId: 'group-a', name: 'A' }], projectGroups: [{ chatId: 'group-a', projectPath: '/project', active: true }], threadGroups: [] }) {
  const notices = [];
  const relations = { read: async () => structuredClone(state), replace: async (next, expected) => { assert.equal(expected, state.revision); state = { ...next, revision: expected + 1 }; } };
  const router = new RoutingCoordinator({ relations, adminOpenId: 'admin', listProjects: async () => ['/project'], notify: async (text) => notices.push(text) });
  return { router, notices, relations };
}

test('unbound group is rejected without creating a pending project selection', async () => {
  const { router, notices } = fixture({ revision: 0, groups: [{ chatId: 'group-a', name: 'A' }], projectGroups: [], threadGroups: [] });
  await assert.rejects(router.resolve(incoming), /No active project/);
  assert.equal(notices.length, 0);
  assert.equal(router.pending.size, 0);
});

test('one active project routes new messages without administrator selection', async () => {
  const { router } = fixture();
  assert.deepEqual(await router.resolve(incoming), { projectPath: '/project', threadId: null });
});

test('historical project cannot be used for a write route', async () => {
  const { router } = fixture({ revision: 0, groups: [{ chatId: 'group-a', name: 'A' }], projectGroups: [{ chatId: 'group-a', projectPath: '/project', active: false }], threadGroups: [] });
  await assert.rejects(router.resolve(incoming), /No active project/);
  await assert.rejects(router.validate('group-a', { projectPath: '/project', threadId: null }), /not active/);
});

test('shared thread explicit links survive clearing one group', async () => {
  const { router, relations } = fixture({ revision: 0, groups: [{ chatId: 'group-a', name: 'A' }, { chatId: 'group-b', name: 'B' }], projectGroups: [{ chatId: 'group-a', projectPath: '/project', active: true }, { chatId: 'group-b', projectPath: '/project', active: true }], threadGroups: [] });
  await router.link('group-a', '/project', 'shared');
  await router.link('group-b', '/project', 'shared');
  await router.clear('group-a');
  assert.deepEqual((await relations.read()).threadGroups, [{ chatId: 'group-b', projectPath: '/project', threadId: 'shared' }]);
});

test('typed revision conflicts retry even when error text has no conflict keyword', async () => {
  const { router, relations } = fixture();
  const replace = relations.replace;
  let attempts = 0;
  relations.replace = async (...args) => {
    if (attempts++ === 0) throw new BridgeRelationsConflictError(await relations.read());
    return replace(...args);
  };
  await router.mutate(state => state);
  assert.equal(attempts, 2);
});


test('removing the current project keeps historical threads read-only after storage reload', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'askx-unlinked-route-'));
  try {
    const store = new BridgeRelationsStore(directory);
    const first = await store.replace({ groups: [{ chatId: 'oc_A', name: 'A' }], projectGroups: [{ chatId: 'oc_A', projectPath: '/current', active: true }, { chatId: 'oc_A', projectPath: '/history', active: false }], threadGroups: [{ chatId: 'oc_A', projectPath: '/history', threadId: 'old-thread' }] }, 0);
    await store.replace({ groups: first.groups, projectGroups: first.projectGroups.filter(link => link.projectPath !== '/current'), threadGroups: first.threadGroups }, first.revision);
    const reloaded = new BridgeRelationsStore(directory);
    const router = new RoutingCoordinator({ relations: reloaded, listProjects: async () => ['/history'] });
    const snapshot = await reloaded.read();
    assert.deepEqual(snapshot.threadGroups, first.threadGroups);
    assert.equal(snapshot.projectGroups[0].active, false);
    await assert.rejects(router.resolve({ chatId: 'oc_A', messageId: 'next-message' }), /No active project/);
    await assert.rejects(router.validate('oc_A', { projectPath: '/history', threadId: 'old-thread' }), /not active/);
    router.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
