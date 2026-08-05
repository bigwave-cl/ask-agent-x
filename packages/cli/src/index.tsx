#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  type RollbackResult,
  type UserConsent,
} from '@askx/core'
import { SkillsManager, SkillsModule } from '@askx/module-skills'
import type {
  CanonicalSkillsBackup,
  CanonicalSourceMutationPlan,
  CanonicalSourceMutationReceipt,
} from '@askx/module-skills/canonical-source-manager'
import type {
  PlatformLinkAction,
  PlatformLinkPlan,
  PlatformLinkReceipt,
  SkillManagementChoice,
  SkillPlatformId,
  SkillsBatchPlan,
  SkillsBatchReceipt,
  SkillsScanReport,
} from '@askx/module-skills/skill-types'
import type { SystemSkillRepairPlan, SystemSkillRepairReceipt } from '@askx/module-skills/builtin-skill-manager'
import type { SkillStatsReport, SkillUsagePlan, SkillUsageReceipt } from '@askx/module-skills/skill-manager-registry'
import { detectPlatforms, type PlatformDetection } from '@askx/platform-adapters'
import { readUiSession, readUiSessionToken, startUi, stopUi } from '@askx/web/server'
import { Command } from 'commander'
import { Box, render as inkRender, Text, useApp, useInput } from 'ink'
import { useState, type ReactNode } from 'react'
import { createKeepDecisions, createSafeSyncDecisions, summarizeSkillsBatchPlan } from './skills-command-helpers.js'

const accent = '#d7ff3f'
const registry = new ModuleRegistry()
registry.register(new SkillsModule())
const settingsStore = new SettingsStore(defaultContext().dataDir)
const skillsManager = new SkillsManager(defaultContext())
const activeLocale = (await settingsStore.read()).locale

/** 当前终端中尚未卸载的 Ink 实例。 */
let activeInkInstance: ReturnType<typeof inkRender> | undefined

/**
 * 渲染一个 Ink 视图，并在切换视图前卸载上一实例。
 * @param node 要展示的 React 节点。
 * @returns 当前 Ink 渲染实例。
 */
function render(node: ReactNode): ReturnType<typeof inkRender> {
  activeInkInstance?.unmount()
  activeInkInstance = inkRender(node)
  return activeInkInstance
}

const messages = {
  en: {
    builtInModules: 'built-in modules', doctor: 'doctor', skillsScan: 'skills scan', skillsStatus: 'skills status',
    status: 'Status', ready: 'ready', blocked: 'blocked', notFound: 'not found', ok: 'ok', warning: 'warning',
    noIssues: 'No topology issues detected.', skills: 'Skills', skillsTitle: 'Skills', conflicts: 'conflicts', brokenLinks: 'broken links', fingerprint: 'Fingerprint',
    localUi: 'local ui', serverReady: 'Nuxt server ready', stop: 'Press Ctrl+C to stop.',
    settings: 'settings', settingsUpdated: 'settings updated', revision: 'REVISION', source: 'SOURCE', platforms: 'Platforms', backup: 'Backup', language: 'Language', themeColor: 'Theme', updated: 'Updated',
    writeLocked: 'Write operations are intentionally locked in the foundation release.',
    appDescription: 'Extend every agent. Keep control.', modulesDescription: 'Inspect built-in AskAgent X modules',
    doctorDescription: 'Detect Agent installations and whole Skills-directory proxy eligibility', jsonDescription: 'Print machine-readable JSON',
    skillsDescription: 'Manage one canonical Skills source across Agent directories', scanDescription: 'Read-only scan of selected Skill roots', statusDescription: 'Show current read-only Skills status',
    settingsDescription: 'Read or update shared CLI/Web settings', settingsShowDescription: 'Show the current shared settings', settingsSetDescription: 'Update shared settings',
    backupArgument: 'on or off', backupDescription: 'Enable or disable whole-directory backup before root cutover', backupError: 'Backup must be "on" or "off"',
    platformsArgument: 'codex, claude and/or cursor', platformsDescription: 'Set enabled Agent platforms', platformsError: 'Platforms must contain codex, claude and/or cursor',
    languageArgument: 'zh-CN or en', languageDescription: 'Set the shared CLI/Web language', languageError: 'Language must be "zh-CN" or "en"',
    themeArgument: 'cyan or rose', themeDescription: 'Set the shared CLI/Web theme color', themeError: 'Theme color must be "cyan" or "rose"',
    uiDescription: 'Start or manage the local Nuxt management interface', portDescription: 'Local port; defaults to an available five-digit port', invalidPort: 'Invalid port', tokenDescription: 'Print the active local UI token', noToken: 'No active UI session. Start "pnpm dev" or "askx ui start" first.', uiStartDescription: 'Start the local UI as a background service', uiStopDescription: 'Stop the background UI service', uiStatusDescription: 'Show background UI service status', uiRestartDescription: 'Restart the background UI service', uiAlreadyRunning: 'The local UI is already running', uiStarted: 'The local UI started in the background', uiStopped: 'The local UI service stopped', uiNotRunning: 'The local UI is not running', uiRunning: 'The local UI is running', uninstallDescription: 'Stop the local UI and uninstall AskAgent X globally', uninstallSourceOnly: 'Run this command from a globally installed AskAgent X package', uninstallFailed: 'npm uninstall failed',
    manageBackups: 'Manage canonical Skills source backups', historyDescription: 'List completed Skills transactions', rollbackDescription: 'Roll back the latest unchanged Skills transaction', backupListDescription: 'List canonical source backups', backupRestoreDescription: 'Restore the canonical source from a backup', backupRemoveDescription: 'Permanently remove a canonical source backup', receiptArgument: 'transaction receipt ID', backupVersionArgument: 'backup version', historyTitle: 'Skills transaction history', rollbackPlan: 'Skills rollback plan', rollbackResult: 'Skills rollback result', backupRestorePlan: 'Backup restore plan', backupRestoreResult: 'Backup restored', backupRemovePlan: 'Backup removal plan', backupRemoveResult: 'Backup removed', noTransactions: 'No completed Skills transactions.', noBackups: 'No canonical source backups.', restored: 'restored', rollbackRejected: 'rollback rejected', valid: 'valid', invalid: 'invalid',
    choosePlatforms: 'Choose platforms to scan', scanOnlySelected: 'Space toggles · Enter confirms', platformRequired: 'Select at least one platform.', platformSelectionRequired: 'First scan requires --platform in non-interactive mode.',
    skillConflict: 'Skill {name} has conflicting content.', skillBroken: 'Skill {name} has a broken link.', skillInvalid: 'Skill {name} has invalid metadata.',
    syncDescription: 'Synchronize safe Skills from selected roots into the AskX canonical source', linkDescription: 'Bind or resume selected Agent Skills directories to the canonical source', unlinkDescription: 'Suspend selected managed Skills-directory links without synchronizing content',
    directoryDescription: 'Add a custom directory as a read-only synchronization source', linkDirectoryDescription: 'Bind a custom local directory to the canonical source', yesDescription: 'Confirm the displayed immutable plan without an interactive prompt',
    syncPlan: 'Skills sync plan', linkPlan: 'Skills link plan', unlinkPlan: 'Skills unlink plan', syncResult: 'Skills sync result', linkResult: 'Skills link result', unlinkResult: 'Skills unlink result',
    planHash: 'Plan hash', adopt: 'adopt', merge: 'merge', keep: 'keep', customDirectories: 'custom directories', operations: 'operations', applied: 'applied', skipped: 'skipped', failed: 'failed',
    confirmApply: 'Apply this exact plan?', confirmKeys: 'Y confirms · N/Esc cancels', cancelled: 'Operation cancelled.', confirmationRequired: 'A write plan requires confirmation. Re-run with --yes in non-interactive or JSON mode.',
    skillsNotInitialized: 'Skills management is not initialized. Run "askx skills sync" first.', platformWriteRequired: 'Select at least one platform for this link operation.', conflictKept: 'Conflicting Skills are kept unchanged and are not overwritten automatically.',
    linkTarget: 'link target', statsDescription: 'Show managed Skill versions, usage and target health', usageDescription: 'Record explicit local Skill usage', usageRecordDescription: 'Record one use by Skill name or stable ID', managerDescription: 'Manage the built-in AskX Skill Manager', managerRepairDescription: 'Repair a missing, corrupt or outdated built-in Skill Manager', manageAllDescription: 'Initialize version management for every eligible unmanaged Skill', manageSkillDescription: 'Initialize or refresh version management for a named Skill', migrateBoboDescription: 'Migrate a bobo-managed Skill to AskX while preserving its ID and version', statsTitle: 'Skill statistics', totalUsage: 'usage', totalTargets: 'targets', issueTargets: 'target issues', usagePlan: 'Usage record plan', usageResult: 'Usage recorded', managerRepairPlan: 'Skill Manager repair plan', managerRepairResult: 'Skill Manager repaired', skillName: 'Skill', version: 'Version', systemHealth: 'Previous health', preserveRegistry: 'Preserve registry', registryRevision: 'Registry revision', usageCount: 'Usage count', management: 'version management', repairWarnings: 'Warnings',
  },
  'zh-CN': {
    builtInModules: '内置模块', doctor: '环境诊断', skillsScan: 'Skills 扫描', skillsStatus: 'Skills 状态',
    status: '状态', ready: '就绪', blocked: '受阻', notFound: '未发现', ok: '正常', warning: '警告',
    noIssues: '未检测到拓扑问题。', skills: '个 Skills', skillsTitle: 'Skills', conflicts: '个冲突', brokenLinks: '个失效链接', fingerprint: '指纹',
    localUi: '本地界面', serverReady: 'Nuxt 服务已就绪', stop: '按 Ctrl+C 停止。',
    settings: '共享设置', settingsUpdated: '设置已更新', revision: '版本', source: '来源', platforms: '平台', backup: '备份', language: '语言', themeColor: '主题色', updated: '更新时间',
    writeLocked: '基础版本暂未开放写入操作。',
    appDescription: '扩展每一个 Agent，控制始终在你手中。', modulesDescription: '查看 AskAgent X 内置模块',
    doctorDescription: '检测 Agent 安装状态与整个 Skills 目录的代理条件', jsonDescription: '输出机器可读的 JSON',
    skillsDescription: '以一份统一源管理各 Agent 的 Skills 目录', scanDescription: '只读扫描选中的 Skill 根目录', statusDescription: '显示当前只读 Skills 状态',
    settingsDescription: '读取或更新 CLI/Web 共享设置', settingsShowDescription: '显示当前共享设置', settingsSetDescription: '更新共享设置',
    backupArgument: 'on 或 off', backupDescription: '启用或关闭根目录切换前的整目录备份', backupError: '备份参数必须是 "on" 或 "off"',
    platformsArgument: 'codex、claude 和/或 cursor', platformsDescription: '设置启用的 Agent 平台', platformsError: '平台必须包含 codex、claude 和/或 cursor',
    languageArgument: 'zh-CN 或 en', languageDescription: '设置 CLI/Web 共享语言', languageError: '语言必须是 "zh-CN" 或 "en"',
    themeArgument: 'cyan 或 rose', themeDescription: '设置 CLI/Web 共享主题色', themeError: '主题色必须是 "cyan" 或 "rose"',
    uiDescription: '启动或管理本地 Nuxt 管理界面', portDescription: '本地端口，默认自动选择可用的五位端口', invalidPort: '无效端口', tokenDescription: '输出当前本地 UI token', noToken: '没有活动的 UI 会话，请先运行 "pnpm dev" 或 "askx ui start"。', uiStartDescription: '以后台服务方式启动本地 UI', uiStopDescription: '停止后台 UI 服务', uiStatusDescription: '查看后台 UI 服务状态', uiRestartDescription: '重启后台 UI 服务', uiAlreadyRunning: '本地 UI 已在运行', uiStarted: '本地 UI 已在后台启动', uiStopped: '本地 UI 服务已停止', uiNotRunning: '本地 UI 未运行', uiRunning: '本地 UI 正在运行', uninstallDescription: '停止本地 UI 并全局卸载 AskAgent X', uninstallSourceOnly: '请从全局安装的 AskAgent X 包运行此命令', uninstallFailed: 'npm 卸载失败',
    manageBackups: '管理统一 Skills 来源备份', historyDescription: '列出已完成的 Skills 事务', rollbackDescription: '回滚最新且状态未变化的 Skills 事务', backupListDescription: '列出统一源备份', backupRestoreDescription: '从指定备份恢复统一源', backupRemoveDescription: '永久删除指定统一源备份', receiptArgument: '事务回执 ID', backupVersionArgument: '备份版本', historyTitle: 'Skills 事务历史', rollbackPlan: 'Skills 回滚计划', rollbackResult: 'Skills 回滚结果', backupRestorePlan: '备份恢复计划', backupRestoreResult: '备份恢复完成', backupRemovePlan: '备份删除计划', backupRemoveResult: '备份删除完成', noTransactions: '没有已完成的 Skills 事务。', noBackups: '没有统一源备份。', restored: '已恢复', rollbackRejected: '拒绝回滚', valid: '有效', invalid: '无效',
    choosePlatforms: '选择需要扫描的平台', scanOnlySelected: '空格切换 · 回车确认', platformRequired: '至少选择一个平台。', platformSelectionRequired: '非交互模式首次扫描必须传入 --platform。',
    skillConflict: 'Skill {name} 在不同平台的内容不一致。', skillBroken: 'Skill {name} 包含失效软链。', skillInvalid: 'Skill {name} 的元数据无效。',
    syncDescription: '将选中来源中可安全接管的 Skills 同步到 AskX 统一源', linkDescription: '将选中的 Agent Skills 根目录绑定或恢复到统一源', unlinkDescription: '无损停用选中的受管 Skills 根目录软链，不同步内容',
    directoryDescription: '添加一个只读同步来源的自定义目录', linkDirectoryDescription: '将一个自定义本地目录绑定到统一源', yesDescription: '无需交互确认，直接授权已展示的不可变计划',
    syncPlan: 'Skills 同步计划', linkPlan: 'Skills 软链计划', unlinkPlan: 'Skills 取消软链计划', syncResult: 'Skills 同步结果', linkResult: 'Skills 软链结果', unlinkResult: 'Skills 取消软链结果',
    planHash: '计划指纹', adopt: '接管', merge: '合并', keep: '保留', customDirectories: '自定义目录', operations: '操作', applied: '已应用', skipped: '已跳过', failed: '失败',
    confirmApply: '确认执行这份完整计划？', confirmKeys: 'Y 确认 · N/Esc 取消', cancelled: '操作已取消。', confirmationRequired: '写操作必须明确授权；非交互或 JSON 模式请重新执行并传入 --yes。',
    skillsNotInitialized: 'Skills 管理尚未初始化，请先运行 "askx skills sync"。', platformWriteRequired: '软链操作至少需要选择一个平台。', conflictKept: '内容冲突的 Skills 会保留现状，不会自动覆盖。',
    linkTarget: '软链目标', statsDescription: '查看受管 Skill 的版本、使用次数和目标状态', usageDescription: '记录明确的本地 Skill 使用', usageRecordDescription: '按 Skill 名称或稳定 ID 记录一次使用', managerDescription: '管理 AskX 内置 Skill Manager', managerRepairDescription: '修复缺失、损坏或过期的内置 Skill Manager', manageAllDescription: '为全部符合条件的未托管 Skill 初始化版本管理', manageSkillDescription: '为指定 Skill 初始化或刷新版本管理', migrateBoboDescription: '保留 ID 和版本，将 bobo 托管 Skill 迁移为 AskX 身份', statsTitle: 'Skill 统计', totalUsage: '累计使用', totalTargets: '同步目标', issueTargets: '异常目标', usagePlan: 'Usage 记录计划', usageResult: 'Usage 已记录', managerRepairPlan: 'Skill Manager 修复计划', managerRepairResult: 'Skill Manager 已修复', skillName: 'Skill', version: '版本', systemHealth: '修复前状态', preserveRegistry: '保留 Registry', registryRevision: 'Registry 版本', usageCount: '累计次数', management: '版本管理', repairWarnings: '提示',
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
        const state = platform.linkSupported ? 'ready' : 'blocked'
        return (
          <Box key={platform.id} flexDirection="column" marginBottom={1}>
            <Box gap={2}>
              <Text bold>{platform.name.padEnd(16)}</Text>
              <State value={state} locale={locale} />
              <Text dimColor>{platform.installed ? platform.version ?? '' : t(locale, 'notFound')}</Text>
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

/** 写操作通用选项。 */
interface SkillsWriteOptions {
  /** 是否输出纯 JSON。 */
  json?: boolean
  /** 是否跳过交互并授权当前计划。 */
  yes?: boolean
}

/** 交互式写计划确认属性。 */
interface ConfirmationPromptProps {
  /** 当前界面语言。 */
  locale: AskXLocale
  /** 用户完成选择时回传确认状态。 */
  onComplete: (confirmed: boolean) => void
}

/** Skills 写计划使用的 Ink 确认界面。 */
function ConfirmationPrompt({ locale, onComplete }: ConfirmationPromptProps) {
  const { exit } = useApp()
  useInput((input, key) => {
    const normalized = input.toLocaleLowerCase()
    if (normalized === 'y') {
      onComplete(true)
      exit()
    }
    if (normalized === 'n' || normalized === 'q' || key.escape) {
      onComplete(false)
      exit()
    }
  })
  return (
    <Frame title={t(locale, 'confirmApply')}>
      <Text>{t(locale, 'confirmApply')}</Text>
      <Text dimColor>{t(locale, 'confirmKeys')}</Text>
    </Frame>
  )
}

/** 等待用户确认当前已经展示的写计划。 */
function confirmWrite(locale: AskXLocale): Promise<boolean> {
  return new Promise((resolve) => render(<ConfirmationPrompt locale={locale} onComplete={resolve} />))
}

/**
 * 校验当前环境已经取得明确授权。
 * @param options JSON 与免交互选项。
 * @param planPayload 需要在机器模式返回的完整计划。
 * @returns 当前写操作是否可以继续。
 */
async function authorizeWrite(options: SkillsWriteOptions, planPayload: unknown): Promise<boolean> {
  if (options.yes) return true
  if (options.json || !process.stdin.isTTY) {
    console.log(JSON.stringify({
      error: { code: 'CONFIRMATION_REQUIRED', message: t(activeLocale, 'confirmationRequired') },
      plan: planPayload,
    }, null, 2))
    process.exitCode = 2
    return false
  }
  return confirmWrite(activeLocale)
}

/** Skills 同步或接入计划的终端展示。 */
function SkillsBatchPlanView({ plan, report, locale, title }: { plan: SkillsBatchPlan; report: SkillsScanReport; locale: AskXLocale; title: string }) {
  const summary = summarizeSkillsBatchPlan(plan, report)
  return (
    <Frame title={title}>
      <Text dimColor>{t(locale, 'planHash')}  {plan.hash}</Text>
      <Box marginTop={1} gap={2}>
        <Text>{t(locale, 'skills')} <Text color={accent}>{summary.total}</Text></Text>
        <Text>{t(locale, 'adopt')} <Text color="green">{summary.adopt}</Text></Text>
        <Text>{t(locale, 'merge')} <Text color="green">{summary.merge}</Text></Text>
        <Text>{t(locale, 'keep')} <Text color={summary.keep ? 'yellow' : 'green'}>{summary.keep}</Text></Text>
        <Text>{t(locale, 'platforms')} <Text color={accent}>{summary.platformLinks}</Text></Text>
        <Text>{t(locale, 'customDirectories')} <Text color={accent}>{summary.customLinks}</Text></Text>
      </Box>
      {summary.conflicts ? <Text color="yellow">! {t(locale, 'conflictKept')} ({summary.conflicts})</Text> : null}
      <Box flexDirection="column" marginTop={1}>
        {plan.units.map((unit) => (
          <Text key={unit.id} dimColor>
            · {unit.skillName}  [{t(locale, unit.decision.kind === 'adopt' ? 'adopt' : unit.decision.kind === 'merge' ? 'merge' : 'keep')}]
          </Text>
        ))}
        {plan.platformOperations.map((operation) => <Text key={operation.platform} color={accent}>→ {operation.platform}  {operation.path}</Text>)}
        {plan.customLinkOperations.map((operation) => <Text key={operation.id} color={accent}>→ {operation.name}  {operation.path}</Text>)}
      </Box>
    </Frame>
  )
}

/** Skills 同步或接入回执的终端展示。 */
function SkillsBatchReceiptView({ receipt, locale, title }: { receipt: SkillsBatchReceipt; locale: AskXLocale; title: string }) {
  const applied = receipt.results.filter((result) => result.status === 'applied').length
  const skipped = receipt.results.filter((result) => result.status === 'skipped').length
  const failed = receipt.results.filter((result) => result.status === 'failed' || result.status === 'rolled-back').length
  return (
    <Frame title={title}>
      <Box gap={2}>
        <Text>{t(locale, 'applied')} <Text color="green">{applied}</Text></Text>
        <Text>{t(locale, 'skipped')} <Text color="yellow">{skipped}</Text></Text>
        <Text>{t(locale, 'failed')} <Text color={failed ? 'red' : 'green'}>{failed}</Text></Text>
        <Text>{t(locale, 'platforms')} <Text color={accent}>{receipt.platformResults.length}</Text></Text>
      </Box>
      {receipt.platformResults.map((result) => <Text key={result.platform} color={result.status === 'failed' ? 'red' : 'green'}>{result.status === 'failed' ? '×' : '✓'} {result.platform}  {result.status}</Text>)}
    </Frame>
  )
}

/** 单个平台软链计划的终端展示。 */
function PlatformLinkPlanView({ plan, locale, title }: { plan: PlatformLinkPlan; locale: AskXLocale; title: string }) {
  return (
    <Frame title={title}>
      <Text dimColor>{t(locale, 'planHash')}  {plan.hash}</Text>
      <Text>{t(locale, 'platforms')}  <Text color={accent}>{plan.platform}</Text></Text>
      <Text>{t(locale, 'source')}  {plan.path}</Text>
      <Text>{t(locale, 'linkTarget')}  {plan.target}</Text>
      <Text>{t(locale, 'operations')}  <Text color={plan.operations.length ? 'yellow' : 'green'}>{plan.operations.length}</Text></Text>
    </Frame>
  )
}

/** CLI 中单个平台软链操作的执行结果。 */
interface CliPlatformLinkResult {
  /** 目标平台。 */
  platform: SkillPlatformId
  /** 当前平台执行状态。 */
  status: 'applied' | 'skipped' | 'failed'
  /** 成功或幂等跳过时的模块回执。 */
  receipt?: PlatformLinkReceipt
  /** 当前平台失败时的错误信息。 */
  error?: string
}

/** 多个平台与自定义目录软链结果的终端展示。 */
function PlatformLinkResultsView({ results, batchReceipt, locale, title }: { results: CliPlatformLinkResult[]; batchReceipt?: SkillsBatchReceipt | undefined; locale: AskXLocale; title: string }) {
  return (
    <Frame title={title}>
      {results.map((result) => (
        <Text key={result.platform} color={result.status === 'applied' ? 'green' : result.status === 'failed' ? 'red' : 'yellow'}>
          {result.status === 'applied' ? '✓' : result.status === 'failed' ? '×' : '·'} {result.platform}  {t(locale, result.status)}{result.error ? `  ${result.error}` : ''}
        </Text>
      ))}
      {batchReceipt?.customLinkResults.map((result) => (
        <Text key={result.id} color={result.status === 'applied' ? 'green' : result.status === 'failed' ? 'red' : 'yellow'}>
          {result.status === 'applied' ? '✓' : result.status === 'failed' ? '×' : '·'} {result.name}  {result.path}  {t(locale, result.status === 'rolled-back' ? 'failed' : result.status)}
        </Text>
      ))}
    </Frame>
  )
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

/** Skills 事务历史终端视图。 */
function SkillsHistoryView({ receipts, locale }: { receipts: SkillsBatchReceipt[]; locale: AskXLocale }) {
  return (
    <Frame title={t(locale, 'historyTitle')}>
      {!receipts.length ? <Text dimColor>{t(locale, 'noTransactions')}</Text> : receipts.map((receipt, index) => (
        <Text key={receipt.id} {...(index === 0 ? { color: accent } : {})}>
          {index === 0 ? '●' : '·'} {receipt.appliedAt}  {receipt.id}  {t(locale, 'applied')} {receipt.results.filter(result => result.status === 'applied').length}
        </Text>
      ))}
    </Frame>
  )
}

/** 统一源备份列表终端视图。 */
function CanonicalBackupsView({ backups, locale }: { backups: CanonicalSkillsBackup[]; locale: AskXLocale }) {
  return (
    <Frame title={t(locale, 'manageBackups')}>
      {!backups.length ? <Text dimColor>{t(locale, 'noBackups')}</Text> : backups.map(backup => (
        <Text key={backup.version} color={backup.valid ? 'green' : 'red'}>
          {backup.valid ? '✓' : '×'} {backup.version}  {t(locale, backup.valid ? 'valid' : 'invalid')}  {backup.skillCount ?? 0} {t(locale, 'skills')}{backup.issue ? `  ${backup.issue}` : ''}
        </Text>
      ))}
    </Frame>
  )
}

/** 展示统一源备份写计划。 */
function CanonicalPlanView({ plan, locale, title }: { plan: CanonicalSourceMutationPlan; locale: AskXLocale; title: string }) {
  return (
    <Frame title={title}>
      <Text>{t(locale, 'operations')}  <Text color="yellow">{plan.action}</Text></Text>
      <Text>{t(locale, 'backup')}  <Text color={accent}>{plan.backupVersion ?? '-'}</Text></Text>
      <Text>{t(locale, 'skills')}  {plan.currentSkillCount}</Text>
      <Text dimColor>{t(locale, 'planHash')}  {plan.hash}</Text>
    </Frame>
  )
}

function NoticeView({ title, message }: { title: string; message: string }) {
  return <Frame title={title}><Text color="yellow">◆ {message}</Text></Frame>
}

/** Skill 统计终端视图。 */
function SkillStatsView({ report, locale }: { report: SkillStatsReport; locale: AskXLocale }) {
  return (
    <Frame title={t(locale, 'statsTitle')}>
      <Box gap={2}>
        <Text>{t(locale, 'skills')} <Text color={accent}>{report.totalSkills}</Text></Text>
        <Text>{t(locale, 'totalUsage')} <Text color={accent}>{report.totalUsage}</Text></Text>
        <Text>{t(locale, 'totalTargets')} <Text color={accent}>{report.totalTargets}</Text></Text>
        <Text>{t(locale, 'issueTargets')} <Text color={report.issueTargets ? 'yellow' : 'green'}>{report.issueTargets}</Text></Text>
      </Box>
      <Text dimColor>{t(locale, 'registryRevision')}  #{report.revision}</Text>
      <Box flexDirection="column" marginTop={1}>
        {report.items.map((item) => (
          <Text key={item.skillId}>· <Text bold>{item.name}</Text>  {item.version || '-'}  {t(locale, 'usageCount')} {item.usageCount}  {t(locale, 'totalTargets')} {item.targetCount}</Text>
        ))}
      </Box>
    </Frame>
  )
}

/** usage 计划终端视图。 */
function SkillUsagePlanView({ plan, locale }: { plan: SkillUsagePlan; locale: AskXLocale }) {
  return (
    <Frame title={t(locale, 'usagePlan')}>
      <Text>{t(locale, 'skillName')}  <Text color={accent}>{plan.skillName}</Text></Text>
      <Text>{t(locale, 'registryRevision')}  #{plan.registryRevision}</Text>
      <Text dimColor>{t(locale, 'planHash')}  {plan.hash}</Text>
    </Frame>
  )
}

/** usage 写入回执终端视图。 */
function SkillUsageReceiptView({ receipt, locale }: { receipt: SkillUsageReceipt; locale: AskXLocale }) {
  return <Frame title={t(locale, 'usageResult')}><Text>{t(locale, 'usageCount')}  <Text color="green">{receipt.usageCount}</Text></Text><Text>{t(locale, 'registryRevision')}  #{receipt.registryRevision}</Text></Frame>
}

/** 系统 Skill 修复计划终端视图。 */
function SystemSkillRepairPlanView({ plan, locale }: { plan: SystemSkillRepairPlan; locale: AskXLocale }) {
  return (
    <Frame title={t(locale, 'managerRepairPlan')}>
      <Text>{t(locale, 'systemHealth')}  <Text color="yellow">{plan.health}</Text></Text>
      <Text>{t(locale, 'preserveRegistry')}  <Text color={plan.preserveRegistry ? 'green' : 'yellow'}>{plan.preserveRegistry ? 'YES' : 'NO'}</Text></Text>
      <Text dimColor>{t(locale, 'planHash')}  {plan.hash}</Text>
    </Frame>
  )
}

/** 系统 Skill 修复回执终端视图。 */
function SystemSkillRepairReceiptView({ receipt, locale }: { receipt: SystemSkillRepairReceipt; locale: AskXLocale }) {
  return (
    <Frame title={t(locale, 'managerRepairResult')}>
      <Text color="green">✓ {receipt.previousHealth}</Text>
      <Text>{t(locale, 'registryRevision')}  #{receipt.manifestRevision}</Text>
      {receipt.warnings.map((warning) => <Text key={warning} color="yellow">! {warning}</Text>)}
    </Frame>
  )
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
/** 当前 AskAgent X 发布版本，格式为“年.月日.当日次数”。 */
const askxVersion = '26.805.1'
program.name('askx').description(t(activeLocale, 'appDescription')).version(askxVersion)

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

/** 收集重复传入的目录参数。 */
function collectDirectory(value: string, previous: string[]): string[] {
  return [...previous, value]
}

/** 收集重复传入的 Skill 名称。 */
function collectSkillName(value: string, previous: string[]): string[] {
  return [...previous, value]
}

/**
 * 将 CLI 版本管理参数解析为与扫描分组绑定的选择。
 * @param report 当前只读扫描报告。
 * @param manageAll 是否纳管全部符合条件的 Skill。
 * @param managedNames 用户逐项选择的 Skill 名称。
 * @param migratedNames 用户逐项选择迁移旧身份的 Skill 名称。
 * @returns 进入计划 hash 的完整版本管理选择。
 */
function createManagementChoices(
  report: SkillsScanReport,
  manageAll: boolean,
  managedNames: string[],
  migratedNames: string[],
): SkillManagementChoice[] {
  const selected = new Set(managedNames)
  const migrated = new Set(migratedNames)
  const knownNames = new Set(report.groups.map((group) => group.name))
  const unknown = [...selected, ...migrated].filter((name) => !knownNames.has(name))
  if (unknown.length) throw new Error(`找不到扫描到的 Skill：${[...new Set(unknown)].join(', ')}`)
  const choices: SkillManagementChoice[] = []
  for (const group of report.groups) {
    const source = group.locations.find(location => location.metadata.valid && !location.broken)
    const state = source?.managerState
    if (migrated.has(group.name)) {
      if (state !== 'bobo-managed') throw new Error(`Skill ${group.name} 不是 bobo-skill-manager 托管项。`)
      choices.push({ groupId: group.id, action: 'migrate-bobo' })
      continue
    }
    if (!manageAll && !selected.has(group.name)) continue
    if (state === 'unmanaged') choices.push({ groupId: group.id, action: 'initialize' })
    else if (state === 'metadata-stale') choices.push({ groupId: group.id, action: 'refresh' })
  }
  return choices
}

/** 校验 CLI 平台参数。 */
function parseSkillPlatforms(values: string[]): SkillPlatformId[] {
  const allowed = new Set<SkillPlatformId>(['codex', 'claude', 'cursor'])
  const unique = [...new Set(values)]
  if (!unique.length || unique.some((value) => !allowed.has(value as SkillPlatformId))) throw new Error(t(activeLocale, 'platformsError'))
  return unique as SkillPlatformId[]
}

/**
 * 为一个不可变计划创建当前时刻的用户授权。
 * @param plan 已向用户展示或由 --yes 明确授权的计划。
 * @returns 与计划 hash 绑定的授权。
 */
function consentFor(plan: { hash: string }): UserConsent {
  return { planHash: plan.hash, confirmedAt: new Date().toISOString() }
}

/**
 * 解析扫描或同步命令的平台范围。
 * @param values 命令行重复传入的平台参数。
 * @param initialized Skills 管理是否已经初始化。
 * @param json 是否处于机器输出模式。
 * @returns 可继续扫描的平台；缺少首次非交互选择时返回 null。
 */
async function resolveSourcePlatforms(values: string[], initialized: boolean, json = false): Promise<SkillPlatformId[] | null> {
  if (values.length) return parseSkillPlatforms(values)
  if (initialized) return (await settingsStore.read()).skills.platforms
  if (process.stdin.isTTY && !json) return choosePlatforms(activeLocale)
  const payload = { error: { code: 'PLATFORM_SELECTION_REQUIRED', message: t(activeLocale, 'platformSelectionRequired') } }
  if (json) console.log(JSON.stringify(payload, null, 2))
  else render(<NoticeView title={t(activeLocale, 'skillsScan')} message={payload.error.message} />)
  process.exitCode = 2
  return null
}

/** 单个平台软链计划执行状态。 */
interface PlatformLinkExecution {
  /** 用户是否取消了当前命令。 */
  cancelled: boolean
  /** 未取消时的平台结果。 */
  result?: CliPlatformLinkResult
}

/**
 * 生成、展示并应用单个平台的软链状态计划。
 * @param platform 目标平台。
 * @param action 恢复或停用软链。
 * @param options 写命令输出与授权选项。
 * @returns 当前平台执行结果或取消状态。
 */
async function executePlatformLinkAction(platform: SkillPlatformId, action: PlatformLinkAction, options: SkillsWriteOptions): Promise<PlatformLinkExecution> {
  try {
    const plan = await skillsManager.planPlatformLink(platform, action)
    if (!options.json) render(<PlatformLinkPlanView plan={plan} locale={activeLocale} title={t(activeLocale, action === 'resume' ? 'linkPlan' : 'unlinkPlan')} />)
    if (!await authorizeWrite(options, plan)) {
      if (!options.json && process.stdin.isTTY) render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
      return { cancelled: true }
    }
    const receipt = await skillsManager.applyPlatformLink(plan, consentFor(plan))
    return { cancelled: false, result: { platform, status: receipt.status, receipt } }
  } catch (error) {
    return { cancelled: false, result: { platform, status: 'failed', error: (error as Error).message } }
  }
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
  .option('-d, --directory <path>', t(activeLocale, 'directoryDescription'), collectDirectory, [])
  .action(async ({ json, platform, directory }: { json?: boolean; platform: string[]; directory: string[] }) => {
    const bootstrap = await skillsManager.bootstrap()
    const platforms = await resolveSourcePlatforms(platform, bootstrap.initialized, json)
    if (!platforms) return
    const current = await settingsStore.read()
    if (current.skills.platforms.join(',') !== platforms.join(',')) {
      await settingsStore.update({ skills: { platforms } }, { source: 'cli', expectedRevision: current.revision })
    }
    const report = await skillsManager.scan(platforms, directory)
    const issues = scanIssues(report)
    if (json) console.log(JSON.stringify(report, null, 2))
    else render(<SkillsScanView report={report} issues={issues} status={issues.length ? 'warning' : 'ok'} locale={activeLocale} />)
  })

/** Skills 同步命令选项。 */
interface SkillsSyncOptions extends SkillsWriteOptions {
  /** 要扫描并同步的平台参数。 */
  platform: string[]
  /** 额外的只读 Skill 来源目录。 */
  directory: string[]
  /** 是否纳管全部符合条件的 Skill。 */
  manageAll?: boolean
  /** 要纳入或刷新版本管理的 Skill 名称。 */
  manageSkill: string[]
  /** 要从个人 manager 迁移身份的 Skill 名称。 */
  migrateBobo: string[]
}

skills
  .command('sync')
  .description(t(activeLocale, 'syncDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .option('-y, --yes', t(activeLocale, 'yesDescription'))
  .option('-p, --platform <platform>', t(activeLocale, 'platformsArgument'), collectPlatform, [])
  .option('-d, --directory <path>', t(activeLocale, 'directoryDescription'), collectDirectory, [])
  .option('--manage-all', t(activeLocale, 'manageAllDescription'))
  .option('--manage-skill <name>', t(activeLocale, 'manageSkillDescription'), collectSkillName, [])
  .option('--migrate-bobo <name>', t(activeLocale, 'migrateBoboDescription'), collectSkillName, [])
  .action(async (options: SkillsSyncOptions) => {
    const bootstrap = await skillsManager.bootstrap()
    const platforms = await resolveSourcePlatforms(options.platform, bootstrap.initialized, options.json)
    if (!platforms) return
    let settings = await settingsStore.read()
    if (settings.skills.platforms.join(',') !== platforms.join(',')) {
      settings = await settingsStore.update({ skills: { platforms } }, { source: 'cli', expectedRevision: settings.revision })
    }
    const report = await skillsManager.scan(platforms, options.directory)
    const plan = await skillsManager.planOnboarding({
      platforms,
      customRoots: options.directory,
      detectionFingerprint: report.fingerprint,
      settingsRevision: settings.revision,
      decisions: createSafeSyncDecisions(report),
      managementChoices: createManagementChoices(report, Boolean(options.manageAll), options.manageSkill, options.migrateBobo),
      mode: 'sync',
      linkPlatforms: [],
    })
    if (!options.json) render(<SkillsBatchPlanView plan={plan} report={report} locale={activeLocale} title={t(activeLocale, 'syncPlan')} />)
    if (!await authorizeWrite(options, plan)) {
      if (!options.json && process.stdin.isTTY) render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
      return
    }
    const latestSettings = await settingsStore.read()
    const receipt = await skillsManager.applyOnboarding(plan, latestSettings.revision, consentFor(plan))
    if (options.json) console.log(JSON.stringify(receipt, null, 2))
    else render(<SkillsBatchReceiptView receipt={receipt} locale={activeLocale} title={t(activeLocale, 'syncResult')} />)
  })

/** Skills 软链命令选项。 */
interface SkillsLinkOptions extends SkillsWriteOptions {
  /** 要绑定或恢复的平台参数。 */
  platform: string[]
  /** 要额外绑定到统一源的本地目录。 */
  directory: string[]
}

skills
  .command('link')
  .description(t(activeLocale, 'linkDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .option('-y, --yes', t(activeLocale, 'yesDescription'))
  .option('-p, --platform <platform>', t(activeLocale, 'platformsArgument'), collectPlatform, [])
  .option('-d, --directory <path>', t(activeLocale, 'linkDirectoryDescription'), collectDirectory, [])
  .action(async (options: SkillsLinkOptions) => {
    let bootstrap = await skillsManager.bootstrap()
    if (!bootstrap.initialized) throw new Error(t(activeLocale, 'skillsNotInitialized'))
    let selectedPlatforms: SkillPlatformId[] = []
    if (options.platform.length) selectedPlatforms = parseSkillPlatforms(options.platform)
    else if (!options.directory.length && process.stdin.isTTY && !options.json) selectedPlatforms = await choosePlatforms(activeLocale)
    else if (!options.directory.length) throw new Error(t(activeLocale, 'platformWriteRequired'))

    const results: CliPlatformLinkResult[] = []
    const bindings = new Map(bootstrap.platformBindings.map((binding) => [binding.platform, binding]))
    const suspendedPlatforms = selectedPlatforms.filter((platform) => bindings.get(platform)?.suspendedAt)
    const activePlatforms = selectedPlatforms.filter((platform) => bindings.has(platform) && !bindings.get(platform)?.suspendedAt)
    const newPlatforms = selectedPlatforms.filter((platform) => !bindings.has(platform))

    for (const platform of suspendedPlatforms) {
      const execution = await executePlatformLinkAction(platform, 'resume', options)
      if (execution.cancelled) return
      if (execution.result) results.push(execution.result)
    }
    results.push(...activePlatforms.map((platform) => ({ platform, status: 'skipped' as const })))

    let batchReceipt: SkillsBatchReceipt | undefined
    if (newPlatforms.length || options.directory.length) {
      bootstrap = await skillsManager.bootstrap()
      const settings = await settingsStore.read()
      const scanPlatforms = [...new Set([...settings.skills.platforms, ...newPlatforms])]
      const report = await skillsManager.scan(scanPlatforms)
      const plan = await skillsManager.planOnboarding({
        platforms: scanPlatforms,
        detectionFingerprint: report.fingerprint,
        settingsRevision: settings.revision,
        decisions: createKeepDecisions(report),
        mode: 'connect',
        linkPlatforms: newPlatforms,
        linkCustomRoots: options.directory,
      })
      if (!options.json) render(<SkillsBatchPlanView plan={plan} report={report} locale={activeLocale} title={t(activeLocale, 'linkPlan')} />)
      if (!await authorizeWrite(options, plan)) {
        if (!options.json && process.stdin.isTTY) render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
        return
      }
      const latestSettings = await settingsStore.read()
      batchReceipt = await skillsManager.applyOnboarding(plan, latestSettings.revision, consentFor(plan))
      results.push(...batchReceipt.platformResults.map((result) => ({
        platform: result.platform,
        status: result.status === 'rolled-back' ? 'failed' as const : result.status,
        ...(result.warnings.length ? { error: result.warnings.join('; ') } : {}),
      })))
    }

    const payload = { results, ...(batchReceipt ? { batchReceipt } : {}) }
    if (options.json) console.log(JSON.stringify(payload, null, 2))
    else render(<PlatformLinkResultsView results={results} batchReceipt={batchReceipt} locale={activeLocale} title={t(activeLocale, 'linkResult')} />)
  })

/** Skills 取消软链命令选项。 */
interface SkillsUnlinkOptions extends SkillsWriteOptions {
  /** 要停用软链的平台参数。 */
  platform: string[]
}

skills
  .command('unlink')
  .description(t(activeLocale, 'unlinkDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .option('-y, --yes', t(activeLocale, 'yesDescription'))
  .option('-p, --platform <platform>', t(activeLocale, 'platformsArgument'), collectPlatform, [])
  .action(async (options: SkillsUnlinkOptions) => {
    const bootstrap = await skillsManager.bootstrap()
    if (!bootstrap.initialized) throw new Error(t(activeLocale, 'skillsNotInitialized'))
    let platforms: SkillPlatformId[]
    if (options.platform.length) platforms = parseSkillPlatforms(options.platform)
    else if (process.stdin.isTTY && !options.json) platforms = await choosePlatforms(activeLocale)
    else throw new Error(t(activeLocale, 'platformWriteRequired'))

    const results: CliPlatformLinkResult[] = []
    for (const platform of platforms) {
      const execution = await executePlatformLinkAction(platform, 'suspend', options)
      if (execution.cancelled) return
      if (execution.result) results.push(execution.result)
    }
    if (options.json) console.log(JSON.stringify({ results }, null, 2))
    else render(<PlatformLinkResultsView results={results} locale={activeLocale} title={t(activeLocale, 'unlinkResult')} />)
  })

skills.command('status').description(t(activeLocale, 'statusDescription')).option('--json', t(activeLocale, 'jsonDescription')).action(async ({ json }: { json?: boolean }) => {
  const platforms = (await settingsStore.read()).skills.platforms
  const report = await skillsManager.scan(platforms)
  const issues = scanIssues(report)
  const bootstrap = await skillsManager.bootstrap()
  const payload = { status: issues.length ? 'warning' : 'ok', issues, report, bootstrap }
  if (json) console.log(JSON.stringify(payload, null, 2))
  else render(<StatusView status={issues.length ? 'warning' : 'ok'} issues={issues} fingerprint={report.fingerprint} locale={activeLocale} />)
})

const history = skills.command('history').description(t(activeLocale, 'historyDescription'))
history.command('list').option('--json', t(activeLocale, 'jsonDescription')).action(async ({ json }: { json?: boolean }) => {
  const receipts = await skillsManager.history()
  if (json) console.log(JSON.stringify(receipts, null, 2))
  else render(<SkillsHistoryView receipts={receipts} locale={activeLocale} />)
})

skills
  .command('rollback')
  .argument('<receipt-id>', t(activeLocale, 'receiptArgument'))
  .description(t(activeLocale, 'rollbackDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .option('-y, --yes', t(activeLocale, 'yesDescription'))
  .action(async (receiptId: string, options: SkillsWriteOptions) => {
    const plan = await skillsManager.planRollbackReceipt(receiptId)
    if (!options.json) render(<NoticeView title={t(activeLocale, 'rollbackPlan')} message={`${plan.receiptId}  ${t(activeLocale, 'planHash')} ${plan.hash}`} />)
    if (!await authorizeWrite(options, plan)) return
    const result: RollbackResult = await skillsManager.applyRollbackReceipt(plan, consentFor(plan))
    if (options.json) console.log(JSON.stringify(result, null, 2))
    else render(<NoticeView title={t(activeLocale, 'rollbackResult')} message={result.rolledBack ? `${t(activeLocale, 'restored')}: ${result.restoredPaths.join(', ') || '-'}` : `${t(activeLocale, 'rollbackRejected')}: ${result.warnings.join('; ')}`} />)
  })

skills
  .command('stats')
  .description(t(activeLocale, 'statsDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .action(async ({ json }: { json?: boolean }) => {
    const report = await skillsManager.stats()
    if (json) console.log(JSON.stringify(report, null, 2))
    else render(<SkillStatsView report={report} locale={activeLocale} />)
  })

const usage = skills.command('usage').description(t(activeLocale, 'usageDescription'))
usage
  .command('record')
  .argument('<name-or-id>')
  .description(t(activeLocale, 'usageRecordDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .option('-y, --yes', t(activeLocale, 'yesDescription'))
  .action(async (nameOrId: string, options: SkillsWriteOptions) => {
    const plan = await skillsManager.planUsage(nameOrId)
    if (!options.json) render(<SkillUsagePlanView plan={plan} locale={activeLocale} />)
    if (!await authorizeWrite(options, plan)) return
    const receipt = await skillsManager.applyUsage(plan, consentFor(plan))
    if (options.json) console.log(JSON.stringify(receipt, null, 2))
    else render(<SkillUsageReceiptView receipt={receipt} locale={activeLocale} />)
  })

const manager = skills.command('manager').description(t(activeLocale, 'managerDescription'))
manager
  .command('repair')
  .description(t(activeLocale, 'managerRepairDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .option('-y, --yes', t(activeLocale, 'yesDescription'))
  .action(async (options: SkillsWriteOptions) => {
    const plan = await skillsManager.planSystemSkillRepair()
    if (!options.json) render(<SystemSkillRepairPlanView plan={plan} locale={activeLocale} />)
    if (!await authorizeWrite(options, plan)) return
    const receipt = await skillsManager.applySystemSkillRepair(plan, consentFor(plan))
    if (options.json) console.log(JSON.stringify(receipt, null, 2))
    else render(<SystemSkillRepairReceiptView receipt={receipt} locale={activeLocale} />)
  })

const backups = skills.command('backups').description(t(activeLocale, 'manageBackups'))
backups.command('list').description(t(activeLocale, 'backupListDescription')).option('--json', t(activeLocale, 'jsonDescription')).action(async ({ json }: { json?: boolean }) => {
  const values = await skillsManager.canonicalBackups()
  if (json) console.log(JSON.stringify(values, null, 2))
  else render(<CanonicalBackupsView backups={values} locale={activeLocale} />)
})

/** 注册统一源备份恢复或删除命令。 */
function registerCanonicalBackupMutation(commandName: 'restore' | 'remove', action: 'restore' | 'delete-backup'): void {
  const restoring = commandName === 'restore'
  backups
    .command(commandName)
    .argument('<backup-version>', t(activeLocale, 'backupVersionArgument'))
    .description(t(activeLocale, restoring ? 'backupRestoreDescription' : 'backupRemoveDescription'))
    .option('--json', t(activeLocale, 'jsonDescription'))
    .option('-y, --yes', t(activeLocale, 'yesDescription'))
    .action(async (backupVersion: string, options: SkillsWriteOptions) => {
      const plan = await skillsManager.planCanonicalSource(action, backupVersion)
      if (!options.json) render(<CanonicalPlanView plan={plan} locale={activeLocale} title={t(activeLocale, restoring ? 'backupRestorePlan' : 'backupRemovePlan')} />)
      if (!await authorizeWrite(options, plan)) return
      const receipt: CanonicalSourceMutationReceipt = await skillsManager.applyCanonicalSource(plan, consentFor(plan))
      if (options.json) console.log(JSON.stringify(receipt, null, 2))
      else render(<NoticeView title={t(activeLocale, restoring ? 'backupRestoreResult' : 'backupRemoveResult')} message={receipt.restoredBackupVersion ?? receipt.deletedBackupVersion ?? receipt.createdBackup?.version ?? receipt.status} />)
    })
}

registerCanonicalBackupMutation('restore', 'restore')
registerCanonicalBackupMutation('remove', 'delete-backup')

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

/**
 * 解析 UI 端口参数。
 * @param port 命令行传入的端口文本。
 * @returns 可用端口；未传入时返回 undefined。
 */
function parseUiPort(port?: string): number | undefined {
  const parsedPort = port === undefined ? undefined : Number.parseInt(port, 10)
  if (port !== undefined && (!Number.isInteger(parsedPort) || parsedPort! < 1 || parsedPort! > 65535)) throw new Error(`${t(activeLocale, 'invalidPort')}: ${port}`)
  return parsedPort
}

const ui = program
  .command('ui')
  .description(t(activeLocale, 'uiDescription'))
  .option('-p, --port <port>', t(activeLocale, 'portDescription'))

ui
  .action(async ({ port }: { port?: string }) => {
    const activeSession = await readUiSession()
    if (activeSession) throw new Error(`${t(activeLocale, 'uiAlreadyRunning')}: http://127.0.0.1:${activeSession.port}`)
    const parsedPort = parseUiPort(port)
    const server = await startUi(parsedPort === undefined ? {} : { port: parsedPort })
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
  .command('start')
  .description(t(activeLocale, 'uiStartDescription'))
  .option('-p, --port <port>', t(activeLocale, 'portDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .action(async ({ port, json }: { port?: string; json?: boolean }) => {
    const activeSession = await readUiSession()
    if (activeSession) {
      const result = { running: true, pid: activeSession.pid, port: activeSession.port, url: `http://127.0.0.1:${activeSession.port}` }
      console.log(json ? JSON.stringify(result, null, 2) : `${t(activeLocale, 'uiAlreadyRunning')}: ${result.url}`)
      return
    }
    const parsedPort = parseUiPort(port)
    const server = await startUi({ ...(parsedPort === undefined ? {} : { port: parsedPort }), detached: true })
    const session = await readUiSession()
    const result = { running: true, pid: session?.pid, port: session?.port, url: server.url }
    console.log(json ? JSON.stringify(result, null, 2) : `${t(activeLocale, 'uiStarted')}: ${server.url}`)
  })

ui
  .command('stop')
  .description(t(activeLocale, 'uiStopDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .action(async ({ json }: { json?: boolean }) => {
    const stopped = await stopUi()
    console.log(json ? JSON.stringify({ stopped }, null, 2) : t(activeLocale, stopped ? 'uiStopped' : 'uiNotRunning'))
  })

ui
  .command('status')
  .description(t(activeLocale, 'uiStatusDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .action(async ({ json }: { json?: boolean }) => {
    const session = await readUiSession()
    const result = session
      ? { running: true, pid: session.pid, port: session.port, url: `http://127.0.0.1:${session.port}`, createdAt: session.createdAt }
      : { running: false }
    console.log(json ? JSON.stringify(result, null, 2) : session ? `${t(activeLocale, 'uiRunning')}: ${result.url}` : t(activeLocale, 'uiNotRunning'))
  })

ui
  .command('restart')
  .description(t(activeLocale, 'uiRestartDescription'))
  .option('-p, --port <port>', t(activeLocale, 'portDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .action(async ({ port, json }: { port?: string; json?: boolean }) => {
    await stopUi()
    const parsedPort = parseUiPort(port)
    const server = await startUi({ ...(parsedPort === undefined ? {} : { port: parsedPort }), detached: true })
    const session = await readUiSession()
    const result = { running: true, pid: session?.pid, port: session?.port, url: server.url }
    console.log(json ? JSON.stringify(result, null, 2) : `${t(activeLocale, 'uiStarted')}: ${server.url}`)
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

/** @returns 当前全局 npm 安装对应的 prefix；源码构建运行时返回 null。 */
function resolveGlobalInstallPrefix(): string | null {
  const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const nodeModulesDirectory = dirname(packageDirectory)
  if (basename(nodeModulesDirectory) !== 'node_modules') return null
  const parentDirectory = dirname(nodeModulesDirectory)
  return basename(parentDirectory) === 'lib' ? dirname(parentDirectory) : parentDirectory
}

program
  .command('uninstall')
  .description(t(activeLocale, 'uninstallDescription'))
  .action(async () => {
    const prefix = resolveGlobalInstallPrefix()
    if (!prefix) throw new Error(t(activeLocale, 'uninstallSourceOnly'))
    await stopUi()
    const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawn(npmExecutable, ['uninstall', '--global', '--prefix', prefix, 'askagent-x'], {
      stdio: 'inherit',
      windowsHide: true,
    })
    const [code] = await once(child, 'exit')
    if (code !== 0) throw new Error(`${t(activeLocale, 'uninstallFailed')} (${code ?? 1})`)
  })

await program.parseAsync()
