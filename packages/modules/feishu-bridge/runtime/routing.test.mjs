import { test } from 'vitest';
import assert from 'node:assert/strict';
import { BridgeRelationsConflictError } from '@askx/core/bridge-relations';
import { RoutingCoordinator } from './routing.mjs';

const incoming = { chatId: 'group-a', messageId: 'message-a' };
function fixture(state = { revision: 0, groups: [], projectGroups: [], threadGroups: [] }, timeoutMs = 1000) {
  const notices = [];
  const relations = { read: async () => structuredClone(state), replace: async (next, expected) => { assert.deepEqual(Object.keys(next).sort(), ["groups", "projectGroups", "threadGroups"]); assert.equal(expected, state.revision); state = { ...next, revision: expected + 1 }; } };
  const router = new RoutingCoordinator({ relations, adminOpenId: 'admin', listProjects: async () => ['/project'], notify: async (text) => notices.push(text), timeoutMs });
  return { router, notices, relations };
}
const answer = (requestId, sender = 'admin', number = 1) => ({ sender: { sender_type: 'user', sender_id: { open_id: sender } }, message: { chat_type: 'p2p', message_type: 'text', content: JSON.stringify({ text: `${requestId} ${number}` }) } });

test('unassociated original waits for admin; wrong sender and duplicate cannot consume it', async () => {
  const { router, notices, relations } = fixture();
  const pending = router.resolve(incoming);
  await new Promise(setImmediate);
  assert.equal(notices.length, 1);
  const id = [...router.pending.keys()][0];
  assert.equal(await router.answer(answer(id, 'outsider')), false);
  assert.equal(await router.answer(answer(id, 'admin', 8)), false);
  assert.equal(await router.answer(answer(id)), true);
  assert.deepEqual(await pending, { projectPath: '/project', threadId: null });
  assert.equal(await router.answer(answer(id)), false);
  assert.equal((await relations.read()).projectGroups[0].chatId, incoming.chatId);
  router.close();
});

test('shared thread explicit links survive clearing one group', async () => {
  const { router, relations } = fixture({ revision: 0, groups: [], projectGroups: ['group-a', 'group-b'].map(chatId => ({ chatId, projectPath: '/project' })), threadGroups: [] });
  await router.link('group-a', '/project', 'shared');
  await router.link('group-b', '/project', 'shared');
  await router.clear('group-a');
  assert.deepEqual((await relations.read()).threadGroups, [{ chatId: 'group-b', projectPath: '/project', threadId: 'shared' }]);
});

test('expiry and cross-group cancellation do not consume another request', async () => {
  const { router } = fixture(undefined, 20);
  const pending = router.resolve(incoming);
  await new Promise(setImmediate);
  assert.equal(router.cancel({ chatId: 'group-b' }), false);
  await assert.rejects(pending, /expired/);
  assert.equal(router.pending.size, 0);
});

test('multiple explicit threads require private selection; a request cannot select another request', async () => {
  const { router } = fixture({ revision: 0, groups: [], projectGroups: [{ chatId: 'group-a', projectPath: '/project' }], threadGroups: [{ chatId: 'group-a', projectPath: '/project', threadId: 'one' }, { chatId: 'group-a', projectPath: '/project', threadId: 'two' }] });
  const pending = router.resolve(incoming);
  await new Promise(setImmediate);
  const id = [...router.pending.keys()][0];
  assert.equal(await router.answer(answer('00000000-0000-0000-0000-000000000000')), false);
  await router.answer(answer(id, 'admin', 2));
  assert.deepEqual(await pending, { projectPath: '/project', threadId: 'two' });
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

test('project removal while private selection waits cannot resurrect its group association', async () => {
  const { router, relations } = fixture({ revision: 0, groups: [], projectGroups: [{ chatId: 'group-a', projectPath: '/project' }, { chatId: 'group-a', projectPath: '/other' }], threadGroups: [] });
  const pending = router.resolve(incoming);
  await new Promise(setImmediate);
  const id = [...router.pending.keys()][0];
  const state = await relations.read();
  await relations.replace({ groups: state.groups, projectGroups: [], threadGroups: [] }, state.revision);
  await router.answer(answer(id));
  await assert.rejects(pending, /revoked/);
  assert.deepEqual((await relations.read()).projectGroups, []);
});

test('project disappearance and session removal invalidate administrator choices', async () => {
  const { router, relations } = fixture({ revision: 0, groups: [], projectGroups: [{ chatId: 'group-a', projectPath: '/project' }], threadGroups: ['one', 'two'].map(threadId => ({ chatId: 'group-a', projectPath: '/project', threadId })) });
  const pending = router.resolve(incoming);
  await new Promise(setImmediate);
  const id = [...router.pending.keys()][0];
  const state = await relations.read();
  await relations.replace({ groups: [], projectGroups: state.projectGroups, threadGroups: [] }, state.revision);
  await router.answer(answer(id));
  await assert.rejects(pending, /revoked/);
  router.listProjects = async () => [];
  await assert.rejects(router.validate('group-a', { projectPath: '/project', threadId: null }), /no longer exists/);
});
