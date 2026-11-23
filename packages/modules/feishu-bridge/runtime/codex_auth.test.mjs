import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ensureBridgeCodexAuth, ensureBridgeProviderConfig, readBridgeApiKey } from './codex_auth.mjs';

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'askx-codex-auth-'));
  directories.push(directory);
  return directory;
}

test('只从配置的 auth 文件读取 API key', () => {
  const directory = temporaryDirectory();
  const authFile = path.join(directory, 'auth.json');
  fs.writeFileSync(authFile, JSON.stringify({ OPENAI_API_KEY: 'sk-test', auth_mode: 'apikey' }));
  expect(readBridgeApiKey(authFile)).toBe('sk-test');
  expect(readBridgeApiKey(path.join(directory, 'missing.json'))).toBeNull();
});

test('仅在独立 Home 未认证时调用 app-server 登录接口', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce({ account: null, requiresOpenaiAuth: true })
    .mockResolvedValueOnce({ type: 'apiKey' });
  const directory = temporaryDirectory();
  const authFile = path.join(directory, 'auth.json');
  fs.writeFileSync(authFile, JSON.stringify({ OPENAI_API_KEY: 'sk-test' }));
  await expect(ensureBridgeCodexAuth(request, authFile)).resolves.toEqual({ mode: 'apiKey' });
  expect(request).toHaveBeenNthCalledWith(1, 'account/read', { refreshToken: false });
  expect(request).toHaveBeenNthCalledWith(2, 'account/login/start', { type: 'apiKey', apiKey: 'sk-test' });
});

test('provider 配置重复生成时保留项目设置', () => {
  const directory = temporaryDirectory();
  const source = path.join(directory, 'source.toml');
  const home = path.join(directory, 'home');
  fs.writeFileSync(source, 'model_provider = "OpenAI"\nmodel = "gpt-6-astra"\n[model_providers.OpenAI]\nname = "OpenAI"\nbase_url = "https://example.test/v1"\nwire_api = "responses"\nrequires_openai_auth = true\n');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'config.toml'), '[projects."/project"]\ntrust_level = "trusted"\n');
  expect(ensureBridgeProviderConfig(home, source)).toBe(true);
  expect(ensureBridgeProviderConfig(home, source)).toBe(true);
  const result = fs.readFileSync(path.join(home, 'config.toml'), 'utf8');
  expect(result.match(/# AskX Bridge provider/g)).toHaveLength(1);
  expect(result).toContain('[projects."/project"]');
});
