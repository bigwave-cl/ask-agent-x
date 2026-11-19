import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { BridgeFeishuConfig } from './config.js'

/** 只在服务端内存中使用的飞书凭据。 */
export const feishuCredentialsSchema = z.object({
  /** 飞书应用标识。 */
  appId: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/),
  /** 飞书应用密钥，不进入配置、日志或 GET 响应。 */
  appSecret: z.string().min(1).max(4096).refine(value => !/[\r\n\0]/.test(value)),
})
/** 飞书凭据契约。 */
export type FeishuCredentials = z.infer<typeof feishuCredentialsSchema>
/** 可注入的系统凭据命令，测试不接触用户钥匙串。 */
export type CredentialCommand = (args: string[], input?: string) => Promise<string>
/** 钥匙串服务命名空间。 */
const KEYCHAIN_SERVICE = 'com.askagentx.feishu'
/** 执行系统凭据命令；错误不包含参数、stdin 或 stderr。 */
const runCredentialCommand: CredentialCommand = (args, input) => new Promise((resolve, reject) => {
  if (process.platform !== 'darwin') { reject(new Error('Secure credential storage requires macOS Keychain on this device')); return }
  const child = spawn('/usr/bin/security', args, { stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  let errors = ''
  const timer = setTimeout(() => { child.kill(); reject(new Error('Keychain operation timed out')) }, 15000)
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (value: string) => { if (output.length < 65536) output += value })
  child.stderr.on('data', (value: string) => { if (errors.length < 65536) errors += value })
  child.once('error', () => { clearTimeout(timer); reject(new Error('Keychain is unavailable')) })
  child.once('close', code => {
    clearTimeout(timer)
    // security 交互模式可能在子命令失败后仍返回零，额外识别命令失败输出。
    if (code !== 0 || /SecKeychain|SecItem|error:|failed/i.test(errors)) reject(new Error('Keychain operation failed'))
    else resolve(output.trim())
  })
  child.stdin.on('error', () => {})
  child.stdin.end(input)
})
/** 转义 security 交互命令的字符串参数，密钥仅经 stdin 传递。 */
function quoted(value: string): string { return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` }

/** 独立凭据存储；普通配置只持有不可猜测引用。 */
export class FeishuCredentialStore {
  /** 默认使用本机钥匙串，测试可注入命令执行器。 */
  constructor(private readonly command: CredentialCommand = runCredentialCommand) {}
  /** 写入新凭据，避免覆盖运行中服务正在使用的旧引用。 */
  async put(credentials: FeishuCredentials): Promise<string> {
    const value = feishuCredentialsSchema.parse(credentials)
    const ref = randomUUID()
    try {
      // 以 stdin EOF 退出交互模式；security 不支持 quit 子命令。
      await this.command(['-i'], `add-generic-password -a ${quoted(ref)} -s ${quoted(KEYCHAIN_SERVICE)} -w ${quoted(JSON.stringify(value))}\n`)
      const verified = await this.get(ref)
      if (verified.appId !== value.appId || verified.appSecret !== value.appSecret) throw new Error('Credential verification failed')
    } catch {
      await this.remove(ref).catch(() => {})
      throw new Error('Credential verification failed')
    }
    return ref
  }
  /** 按内部引用读取密钥，不向用户返回底层命令错误。 */
  async get(ref: string): Promise<FeishuCredentials> {
    z.string().uuid().parse(ref)
    try {
      return feishuCredentialsSchema.parse(JSON.parse(await this.command(['find-generic-password', '-a', ref, '-s', KEYCHAIN_SERVICE, '-w'])))
    } catch { throw new Error('Feishu credentials are unavailable; save them again in settings') }
  }
  /** 仅用于回滚本次新建但未提交的凭据。 */
  async remove(ref: string): Promise<void> {
    z.string().uuid().parse(ref)
    await this.command(['delete-generic-password', '-a', ref, '-s', KEYCHAIN_SERVICE])
  }
}
/** OpenClaw 边界归一化后的账户，只在本文件内部保留密钥。 */
interface OpenClawAccount extends FeishuCredentials {
  /** 用于选择列表的名称。 */
  name: string
}
/** 从默认 OpenClaw 文件读取多个账户，不写入外部配置。 */
async function readOpenClawAccounts(path = join(homedir(), '.openclaw', 'openclaw.json')): Promise<OpenClawAccount[]> {
  let raw: unknown
  try { raw = JSON.parse(await readFile(path, 'utf8')) } catch { throw new Error('OpenClaw Feishu configuration is unavailable') }
  const source = z.object({ channels: z.object({ feishu: z.record(z.unknown()) }) }).safeParse(raw)
  if (!source.success) throw new Error('OpenClaw has no Feishu accounts')
  const channel = source.data.channels.feishu
  const candidates: Array<{ value: unknown, name: string }> = [{ value: channel, name: 'OpenClaw' }]
  if (channel.accounts && typeof channel.accounts === 'object' && !Array.isArray(channel.accounts)) {
    for (const [name, account] of Object.entries(channel.accounts)) candidates.push({ value: account, name })
  }
  const accounts = new Map<string, OpenClawAccount>()
  for (const candidate of candidates) {
    const parsed = feishuCredentialsSchema.safeParse(candidate.value)
    if (parsed.success) accounts.set(parsed.data.appId, { ...parsed.data, name: candidate.name })
  }
  if (!accounts.size) throw new Error('OpenClaw has no usable Feishu accounts')
  return [...accounts.values()]
}
/** 返回可导入的账户身份，绝不返回密钥。 */
export async function getFeishuImportAccounts(path?: string): Promise<Array<{ appId: string, name: string }>> {
  return (await readOpenClawAccounts(path)).map(({ appId, name }) => ({ appId, name }))
}
/** 唯一凭据解析入口，Web 测试和 runtime 共用相同语义。 */
export async function resolveFeishuCredentials(config: BridgeFeishuConfig, store = new FeishuCredentialStore(), openClawPath?: string): Promise<FeishuCredentials> {
  if (config.source === 'openclaw') {
    const accounts = await readOpenClawAccounts(openClawPath)
    const account = config.appId ? accounts.find(item => item.appId === config.appId) : accounts.length === 1 ? accounts[0] : undefined
    if (!account) throw new Error('Select an OpenClaw Feishu account in settings')
    return { appId: account.appId, appSecret: account.appSecret }
  }
  if (!config.credentialRef) throw new Error('Save custom Feishu credentials before starting the service')
  const credentials = await store.get(config.credentialRef)
  if (credentials.appId !== config.appId) throw new Error('Feishu credential identity does not match the selected app')
  return credentials
}
