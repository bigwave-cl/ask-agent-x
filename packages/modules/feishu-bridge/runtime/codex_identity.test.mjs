import { expect, test } from 'vitest';
import { bridgeFeishuClientName, bridgeWebClientName, bridgeThreadSourceKinds, createBridgeCodexEnvironment, isBridgeThreadSource } from './codex_identity.mjs';

test('child environment removes only the desktop override without changing the parent', () => {
  const parent = Object.freeze({ CODEX_INTERNAL_ORIGINATOR_OVERRIDE: 'Codex Desktop', PATH: 'synthetic-path', ASKX_TEST_VALUE: 'synthetic-value' });
  const child = createBridgeCodexEnvironment(parent);
  expect(child).toEqual({ PATH: 'synthetic-path', ASKX_TEST_VALUE: 'synthetic-value' });
  expect(child).not.toBe(parent);
  expect(parent.CODEX_INTERNAL_ORIGINATOR_OVERRIDE).toBe('Codex Desktop');
  expect(createBridgeCodexEnvironment(Object.freeze({ ASKX_TEST_VALUE: 'preserved' }))).toEqual({ ASKX_TEST_VALUE: 'preserved' });
});

test('child environment uses the configured isolated Codex Home', () => {
  const parent = Object.freeze({ CODEX_HOME: '/Users/bobo/.codex', ASKX_TEST_VALUE: 'preserved' });
  expect(createBridgeCodexEnvironment(parent, '/Users/bobo/.askx/bridge/codex-home')).toEqual({ CODEX_HOME: '/Users/bobo/.askx/bridge/codex-home', ASKX_TEST_VALUE: 'preserved' });
});

test.each([
  { source: 'appServer' },
  { source: 'vscode', originator: bridgeFeishuClientName },
  { source: 'vscode', originator: bridgeWebClientName },
])('accepts the bridge source record %j', (record) => {
  expect(isBridgeThreadSource(record)).toBe(true);
});

test.each([
  { source: 'vscode', originator: 'Codex Desktop' },
  { source: 'vscode', originator: 'unknown-client' },
  { source: 'vscode' },
  { source: 'cli', originator: bridgeFeishuClientName },
  { source: 'exec', originator: bridgeWebClientName },
  { source: 'unknown', originator: bridgeFeishuClientName },
  null,
  [],
])('rejects non-bridge or invalid source record %j', (record) => {
  expect(isBridgeThreadSource(record)).toBe(false);
});

test('discovery source candidates include current and compatible protocol kinds', () => {
  expect(bridgeThreadSourceKinds).toEqual(['appServer', 'vscode']);
});
