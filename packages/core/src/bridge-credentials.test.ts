import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeishuCredentialStore, getFeishuImportAccounts, resolveFeishuCredentials } from './bridge-credentials.js'

/** OpenClaw 临时夹具的目录。 */
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
/** 仅在内存模拟 security 命令，不访问真实钥匙串。 */
function keychain() {
  const values = new Map<string, string>()
  const command = vi.fn(async (args: string[], input?: string) => {
    if (input) {
      const ref = JSON.parse(input.match(/-a ("(?:\\.|[^"\\])*")/)![1]!) as string
      const value = JSON.parse(input.match(/-w ("(?:\\.|[^"\\])*")/)![1]!) as string
      values.set(ref, value)
      return ''
    }
    const ref = args[args.indexOf('-a') + 1]!
    if (args[0] === 'delete-generic-password') { values.delete(ref); return '' }
    if (!values.has(ref)) throw new Error('sensitive keychain stderr')
    return values.get(ref)!
  })
  return { store: new FeishuCredentialStore(command), command, values }
}
/** 生成只在系统临时目录内的 OpenClaw 配置。 */
async function fixture(feishu: unknown) {
  const directory = await mkdtemp(join(tmpdir(), 'askx-credentials-test-'))
  directories.push(directory)
  const path = join(directory, 'openclaw.json')
  await writeFile(path, JSON.stringify({ channels: { feishu } }))
  return path
}

describe('Feishu credentials', () => {
  it('独立凭据引用往返，密钥仅经 stdin 写入而非命令参数', async () => {
    const { store, command } = keychain()
    const credentials = { appId: 'cli_demo', appSecret: 'secret-"quoted"\\value' }
    const ref = await store.put(credentials)
    expect(ref).toMatch(/^[a-f0-9-]{36}$/)
    expect(command.mock.calls[0]![0]).toEqual(['-i'])
    const input = command.mock.calls[0]![1]!
    expect(input).toMatch(/^add-generic-password [^\r\n]+\n$/)
    expect(input.split('\n')).toHaveLength(2)
    expect(input).not.toContain('\nquit')
    expect(JSON.stringify(command.mock.calls.map(([args]) => args))).not.toContain(credentials.appSecret)
    expect(await store.get(ref)).toEqual(credentials)
    await store.remove(ref)
    await expect(store.get(ref)).rejects.toThrow('Feishu credentials are unavailable')
  })

  it('写入命令失败后删除本次引用，并仅抛出验证错误', async () => {
    const command = vi.fn(async (_args: string[], _input?: string) => '')
      .mockRejectedValueOnce(new Error('sensitive write failure'))
    const store = new FeishuCredentialStore(command)
    await expect(store.put({ appId: 'cli_demo', appSecret: 'mock-secret' })).rejects.toThrow(/^Credential verification failed$/)
    const input = command.mock.calls[0]![1]!
    const ref = JSON.parse(input.match(/-a ("(?:\\.|[^"\\])*")/)![1]!) as string
    expect(ref).toMatch(/^[a-f0-9-]{36}$/)
    expect(command).toHaveBeenCalledTimes(2)
    expect(command.mock.calls[1]).toEqual([
      ['delete-generic-password', '-a', ref, '-s', 'com.askagentx.feishu'],
    ])
  })

  it('底层命令错误不泄漏密钥或 stderr', async () => {
    const command = vi.fn(async () => { throw new Error('sensitive keychain stderr and secret') })
    const store = new FeishuCredentialStore(command)
    await expect(store.get('00000000-0000-4000-8000-000000000001')).rejects.toThrow('Feishu credentials are unavailable; save them again in settings')
    expect(command).toHaveBeenCalledOnce()
  })

  it('导入列表只返回身份，按 appId 选择账户且不改写 OpenClaw', async () => {
    const path = await fixture({ accounts: { alpha: { appId: 'cli_A', appSecret: 'secretA' }, beta: { appId: 'cli_B', appSecret: 'secretB' } } })
    const original = await readFile(path, 'utf8')
    expect(await getFeishuImportAccounts(path)).toEqual([{ appId: 'cli_A', name: 'alpha' }, { appId: 'cli_B', name: 'beta' }])
    expect(await resolveFeishuCredentials({ source: 'openclaw', appId: 'cli_B' }, keychain().store, path)).toEqual({ appId: 'cli_B', appSecret: 'secretB' })
    await expect(resolveFeishuCredentials({ source: 'openclaw', appId: '' }, keychain().store, path)).rejects.toThrow('Select an OpenClaw Feishu account')
    expect(await readFile(path, 'utf8')).toBe(original)
  })

  it('自定义凭据必须匹配选中的应用身份', async () => {
    const { store } = keychain()
    const ref = await store.put({ appId: 'cli_A', appSecret: 'secretA' })
    await expect(resolveFeishuCredentials({ source: 'custom', appId: 'cli_B', credentialRef: ref }, store)).rejects.toThrow('identity does not match')
  })
})
