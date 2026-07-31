#!/usr/bin/env node
import {
  defaultContext,
  ModuleRegistry,
  SettingsStore,
  type AskXConfig,
  type AskXLocale,
  type AskXModule,
  type AskXThemeColor,
  type DetectionIssue,
  type ManagedPlatformId,
} from '@askx/core'
import { SkillsManager, SkillsModule } from '@askx/module-skills'
import type { SkillPlatformId, SkillsScanReport } from '@askx/module-skills/skill-types'
import { detectPlatforms, type PlatformDetection } from '@askx/platform-adapters'
import { readUiSessionToken, startUi } from '@askx/web/server'
import { Command } from 'commander'
import { Box, render, Text, useApp, useInput } from 'ink'
import { useState, type ReactNode } from 'react'

const accent = '#d7ff3f'
const registry = new ModuleRegistry()
registry.register(new SkillsModule())
const settingsStore = new SettingsStore(defaultContext().dataDir)
const skillsManager = new SkillsManager(defaultContext())
const activeLocale = (await settingsStore.read()).locale

const messages = {
  en: {
    builtInModules: 'built-in modules', doctor: 'doctor', skillsScan: 'skills scan', skillsStatus: 'skills status',
    status: 'Status', ready: 'ready', blocked: 'blocked', notFound: 'not found', ok: 'ok', warning: 'warning',
    noIssues: 'No topology issues detected.', skills: 'Skills', conflicts: 'conflicts', brokenLinks: 'broken links', fingerprint: 'Fingerprint',
    localUi: 'local ui', serverReady: 'Nuxt server ready', stop: 'Press Ctrl+C to stop.',
    settings: 'settings', settingsUpdated: 'settings updated', revision: 'REVISION', source: 'SOURCE', platforms: 'Platforms', backup: 'Backup', language: 'Language', themeColor: 'Theme', updated: 'Updated',
    writeLocked: 'Write operations are intentionally locked in the foundation release.',
    appDescription: 'Extend every agent. Keep control.', modulesDescription: 'Inspect built-in AskAgent X modules',
    doctorDescription: 'Detect Agent installations, paths, versions and link eligibility', jsonDescription: 'Print machine-readable JSON',
    skillsDescription: 'Inspect and manage Skills topology', scanDescription: 'Read-only scan of all known Skill roots', statusDescription: 'Show current read-only Skills status',
    settingsDescription: 'Read or update shared CLI/Web settings', settingsShowDescription: 'Show the current shared settings', settingsSetDescription: 'Update shared settings',
    backupArgument: 'on or off', backupDescription: 'Enable or disable backup before linking', backupError: 'Backup must be "on" or "off"',
    platformsArgument: 'codex, claude and/or cursor', platformsDescription: 'Set enabled Agent platforms', platformsError: 'Platforms must contain codex, claude and/or cursor',
    languageArgument: 'zh-CN or en', languageDescription: 'Set the shared CLI/Web language', languageError: 'Language must be "zh-CN" or "en"',
    themeArgument: 'cyan or rose', themeDescription: 'Set the shared CLI/Web theme color', themeError: 'Theme color must be "cyan" or "rose"',
    uiDescription: 'Start the local Nuxt management interface', portDescription: 'Local port', invalidPort: 'Invalid port', tokenDescription: 'Print the active local UI token', noToken: 'No active UI session. Start "pnpm dev" or "askx ui" first.',
    manageBackups: 'Manage Skills backups', placeholder: 'foundation placeholder',
    choosePlatforms: 'Choose platforms to scan', scanOnlySelected: 'Space toggles · Enter confirms', platformRequired: 'Select at least one platform.', platformSelectionRequired: 'First scan requires --platform in non-interactive mode.',
    skillConflict: 'Skill {name} has conflicting content.', skillBroken: 'Skill {name} has a broken link.', skillInvalid: 'Skill {name} has invalid metadata.',
  },
  'zh-CN': {
    builtInModules: '内置模块', doctor: '环境诊断', skillsScan: 'Skills 扫描', skillsStatus: 'Skills 状态',
    status: '状态', ready: '就绪', blocked: '受阻', notFound: '未发现', ok: '正常', warning: '警告',
    noIssues: '未检测到拓扑问题。', skills: '个 Skills', conflicts: '个冲突', brokenLinks: '个失效链接', fingerprint: '指纹',
    localUi: '本地界面', serverReady: 'Nuxt 服务已就绪', stop: '按 Ctrl+C 停止。',
    settings: '共享设置', settingsUpdated: '设置已更新', revision: '版本', source: '来源', platforms: '平台', backup: '备份', language: '语言', themeColor: '主题色', updated: '更新时间',
    writeLocked: '基础版本暂未开放写入操作。',
    appDescription: '扩展每一个 Agent，控制始终在你手中。', modulesDescription: '查看 AskAgent X 内置模块',
    doctorDescription: '检测 Agent 安装、路径、版本与链接条件', jsonDescription: '输出机器可读的 JSON',
    skillsDescription: '检查和管理 Skills 拓扑', scanDescription: '只读扫描所有已知的 Skill 根目录', statusDescription: '显示当前只读 Skills 状态',
    settingsDescription: '读取或更新 CLI/Web 共享设置', settingsShowDescription: '显示当前共享设置', settingsSetDescription: '更新共享设置',
    backupArgument: 'on 或 off', backupDescription: '启用或关闭挂接前备份', backupError: '备份参数必须是 "on" 或 "off"',
    platformsArgument: 'codex、claude 和/或 cursor', platformsDescription: '设置启用的 Agent 平台', platformsError: '平台必须包含 codex、claude 和/或 cursor',
    languageArgument: 'zh-CN 或 en', languageDescription: '设置 CLI/Web 共享语言', languageError: '语言必须是 "zh-CN" 或 "en"',
    themeArgument: 'cyan 或 rose', themeDescription: '设置 CLI/Web 共享主题色', themeError: '主题色必须是 "cyan" 或 "rose"',
    uiDescription: '启动本地 Nuxt 管理界面', portDescription: '本地端口', invalidPort: '无效端口', tokenDescription: '输出当前本地 UI token', noToken: '没有活动的 UI 会话，请先运行 "pnpm dev" 或 "askx ui"。',
    manageBackups: '管理 Skills 备份', placeholder: '基础占位命令',
    choosePlatforms: '选择需要扫描的平台', scanOnlySelected: '空格切换 · 回车确认', platformRequired: '至少选择一个平台。', platformSelectionRequired: '非交互模式首次扫描必须传入 --platform。',
    skillConflict: 'Skill {name} 在不同平台的内容不一致。', skillBroken: 'Skill {name} 包含失效软链。', skillInvalid: 'Skill {name} 的元数据无效。',
  },
} as const

type MessageKey = keyof typeof messages.en
const t = (locale: AskXLocale, key: MessageKey): string => messages[locale][key]

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="bold" borderColor={accent} paddingX={1} marginBottom={1}>
        <Text bold color={accent}>ASKAGENT X</Text>
        <Text dimColor>  /  {title.toUpperCase()}</Text>
      </Box>
      {children}
    </Box>
  )
}

function State({ value, locale }: { value: 'ready' | 'blocked' | 'not found' | 'ok' | 'warning'; locale: AskXLocale }) {
  const color = value === 'ready' || value === 'ok' ? 'green' : value === 'blocked' || value === 'warning' ? 'yellow' : 'gray'
  const key = value === 'not found' ? 'notFound' : value
  return <Text color={color}>● {t(locale, key)}</Text>
}

function ModulesView({ modules, locale }: { modules: AskXModule[]; locale: AskXLocale }) {
  return (
    <Frame title={t(locale, 'builtInModules')}>
      {modules.map((module, index) => (
        <Box key={module.id} gap={2}>
          <Text color={accent}>{String(index + 1).padStart(2, '0')}</Text>
          <Text bold>{module.id.padEnd(14)}</Text>
          <Text dimColor>{module.name}</Text>
        </Box>
      ))}
    </Frame>
  )
}

function DoctorView({ detections, locale }: { detections: PlatformDetection[]; locale: AskXLocale }) {
  return (
    <Frame title={t(locale, 'doctor')}>
      {detections.map((platform) => {
        const state = platform.installed ? (platform.linkSupported ? 'ready' : 'blocked') : 'not found'
        return (
          <Box key={platform.id} flexDirection="column" marginBottom={1}>
            <Box gap={2}>
              <Text bold>{platform.name.padEnd(16)}</Text>
              <State value={state} locale={locale} />
              {platform.version ? <Text dimColor>{platform.version}</Text> : null}
            </Box>
            <Text dimColor>  {platform.skillsDir}</Text>
            {platform.notes.map((note) => <Text key={note} color="yellow">  ↳ {note}</Text>)}
          </Box>
        )
      })}
    </Frame>
  )
}

function IssueList({ issues, locale }: { issues: DetectionIssue[]; locale: AskXLocale }) {
  if (!issues.length) return <Text color="green">{t(locale, 'noIssues')}</Text>
  return (
    <Box flexDirection="column" marginTop={1}>
      {issues.map((issue) => <Text key={`${issue.code}:${issue.path ?? issue.message}`} color="yellow">! {issue.message}{issue.path ? ` (${issue.path})` : ''}</Text>)}
    </Box>
  )
}

function SkillsScanView({ report, issues, status, locale }: { report: SkillsScanReport; issues: DetectionIssue[]; status: 'ok' | 'warning' | 'blocked'; locale: AskXLocale }) {
  const conflicts = report.groups.filter((group) => group.status === 'conflict').length
  const brokenLinks = report.groups.filter((group) => group.status === 'broken').length
  return (
    <Frame title={t(locale, 'skillsScan')}>
      <Box marginBottom={1} gap={1}><Text>{t(locale, 'status')}</Text><State value={status} locale={locale} /></Box>
      {report.platformStatuses.map((platform) => (
        <Box key={platform.id} gap={1}>
          <Text color={platform.skillsDirExists ? 'green' : 'gray'}>{platform.skillsDirExists ? '✓' : '·'}</Text>
          <Text bold>{platform.name.padEnd(16)}</Text>
          <Text dimColor>{platform.skillsDir}</Text>
        </Box>
      ))}
      <Box marginTop={1} gap={2}>
        <Text><Text color={accent}>{report.groups.length}</Text> {t(locale, 'skills')}</Text>
        <Text><Text color={conflicts ? 'yellow' : 'green'}>{conflicts}</Text> {t(locale, 'conflicts')}</Text>
        <Text><Text color={brokenLinks ? 'red' : 'green'}>{brokenLinks}</Text> {t(locale, 'brokenLinks')}</Text>
      </Box>
      <IssueList issues={issues} locale={locale} />
    </Frame>
  )
}

/** 交互式平台选择属性。 */
interface PlatformPromptProps {
  /** 当前界面语言。 */
  locale: AskXLocale
  /** 完成选择时回传平台。 */
  onComplete: (platforms: SkillPlatformId[]) => void
}

/** 首次扫描使用的 Ink 平台多选界面。 */
function PlatformPrompt({ locale, onComplete }: PlatformPromptProps) {
  const options: Array<{ id: SkillPlatformId; label: string }> = [
    { id: 'codex', label: 'ChatGPT / Codex' },
    { id: 'claude', label: 'Claude Code' },
    { id: 'cursor', label: 'Cursor' },
  ]
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<SkillPlatformId[]>(options.map((option) => option.id))
  const [warning, setWarning] = useState('')
  const { exit } = useApp()
  useInput((_input, key) => {
    if (key.upArrow) setCursor((current) => (current + options.length - 1) % options.length)
    if (key.downArrow) setCursor((current) => (current + 1) % options.length)
    if (_input === ' ') {
      const id = options[cursor]!.id
      setSelected((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])
      setWarning('')
    }
    if (key.return) {
      if (!selected.length) {
        setWarning(t(locale, 'platformRequired'))
        return
      }
      onComplete(selected)
      exit()
    }
  })
  return (
    <Frame title={t(locale, 'choosePlatforms')}>
      <Text dimColor>{t(locale, 'scanOnlySelected')}</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((option, index) => (
          <Text key={option.id} {...(index === cursor ? { color: accent } : {})}>
            {index === cursor ? '›' : ' '} {selected.includes(option.id) ? '◉' : '○'} {option.label}
          </Text>
        ))}
      </Box>
      {warning ? <Text color="yellow">! {warning}</Text> : null}
    </Frame>
  )
}

/** 等待用户在 Ink 中确认首次扫描平台。 */
function choosePlatforms(locale: AskXLocale): Promise<SkillPlatformId[]> {
  return new Promise((resolve) => render(<PlatformPrompt locale={locale} onComplete={resolve} />))
}

function StatusView({ status, issues, fingerprint, locale }: { status: 'ok' | 'warning' | 'blocked'; issues: DetectionIssue[]; fingerprint: string; locale: AskXLocale }) {
  return (
    <Frame title={t(locale, 'skillsStatus')}>
      <Box gap={1}><Text>{t(locale, 'status')}</Text><State value={status} locale={locale} /></Box>
      <Text dimColor>{t(locale, 'fingerprint')}  {fingerprint.slice(0, 16)}…</Text>
      <IssueList issues={issues} locale={locale} />
    </Frame>
  )
}

function NoticeView({ title, message }: { title: string; message: string }) {
  return <Frame title={title}><Text color="yellow">◆ {message}</Text></Frame>
}

function UiView({ url, locale }: { url: string; locale: AskXLocale }) {
  return (
    <Frame title={t(locale, 'localUi')}>
      <Text color="green">● {t(locale, 'serverReady')}</Text>
      <Text>{url}</Text>
      <Text dimColor>{t(locale, 'stop')}</Text>
    </Frame>
  )
}

function SettingsView({ settings, changed = false }: { settings: AskXConfig; changed?: boolean }) {
  const locale = settings.locale
  return (
    <Frame title={t(locale, changed ? 'settingsUpdated' : 'settings')}>
      <Box gap={2}>
        <Text dimColor>{t(locale, 'revision').toUpperCase()}</Text><Text color={accent}>#{settings.revision}</Text>
        <Text dimColor>{t(locale, 'source').toUpperCase()}</Text><Text>{settings.updatedBy.toUpperCase()}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>{t(locale, 'platforms').padEnd(10)} <Text color={accent}>{settings.skills.platforms.join(' · ')}</Text></Text>
        <Text>{t(locale, 'backup').padEnd(10)} <Text color={settings.skills.backupBeforeLink ? 'green' : 'yellow'}>{settings.skills.backupBeforeLink ? 'ON' : 'OFF'}</Text></Text>
        <Text>{t(locale, 'language').padEnd(10)} <Text color={accent}>{settings.locale}</Text></Text>
        <Text>{t(locale, 'themeColor').padEnd(10)} <Text color={accent}>{settings.themeColor}</Text></Text>
      </Box>
      <Text dimColor>{t(locale, 'updated')} {settings.updatedAt}</Text>
    </Frame>
  )
}

const program = new Command()
program.name('askx').description(t(activeLocale, 'appDescription')).version('0.1.0')

const modules = program.command('modules').description(t(activeLocale, 'modulesDescription'))
modules.command('list').action(() => {
  render(<ModulesView modules={registry.list()} locale={activeLocale} />)
})

program
  .command('doctor')
  .description(t(activeLocale, 'doctorDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .action(async ({ json }: { json?: boolean }) => {
    const detections = await detectPlatforms()
    if (json) console.log(JSON.stringify(detections, null, 2))
    else render(<DoctorView detections={detections} locale={activeLocale} />)
  })

const skills = program.command('skills').description(t(activeLocale, 'skillsDescription'))

/** 收集重复传入的平台参数。 */
function collectPlatform(value: string, previous: string[]): string[] {
  return [...previous, ...value.split(',').filter(Boolean)]
}

/** 校验 CLI 平台参数。 */
function parseSkillPlatforms(values: string[]): SkillPlatformId[] {
  const allowed = new Set<SkillPlatformId>(['codex', 'claude', 'cursor'])
  const unique = [...new Set(values)]
  if (!unique.length || unique.some((value) => !allowed.has(value as SkillPlatformId))) throw new Error(t(activeLocale, 'platformsError'))
  return unique as SkillPlatformId[]
}

/** 从扫描报告构建 CLI 检测问题。 */
function scanIssues(report: SkillsScanReport): DetectionIssue[] {
  return report.groups.flatMap((group) => {
    if (group.status === 'conflict') return [{ code: 'SKILL_CONTENT_CONFLICT', message: t(activeLocale, 'skillConflict').replace('{name}', group.name) }]
    if (group.status === 'broken') return [{ code: 'BROKEN_SKILL_LINK', message: t(activeLocale, 'skillBroken').replace('{name}', group.name) }]
    if (group.status === 'invalid') return [{ code: 'INVALID_SKILL', message: t(activeLocale, 'skillInvalid').replace('{name}', group.name) }]
    return []
  })
}

skills
  .command('scan')
  .description(t(activeLocale, 'scanDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .option('-p, --platform <platform>', t(activeLocale, 'platformsArgument'), collectPlatform, [])
  .action(async ({ json, platform }: { json?: boolean; platform: string[] }) => {
    const bootstrap = await skillsManager.bootstrap()
    let platforms: SkillPlatformId[]
    if (platform.length) {
      platforms = parseSkillPlatforms(platform)
    } else if (bootstrap.initialized) {
      platforms = (await settingsStore.read()).skills.platforms
    } else if (process.stdin.isTTY && !json) {
      platforms = await choosePlatforms(activeLocale)
    } else {
      if (json) {
        console.log(JSON.stringify({ error: { code: 'PLATFORM_SELECTION_REQUIRED', message: t(activeLocale, 'platformSelectionRequired') } }, null, 2))
        process.exitCode = 2
        return
      }
      throw new Error(t(activeLocale, 'platformSelectionRequired'))
    }
    const current = await settingsStore.read()
    if (current.skills.platforms.join(',') !== platforms.join(',')) {
      await settingsStore.update({ skills: { platforms } }, { source: 'cli', expectedRevision: current.revision })
    }
    const report = await skillsManager.scan(platforms)
    const issues = scanIssues(report)
    if (json) console.log(JSON.stringify(report, null, 2))
    else render(<SkillsScanView report={report} issues={issues} status={issues.length ? 'warning' : 'ok'} locale={activeLocale} />)
  })

skills.command('status').description(t(activeLocale, 'statusDescription')).action(async () => {
  const platforms = (await settingsStore.read()).skills.platforms
  const report = await skillsManager.scan(platforms)
  const issues = scanIssues(report)
  render(<StatusView status={issues.length ? 'warning' : 'ok'} issues={issues} fingerprint={report.fingerprint} locale={activeLocale} />)
})

function unavailable(command: Command): void {
  command.action(() => {
    render(<NoticeView title={command.name()} message={t(activeLocale, 'writeLocked')} />)
    process.exitCode = 2
  })
}

for (const name of ['sync', 'link', 'unlink', 'update']) {
  unavailable(skills.command(name).description(`${name} Skills (${t(activeLocale, 'placeholder')})`))
}
const backups = skills.command('backups').description(t(activeLocale, 'manageBackups'))
for (const name of ['list', 'restore', 'remove']) unavailable(backups.command(name))

const settings = program.command('settings').description(t(activeLocale, 'settingsDescription'))
settings
  .command('show')
  .description(t(activeLocale, 'settingsShowDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .action(async ({ json }: { json?: boolean }) => {
    const current = await settingsStore.read()
    if (json) console.log(JSON.stringify(current, null, 2))
    else render(<SettingsView settings={current} />)
  })

const settingsSet = settings.command('set').description(t(activeLocale, 'settingsSetDescription'))
settingsSet
  .command('backup')
  .argument('<value>', t(activeLocale, 'backupArgument'))
  .description(t(activeLocale, 'backupDescription'))
  .action(async (value: string) => {
    if (!['on', 'off'].includes(value)) throw new Error(t(activeLocale, 'backupError'))
    const updated = await settingsStore.update({ skills: { backupBeforeLink: value === 'on' } }, { source: 'cli' })
    render(<SettingsView settings={updated} changed />)
  })

settingsSet
  .command('platforms')
  .argument('<platforms...>', t(activeLocale, 'platformsArgument'))
  .description(t(activeLocale, 'platformsDescription'))
  .action(async (values: string[]) => {
    const platforms = [...new Set(values.flatMap((value) => value.split(',')).filter(Boolean))]
    const allowed = new Set<ManagedPlatformId>(['codex', 'claude', 'cursor'])
    if (!platforms.length || platforms.some((platform) => !allowed.has(platform as ManagedPlatformId))) {
      throw new Error(t(activeLocale, 'platformsError'))
    }
    const updated = await settingsStore.update(
      { skills: { platforms: platforms as ManagedPlatformId[] } },
      { source: 'cli' },
    )
    render(<SettingsView settings={updated} changed />)
  })

settingsSet
  .command('language')
  .argument('<locale>', t(activeLocale, 'languageArgument'))
  .description(t(activeLocale, 'languageDescription'))
  .action(async (locale: string) => {
    if (!['zh-CN', 'en'].includes(locale)) throw new Error(t(activeLocale, 'languageError'))
    const updated = await settingsStore.update({ locale: locale as AskXLocale }, { source: 'cli' })
    render(<SettingsView settings={updated} changed />)
  })

settingsSet
  .command('theme')
  .argument('<color>', t(activeLocale, 'themeArgument'))
  .description(t(activeLocale, 'themeDescription'))
  .action(async (color: string) => {
    if (!['cyan', 'rose'].includes(color)) throw new Error(t(activeLocale, 'themeError'))
    const updated = await settingsStore.update({ themeColor: color as AskXThemeColor }, { source: 'cli' })
    render(<SettingsView settings={updated} changed />)
  })

const ui = program
  .command('ui')
  .description(t(activeLocale, 'uiDescription'))
  .option('-p, --port <port>', t(activeLocale, 'portDescription'), '4242')

ui
  .action(async ({ port }: { port: string }) => {
    const parsedPort = Number.parseInt(port, 10)
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) throw new Error(`${t(activeLocale, 'invalidPort')}: ${port}`)
    const server = await startUi({ port: parsedPort })
    const ink = render(<UiView url={server.url} locale={activeLocale} />)
    const close = async () => {
      ink.unmount()
      await server.close()
      process.exit(0)
    }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
  })

ui
  .command('token')
  .description(t(activeLocale, 'tokenDescription'))
  .action(async () => {
    const activeToken = await readUiSessionToken()
    if (activeToken) {
      console.log(activeToken)
      return
    }

    const developmentToken = 'askx-local-dev'
    try {
      const response = await fetch(`http://127.0.0.1:4242/api/health?token=${developmentToken}`)
      if (response.ok) {
        console.log(developmentToken)
        return
      }
    } catch {
      // The local development server is not running.
    }
    throw new Error(t(activeLocale, 'noToken'))
  })

await program.parseAsync()
