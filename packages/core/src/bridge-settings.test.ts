import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeishuCredentialStore, type FeishuCredentials } from './bridge-credentials.js'
import { BridgeSettingsService, publicBridgeSettings } from './bridge-settings.js'
import { SettingsConflictError, SettingsStore } from './settings-store.js'

/** 配置测试的临时目录。 */
const directories: string[] = []
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
/** 注入内存凭据，不读取或写入系统钥匙串。 */
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'askx-bridge-settings-test-'))
  directories.push(directory)
  const settings = new SettingsStore(directory)
  const command = vi.fn(async () => { throw new Error('Real credential commands are forbidden in tests') })
  const credentials = new FeishuCredentialStore(command)
  const values = new Map<string, FeishuCredentials>()
  const put = vi.spyOn(credentials, 'put').mockImplementation(async value => { const ref = randomUUID(); values.set(ref, value); return ref })
  const get = vi.spyOn(credentials, 'get').mockImplementation(async ref => { const value = values.get(ref); if (!value) throw new Error('Missing mock credentials'); return value })
  const remove = vi.spyOn(credentials, 'remove').mockImplementation(async ref => { values.delete(ref) })
  return { settings, service: new BridgeSettingsService(settings, credentials), put, get, remove, values, command }
}
/** 构造显式保存自定义身份的请求。 */
function request(revision = 0, appId = 'cli_A', appSecret = 'secretA') {
  return { revision, patch: { feishu: { source: 'custom', appId, adminOpenId: 'ou_Admin' } }, appSecret }
}

describe('BridgeSettingsService', () => {
  it('保存后配置与公开响应不包含 secret，公开响应也不包含 credentialRef', async () => {
    const { settings, service, command } = await setup()
    const saved = await service.save(request())
    const raw = await readFile(settings.path, 'utf8')
    expect(raw).not.toContain('secretA')
    expect(saved.bridge.feishu.credentialRef).toBeTruthy()
    const visible = publicBridgeSettings(saved)
    expect(visible.bridge.feishu.hasSecret).toBe(true)
    expect(visible.bridge.paths.codexHome).toMatch(/\.askx\/bridge\/codex-home$/)
    expect(visible.bridge.paths).not.toHaveProperty('stateDir')
    expect(visible.bridge.paths).not.toHaveProperty('codexBinary')
    expect(JSON.stringify(visible)).not.toContain(saved.bridge.feishu.credentialRef!)
    expect(JSON.stringify(visible)).not.toContain('credentialRef')
    expect(JSON.stringify(visible)).not.toContain('secretA')
    expect(command).not.toHaveBeenCalled()
  })

  it('空 secret 保留已有凭据，同一 app 不创建替代引用', async () => {
    const { service, put, values } = await setup()
    const first = await service.save(request())
    const second = await service.save(request(first.revision, 'cli_A', ''))
    expect(second.bridge.feishu.credentialRef).toBe(first.bridge.feishu.credentialRef)
    expect(put).toHaveBeenCalledOnce()
    expect(values.size).toBe(1)
  })

  it('新 AppID 不能复用旧 secret，配置原样保留', async () => {
    const { service, settings, put } = await setup()
    const first = await service.save(request())
    await expect(service.save(request(first.revision, 'cli_B', ''))).rejects.toThrow('identity does not match')
    expect(await settings.read()).toEqual(first)
    expect(put).toHaveBeenCalledOnce()
  })

  it('飞书表单省略管理员时移除旧授权，同时保留同应用凭据', async () => {
    const { service, settings, put, remove } = await setup()
    const first = await service.save(request())
    expect(first.bridge.feishu.adminOpenId).toBe('ou_Admin')
    const second = await service.save({
      revision: first.revision,
      patch: { feishu: { source: 'custom', appId: 'cli_A' } },
      appSecret: '',
    })
    expect(second.bridge.feishu.adminOpenId).toBeUndefined()
    expect((await settings.read()).bridge.feishu.adminOpenId).toBeUndefined()
    expect(await readFile(settings.path, 'utf8')).not.toContain('ou_Admin')
    expect(second.bridge.feishu.credentialRef).toBe(first.bridge.feishu.credentialRef)
    expect(put).toHaveBeenCalledOnce()
    expect(remove).not.toHaveBeenCalled()
  })

  it('只保存工作时间时保留管理员授权和已有凭据', async () => {
    const { service, settings, put, get, remove } = await setup()
    const first = await service.save(request())
    const previousReads = get.mock.calls.length
    const second = await service.save({
      revision: first.revision,
      patch: { workTime: { ...first.bridge.workTime, mode: 'always' } },
    })
    expect(second.bridge.workTime.mode).toBe('always')
    expect(second.bridge.feishu).toEqual(first.bridge.feishu)
    expect((await settings.read()).bridge.feishu.adminOpenId).toBe('ou_Admin')
    expect(put).toHaveBeenCalledOnce()
    expect(get.mock.calls.length).toBe(previousReads)
    expect(remove).not.toHaveBeenCalled()
  })

  it('保存 Codex Home 时只更新桥接运行目录', async () => {
    const { service, settings } = await setup()
    const current = await settings.read()
    const codexHome = '/tmp/askx-bridge-codex-home'
    const saved = await service.save({ revision: current.revision, patch: { paths: { codexHome } } })
    expect(saved.bridge.paths.codexHome).toBe(codexHome)
    expect(saved.bridge.workTime).toEqual(current.bridge.workTime)
    expect(saved.bridge.feishu).toEqual(current.bridge.feishu)
  })

  it('过期 revision 在凭据写入前拒绝且不改变配置', async () => {
    const { service, settings, put, remove } = await setup()
    const first = await service.save(request())
    await expect(service.save(request(0, 'cli_B', 'secretB'))).rejects.toBeInstanceOf(SettingsConflictError)
    expect(await settings.read()).toEqual(first)
    expect(put).toHaveBeenCalledOnce()
    expect(remove).not.toHaveBeenCalled()
  })

  it('新凭据创建后的配置写入失败会回滚新引用并保留旧凭据', async () => {
    const { service, settings, remove, values } = await setup()
    const first = await service.save(request())
    const failure = vi.spyOn(settings, 'update').mockRejectedValueOnce(new Error('Disk unavailable'))
    await expect(service.save(request(first.revision, 'cli_A', 'secretNew'))).rejects.toThrow('Disk unavailable')
    failure.mockRestore()
    expect(remove).toHaveBeenCalledOnce()
    expect(values.size).toBe(1)
    expect(values.get(first.bridge.feishu.credentialRef!)).toEqual({ appId: 'cli_A', appSecret: 'secretA' })
    expect(await settings.read()).toEqual(first)
  })

  it('凭据创建期间发生配置竞争也回滚本次凭据，不覆盖竞争写入', async () => {
    const { service, settings, put, values, remove } = await setup()
    put.mockImplementationOnce(async value => {
      const ref = randomUUID()
      values.set(ref, value)
      await settings.update({ locale: 'en' }, { source: 'cli', expectedRevision: 0 })
      return ref
    })
    await expect(service.save(request())).rejects.toBeInstanceOf(SettingsConflictError)
    expect(remove).toHaveBeenCalledOnce()
    expect(values.size).toBe(0)
    expect((await settings.read()).locale).toBe('en')
    expect((await settings.read()).bridge.feishu.credentialRef).toBeUndefined()
  })
})
