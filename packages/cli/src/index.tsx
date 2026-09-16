#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { basename, dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  defaultContext,
  SettingsStore,
  type AskXLocale,
  type DetectionIssue,
  type RollbackResult,
  type UserConsent,
} from '@askx/core'
import { SkillsManager } from '@askx/module-skills'
import type { SkillDirectoryAccessError } from '@askx/module-skills/scanner'
import type {
  CanonicalSkillsBackup,
  CanonicalLinkBackupItem,
  CanonicalSourceMutationPlan,
  CanonicalSourceMutationReceipt,
  ClearModule,
} from '@askx/module-skills/canonical-source-manager'
import type {
  CustomLinkPlan,
  CustomLinkReceipt,
  PlatformLinkAction,
  PlatformLinkPlan,
  PlatformLinkReceipt,
  SkillDecision,
  SkillPlatformId,
  SkillPlatformStatus,
  SkillsBatchPlan,
  SkillsBatchReceipt,
  SkillsBootstrap,
  SkillsScanReport,
  SkillsConfigurationStrategy,
} from '@askx/module-skills/skill-types'
import type { LocalSkillMigrationPlan } from '@askx/module-skills/local-skill-manager'
import type { SystemSkillRepairPlan, SystemSkillRepairReceipt } from '@askx/module-skills/builtin-skill-manager'
import type { SkillStatsReport, SkillUsagePlan, SkillUsageReceipt } from '@askx/module-skills/skill-manager-registry'
import { detectPlatforms, type PlatformDetection } from '@askx/platform-adapters'
import { readUiSession, startUi, stopUi } from '@askx/web/server'
import { resolveUiTokenServicePreference } from './ui-token-mode.js'
import { Command } from 'commander'
import { Box, render as inkRender, Text, useInput } from 'ink'
import { useState, type ReactNode } from 'react'
import { createKeepDecisions, createSafeSyncDecisions, createSelectedSyncDecisions, platformLinkResultMessage, summarizeSkillsBatchPlan } from './skills-command-helpers.js'
import { resolveConfirmationInput } from './confirmation-key.js'
import { resolveSkillsScanInvocationMode } from './skills-scan-mode.js'
import { createUninstallInvocation, packageManagerFromInstallPath, readInstallRecord } from './install-manager.js'
import { terminalLink, terminalUrl } from './terminal-link.js'

const accent = '#d7ff3f'
const settingsStore = new SettingsStore(defaultContext().dataDir)
const skillsManager = new SkillsManager(defaultContext())
let activeLocale: AskXLocale

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

/** 首次启动时的语言选择界面。 */
function InitialLanguagePrompt({ onComplete }: { onComplete: (locale: AskXLocale | null) => void }) {
  const options: Array<{ id: AskXLocale; label: string }> = [
    { id: 'zh-CN', label: '简体中文' },
    { id: 'en', label: 'English' },
  ]
  const [cursor, setCursor] = useState(0)
  useInput((input, key) => {
    if (input.toLocaleLowerCase() === 'q' || key.escape) return onComplete(null)
    if (key.upArrow) setCursor((current) => (current + options.length - 1) % options.length)
    if (key.downArrow) setCursor((current) => (current + 1) % options.length)
    if (key.return) onComplete(options[cursor]!.id)
  })
  return (
    <Frame title="LANGUAGE / 语言">
      <Text dimColor>请选择语言 / Choose your language · Enter 确认 / Confirm · Esc/Q 取消 / Cancel</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((option, index) => (
          <Text key={option.id} {...(index === cursor ? { color: accent, bold: true } : {})}>
            {index === cursor ? '›' : ' '} {option.label}
          </Text>
        ))}
      </Box>
    </Frame>
  )
}

/** @returns 用户首次明确选择的界面语言，取消时返回 null。 */
function chooseInitialLanguage(): Promise<AskXLocale | null> {
  return new Promise((resolve) => render(<InitialLanguagePrompt onComplete={resolve} />))
}

/** 读取现有语言；首次交互运行时先要求用户选择并保存。 */
async function resolveActiveLocale(): Promise<AskXLocale | null> {
  const settings = await settingsStore.read()
  if (settings.cliLocale) return settings.cliLocale
  if (!process.stdin.isTTY || process.argv.includes('--json')) return 'zh-CN'
  const selected = await chooseInitialLanguage()
  if (!selected) return null
  await settingsStore.update({ cliLocale: selected }, { source: 'cli', expectedRevision: settings.revision })
  activeInkInstance?.unmount()
  activeInkInstance = undefined
  return selected
}

activeLocale = await resolveActiveLocale() ?? process.exit(0)

const messages = {
  en: {
    builtInModules: 'built-in modules', doctor: 'doctor', skillsScan: 'skills scan', skillsStatus: 'skills status',
    status: 'Status', ready: 'ready', blocked: 'blocked', notFound: 'not found', ok: 'ok', warning: 'warning',
    noIssues: 'No topology issues detected.', skills: 'Skills', skillsTitle: 'Skills', conflicts: 'conflicts', brokenLinks: 'broken links', fingerprint: 'Fingerprint',
    localUi: 'local ui', serverReady: 'Nuxt server ready', stop: 'Press Ctrl+C to stop.',
    settings: 'settings', settingsUpdated: 'settings updated', revision: 'REVISION', source: 'SOURCE', platforms: 'Platforms', noPlatforms: 'not selected', backup: 'Backup', language: 'Language', themeColor: 'Theme', updated: 'Updated',
    writeLocked: 'Write operations are intentionally locked in the foundation release.',
    appDescription: 'Extend every agent. Keep control.', modulesDescription: 'Inspect built-in AskAgent X modules',
    doctorDescription: 'Detect Agent installations and whole Skills-directory proxy eligibility', jsonDescription: 'Print machine-readable JSON',
    skillsDescription: 'View the current Skill list and quickly connect Agent platforms', scanDescription: 'Scan selected platform folders and list Skills that need review', statusDescription: 'Check current Skill folders for conflicts and broken links',
    settingsDescription: 'Read or update shared CLI/Web settings', settingsShowDescription: 'Show the current shared settings', settingsSetDescription: 'Update shared settings', settingsResetDescription: 'Restore all shared settings to defaults without deleting Skills or backups', settingsResetPlan: 'Settings reset plan', settingsResetResult: 'All shared settings restored to defaults',
    backupArgument: 'on or off', backupDescription: 'Enable or disable whole-directory backup before root cutover', backupError: 'Backup must be "on" or "off"',
    platformsArgument: 'codex, claude and/or cursor', platformsDescription: 'Set enabled Agent platforms', platformsError: 'Platforms must contain codex, claude and/or cursor',
    languageArgument: 'zh-CN or en', languageDescription: 'Set the shared CLI/Web language', languageError: 'Language must be "zh-CN" or "en"',
    themeArgument: 'cyan or rose', themeDescription: 'Set the shared CLI/Web theme color', themeError: 'Theme color must be "cyan" or "rose"',
    uiDescription: 'Start or manage the local Nuxt management interface', portDescription: 'Production UI port; reuses the last successful port by default', invalidPort: 'Invalid port', tokenDescription: 'Print a quick-login URL and the active local UI token', tokenUrl: 'Quick login URL', tokenValue: 'Token', noToken: 'No active UI session. Run "askx ui start" first.', uiStartDescription: 'Start the local UI as a background service', uiStopDescription: 'Stop the background UI service', uiStatusDescription: 'Show background UI service status', uiRestartDescription: 'Restart the background UI service on the same port', uiAlreadyRunning: 'The local UI is already running', uiStarted: 'The local UI started in the background', uiStopped: 'The local UI service stopped', uiNotRunning: 'The local UI is not running', uiRunning: 'The local UI is running', uninstallDescription: 'Stop the local UI and uninstall AskAgent X with its package manager', uninstallSourceOnly: 'Cannot identify the global package manager. Stop the UI, then uninstall AskAgent X with the package manager used for installation.', uninstallFailed: 'Package manager uninstall failed',
    manageBackups: 'Manage canonical Skills source backups', clearDescription: 'Clear all managed data, or only symlink settings or Skill data', clearLinksDescription: 'Clear managed symlink settings only', clearSkillsDescription: 'Clear managed Skill data only', clearPlan: 'Clear plan', clearScope: 'Clear scope', clearModuleLinks: 'symlink settings', clearModuleSkills: 'Skill data', clearResult: 'Clear completed', clearConfiguration: 'Configure clear operation', clearConfigurationHint: 'Space toggles · Enter continues · Esc/Q cancels', clearBackupOption: 'Create a backup before clearing', clearSelectionRequired: 'Select symlink settings or Skill data.', backupNameDescription: 'Set the backup name and enable backup', noBackupDescription: 'Clear without creating a durable backup', backupOptionConflict: '--backup-name cannot be used with --no-backup.', backupNamePrompt: 'Backup name', backupName: 'Backup name', cleared: 'cleared', notCleared: 'not cleared', notBackedUp: 'not backed up', linkBindings: 'Symlink settings', noData: 'No data', backedUp: 'backed up', skillBackup: 'SKILL', backupCount: 'Backed up {success}, failed {failed}', backupIdentifier: 'Backup identifier', backupPath: 'Backup path', historyDescription: 'List completed Skills transactions', rollbackDescription: 'Roll back the latest unchanged Skills transaction', backupListDescription: 'List canonical source backups', backupRestoreDescription: 'Restore the canonical source from a backup', backupRemoveDescription: 'Permanently remove a canonical source backup', receiptArgument: 'transaction receipt ID', backupVersionArgument: 'backup version', historyTitle: 'Skills transaction history', rollbackPlan: 'Skills rollback plan', rollbackResult: 'Skills rollback result', backupRestorePlan: 'Backup restore plan', backupRestoreResult: 'Backup restored', backupRemovePlan: 'Backup removal plan', backupRemoveResult: 'Backup removed', noTransactions: 'No completed Skills transactions.', noBackups: 'No canonical source backups.', restored: 'restored', rollbackRejected: 'rollback rejected', valid: 'valid', invalid: 'invalid',
    choosePlatforms: 'Choose platforms containing Skills', chooseLinkPlatforms: 'Choose platforms to connect with directory links', chooseSkills: 'Choose Skills to import', chooseSkillsHint: 'Space selects · L toggles Shared/Local · Enter continues · Esc/Q cancels', sharedScope: 'Shared', localScope: 'Local', scanOnlySelected: 'Space toggles · Enter confirms · Esc/Q cancels', linkOnlySelected: 'Selected platforms will use the AskX Skill list · Space toggles · Enter continues · Esc/Q cancels', platformRequired: 'Select at least one platform.', sourceRequired: 'Select a platform or enter at least one custom folder.', platformSelectionRequired: 'First scan requires --platform in non-interactive mode.', platformActionBind: 'connect', platformActionResume: 'restore connection', platformActionSkip: 'already connected; no action this time', alreadyLinkedNoAction: 'already connected; no action this time', customScanPrompt: 'Custom scan folder (leave empty to start scanning, Ctrl+C cancels): ', customLinkPrompt: 'Add another custom link folder (leave empty to review defaults, Ctrl+C cancels): ', customLinkDirectorySelection: 'Keep linked folders by number (Enter keeps all defaults; 0 selects none):', customDirectoryLimit: 'Custom scan folders are limited to 3. Enter up to 3 numbers to keep (comma-separated):', customDirectorySelectionInvalid: 'Select up to 3 valid, non-duplicate numbers.', unsafeSkill: 'conflict · resolve in the next step', conflictResolution: 'Resolve Skill conflicts', conflictProgress: 'Conflict {current}/{total}', conflictActionHint: 'Choose an action · Enter continues · Esc/Q cancels the entire command', conflictKeep: 'Keep unchanged (recommended)', conflictReplace: 'Choose one source as the canonical version', conflictRename: 'Import one source with a new name', conflictChooseSource: 'Choose source', conflictSourceHint: 'Enter selects · B goes back · Esc/Q cancels the entire command', conflictRenamePrompt: 'New Skill name (lowercase letters, numbers and hyphens)', conflictRenameInvalid: 'Use lowercase letters, numbers and single hyphens; the name must not already exist.', conflictSummary: 'Conflict decisions', conflictDecisionKeep: 'keep unchanged', conflictDecisionReplace: 'use {source} as canonical version', conflictDecisionRename: 'import {source} as {name}',
    skillConflict: 'Skill {name} has conflicting content.', skillBroken: 'Skill {name} has a broken link.', skillInvalid: 'Skill {name} has invalid metadata.',
    linkDescription: 'Bind or resume selected Agent Skills directories to the canonical source', unlinkDescription: 'Suspend selected managed Skills-directory links without synchronizing content',
    directoryDescription: 'Add a custom directory as a read-only synchronization source', linkDirectoryDescription: 'Bind a custom local directory to the canonical source', yesDescription: 'Confirm the displayed immutable plan without an interactive prompt',
    scanPlan: 'Skills scan plan', linkPlan: 'Connect symlink', unlinkPlan: 'Remove symlink configuration', linkResult: 'Connect symlink', unlinkResult: 'Remove symlink configuration', linkConfirm: 'Connect this symlink?', externalTakeoverConfirm: 'Take over this external symlink?', externalLinkPreserved: 'external symlink detected; existing configuration preserved', linkApplied: 'connected', unlinkConfirm: 'Remove this symlink configuration?', unlinkApplied: 'symlink configuration removed', unlinkNoData: 'no connection data; no action this time',
    planHash: 'Plan hash', adopt: 'adopt', merge: 'merge', keep: 'keep', customDirectories: 'custom directories', operations: 'operations', applied: 'applied', skipped: 'skipped', failed: 'failed',
    confirmApply: 'Apply this exact plan?', confirmKeys: 'Enter confirms · Esc/Q cancels', cancelled: 'Operation cancelled.', confirmationRequired: 'A write plan requires confirmation. Re-run with --yes in non-interactive or JSON mode.', macPrivacyTitle: 'macOS folder access', macPrivacyDenied: 'macOS blocked access to: {path}', macPrivacyInstructions: 'System Settings has been opened. Allow the current terminal app to access protected folders.', macPrivacyStillDenied: 'Access is still blocked. Fully quit and reopen the terminal to activate the permission, or move the Skills folder to an unprotected location such as ~/Skills.', macPrivacyLocalRetry: 'If this terminal can enter the parent folder, press Esc/Q and retry from there:', macPrivacyRetry: 'After granting access, return here and press Enter to retry this command · Esc/Q cancels',
    skillsNotInitialized: 'Skills management is not initialized. Run "askx skills scan" first.', platformWriteRequired: 'Select at least one platform for this link operation.', conflictKept: 'Conflicting Skills are kept unchanged and are not overwritten automatically.', platformPreferenceSyncFailed: 'Skills and symlinks were saved, but the platform preference could not be updated. The imported result is unaffected.',
    linkTarget: 'link target', statsDescription: 'View Skill versions, usage counts and connected targets', usageDescription: 'Record explicit local Skill usage', usageRecordDescription: 'Record one use by Skill name or stable ID', managerDescription: 'Manage the built-in AskX Skill Manager', managerRepairDescription: 'Repair a missing, corrupt or outdated built-in Skill Manager', statsTitle: 'Skill statistics', skillListTitle: 'Current Skill list', canonicalFolder: 'Skill folder', connectedPlatforms: 'Connected platforms', noManagedSkills: 'No managed Skills yet. Run askx skills to start setup.', statsHint: 'View statistics', manageHint: 'Scan or update the list', totalUsage: 'usage', totalTargets: 'targets', issueTargets: 'target issues', usagePlan: 'Usage record plan', usageResult: 'Usage recorded', managerRepairPlan: 'Skill Manager repair plan', managerRepairResult: 'Skill Manager repaired', skillName: 'Skill', version: 'Version', systemHealth: 'Previous health', preserveRegistry: 'Preserve registry', registryRevision: 'Registry revision', usageCount: 'Usage count', management: 'version management', repairWarnings: 'Warnings', scopeDescription: 'Move an existing Skill between Shared and Local scope', scopeLocalDescription: 'Move the Skill to Local scope', scopeSharedDescription: 'Move the Skill to Shared scope', scopeRequired: 'Choose exactly one of --local or --shared.', scopePlan: 'Skill scope migration plan', scopeResult: 'Skill scope updated',
  },
  'zh-CN': {
    builtInModules: '内置模块', doctor: '环境诊断', skillsScan: 'Skills 扫描', skillsStatus: 'Skills 状态',
    status: '状态', ready: '就绪', blocked: '受阻', notFound: '未发现', ok: '正常', warning: '警告',
    noIssues: '未检测到拓扑问题。', skills: '个 Skills', skillsTitle: 'Skills', conflicts: '个冲突', brokenLinks: '个失效链接', fingerprint: '指纹',
    localUi: '本地界面', serverReady: 'Nuxt 服务已就绪', stop: '按 Ctrl+C 停止。',
    settings: '共享设置', settingsUpdated: '设置已更新', revision: '版本', source: '来源', platforms: '平台', noPlatforms: '未选择', backup: '备份', language: '语言', themeColor: '主题色', updated: '更新时间',
    writeLocked: '基础版本暂未开放写入操作。',
    appDescription: '扩展每一个 Agent，控制始终在你手中。', modulesDescription: '查看 AskAgent X 内置模块',
    doctorDescription: '检测 Agent 安装状态与整个 Skills 目录的代理条件', jsonDescription: '输出机器可读的 JSON',
    skillsDescription: '查看当前 Skill 列表，并快速关联 Agent 平台', scanDescription: '扫描选中平台的文件夹，列出需要处理的 Skill', statusDescription: '检查当前 Skill 目录中的冲突和失效软链',
    settingsDescription: '读取或更新 CLI/Web 共享设置', settingsShowDescription: '显示当前共享设置', settingsSetDescription: '更新共享设置', settingsResetDescription: '恢复全部共享设置默认值，不删除 Skills 或备份', settingsResetPlan: '共享设置重置计划', settingsResetResult: '全部共享设置已恢复默认值',
    backupArgument: 'on 或 off', backupDescription: '启用或关闭根目录切换前的整目录备份', backupError: '备份参数必须是 "on" 或 "off"',
    platformsArgument: 'codex、claude 和/或 cursor', platformsDescription: '设置启用的 Agent 平台', platformsError: '平台必须包含 codex、claude 和/或 cursor',
    languageArgument: 'zh-CN 或 en', languageDescription: '设置 CLI/Web 共享语言', languageError: '语言必须是 "zh-CN" 或 "en"',
    themeArgument: 'cyan 或 rose', themeDescription: '设置 CLI/Web 共享主题色', themeError: '主题色必须是 "cyan" 或 "rose"',
    uiDescription: '启动或管理本地 Nuxt 管理界面', portDescription: '生产 UI 端口，默认复用上次成功启动的端口', invalidPort: '无效端口', tokenDescription: '输出本地 UI 快速登录地址和 token', tokenUrl: '快速登录地址', tokenValue: 'Token', noToken: '没有活动的 UI 会话，请先运行 "askx ui start"。', uiStartDescription: '以后台服务方式启动本地 UI', uiStopDescription: '停止后台 UI 服务', uiStatusDescription: '查看后台 UI 服务状态', uiRestartDescription: '使用同一端口重启后台 UI 服务', uiAlreadyRunning: '本地 UI 已在运行', uiStarted: '本地 UI 已在后台启动', uiStopped: '本地 UI 服务已停止', uiNotRunning: '本地 UI 未运行', uiRunning: '本地 UI 正在运行', uninstallDescription: '停止本地 UI，并使用原包管理器全局卸载 AskAgent X', uninstallSourceOnly: '无法识别全局安装使用的包管理器，请先停止 UI，再使用安装时的包管理器卸载 AskAgent X', uninstallFailed: '包管理器卸载失败',
    manageBackups: '管理统一 Skills 来源备份', clearDescription: '清空全部受管数据，或仅清空软链配置、Skill 数据', clearLinksDescription: '仅清空受管软链配置', clearSkillsDescription: '仅清空受管 Skill 数据', clearPlan: '一键清空计划', clearScope: '清空范围', clearModuleLinks: '软链配置', clearModuleSkills: 'Skill 数据', clearResult: '一键清空完成', clearConfiguration: '设置清空内容', clearConfigurationHint: '空格切换 · 回车进入下一步 · Esc/Q 放弃', clearBackupOption: '清空前创建备份', clearSelectionRequired: '至少选择软链配置或 Skill 数据。', backupNameDescription: '指定备份名称并启用备份', noBackupDescription: '不创建长期备份，直接清空', backupOptionConflict: '--backup-name 不能与 --no-backup 同时使用。', backupNamePrompt: '备份名称', backupName: '备份名称', cleared: '已清空', notCleared: '未清空', notBackedUp: '未备份', linkBindings: '软链设置', noData: '无数据', backedUp: '已备份', skillBackup: 'SKILL', backupCount: '已备份 {success} 个，失败 {failed} 个', backupIdentifier: '备份标识', backupPath: '备份路径', historyDescription: '列出已完成的 Skills 事务', rollbackDescription: '回滚最新且状态未变化的 Skills 事务', backupListDescription: '列出统一源备份', backupRestoreDescription: '从指定备份恢复统一源', backupRemoveDescription: '永久删除指定统一源备份', receiptArgument: '事务回执 ID', backupVersionArgument: '备份版本', historyTitle: 'Skills 事务历史', rollbackPlan: 'Skills 回滚计划', rollbackResult: 'Skills 回滚结果', backupRestorePlan: '备份恢复计划', backupRestoreResult: '备份恢复完成', backupRemovePlan: '备份删除计划', backupRemoveResult: '备份删除完成', noTransactions: '没有已完成的 Skills 事务。', noBackups: '没有统一源备份。', restored: '已恢复', rollbackRejected: '拒绝回滚', valid: '有效', invalid: '无效',
    choosePlatforms: '选择存放 Skill 的平台', chooseLinkPlatforms: '选择需要设置目录软链的平台', chooseSkills: '选择需要导入的 Skills', chooseSkillsHint: '空格选择 · L 切换共享/本地 · 回车继续 · Esc/Q 放弃', sharedScope: '共享', localScope: '本地', scanOnlySelected: '空格切换 · 回车确认 · Esc/Q 放弃', linkOnlySelected: '选中平台将使用 AskX Skill 列表 · 空格切换 · 回车进入下一步 · Esc/Q 放弃', platformRequired: '至少选择一个平台。', sourceRequired: '请选择平台，或至少输入一个自定义文件夹。', platformSelectionRequired: '非交互模式首次扫描必须传入 --platform。', platformActionBind: '新建关联', platformActionResume: '恢复关联', platformActionSkip: '已存在关联，本次不处理', alreadyLinkedNoAction: '已存在关联，本次不处理', customScanPrompt: '输入需要扫描的自定义文件夹（直接回车开始扫描，Ctrl+C 放弃）：', customLinkPrompt: '添加其他软链文件夹（直接回车查看第一步默认项，Ctrl+C 放弃）：', customLinkDirectorySelection: '输入要保留软链的文件夹编号（回车保留全部默认项，输入 0 全不选）：', customDirectoryLimit: '自定义扫描文件夹最多保留 3 个，请输入要保留的编号（最多 3 个，逗号分隔）：', customDirectorySelectionInvalid: '请输入最多 3 个有效且不重复的编号。', unsafeSkill: '存在冲突 · 下一步处理', conflictResolution: '解决 Skill 冲突', conflictProgress: '冲突 {current}/{total}', conflictActionHint: '选择处理方式 · 回车继续 · Esc/Q 放弃整次命令', conflictKeep: '保持现状，本次跳过（推荐）', conflictReplace: '选择一个来源作为统一版本', conflictRename: '选择一个来源并以新名称导入', conflictChooseSource: '选择来源', conflictSourceHint: '回车选择 · B 返回 · Esc/Q 放弃整次命令', conflictRenamePrompt: '输入新的 Skill 名称（小写字母、数字和连字符）', conflictRenameInvalid: '名称只能包含小写字母、数字和单个连字符，并且不能与已有 Skill 重名。', conflictSummary: '冲突处理结果', conflictDecisionKeep: '保持现状', conflictDecisionReplace: '使用 {source} 作为统一版本', conflictDecisionRename: '将 {source} 导入为 {name}',
    skillConflict: 'Skill {name} 在不同平台的内容不一致。', skillBroken: 'Skill {name} 包含失效软链。', skillInvalid: 'Skill {name} 的元数据无效。',
    linkDescription: '将选中的 Agent Skills 根目录绑定或恢复到统一源', unlinkDescription: '无损停用选中的受管 Skills 根目录软链，不同步内容',
    directoryDescription: '添加一个只读同步来源的自定义目录', linkDirectoryDescription: '将一个自定义本地目录绑定到统一源', yesDescription: '无需交互确认，直接授权已展示的不可变计划',
    scanPlan: 'Skills 扫描计划', linkPlan: '关联软链', unlinkPlan: '取消软链配置', linkResult: '关联软链', unlinkResult: '取消软链配置', linkConfirm: '确定要关联吗？', externalTakeoverConfirm: '确定要接管这个外部软链吗？', externalLinkPreserved: '检测到外部软链，已保留现有配置', linkApplied: '已关联', unlinkConfirm: '确定要取消吗？', unlinkApplied: '已取消软链设置', unlinkNoData: '不存在关联数据，本次不处理',
    planHash: '计划指纹', adopt: '接管', merge: '合并', keep: '保留', customDirectories: '自定义目录', operations: '操作', applied: '已应用', skipped: '已跳过', failed: '失败',
    confirmApply: '确认执行这份完整计划？', confirmKeys: '回车确认 · Esc/Q 放弃', cancelled: '操作已取消。', confirmationRequired: '写操作必须明确授权；非交互或 JSON 模式请重新执行并传入 --yes。', macPrivacyTitle: 'macOS 文件夹授权', macPrivacyDenied: 'macOS 阻止了当前终端访问：{path}', macPrivacyInstructions: '已打开系统设置，请为当前使用的终端应用开启受保护文件夹访问权限。', macPrivacyStillDenied: '授权后仍被阻止。请完全退出并重新打开终端使权限生效，或者将 Skills 文件夹移动到 ~/Skills 等非受保护目录。', macPrivacyLocalRetry: '如果当前终端可以进入上级目录，也可以按 Esc/Q 放弃后从该目录重新执行：', macPrivacyRetry: '授权完成后返回终端，按回车重试本次命令 · Esc/Q 放弃',
    skillsNotInitialized: 'Skills 管理尚未初始化，请先运行 "askx skills scan"。', platformWriteRequired: '软链操作至少需要选择一个平台。', conflictKept: '内容冲突的 Skills 会保留现状，不会自动覆盖。', platformPreferenceSyncFailed: 'Skill 与软链已保存，但平台偏好更新失败；本次导入结果不受影响。',
    linkTarget: '软链目标', statsDescription: '查看 Skill 版本、使用次数和已关联目标', usageDescription: '记录明确的本地 Skill 使用', usageRecordDescription: '按 Skill 名称或稳定 ID 记录一次使用', managerDescription: '管理 AskX 内置 Skill Manager', managerRepairDescription: '修复缺失、损坏或过期的内置 Skill Manager', statsTitle: 'Skill 统计', skillListTitle: '当前 Skill 列表', canonicalFolder: 'Skill 文件夹', connectedPlatforms: '已关联平台', noManagedSkills: '当前还没有 Skill，请运行 askx skills 开始设置。', statsHint: '查看统计', manageHint: '重新扫描或更新列表', totalUsage: '累计使用', totalTargets: '同步目标', issueTargets: '异常目标', usagePlan: 'Usage 记录计划', usageResult: 'Usage 已记录', managerRepairPlan: 'Skill Manager 修复计划', managerRepairResult: 'Skill Manager 已修复', skillName: 'Skill', version: '版本', systemHealth: '修复前状态', preserveRegistry: '保留 Registry', registryRevision: 'Registry 版本', usageCount: '累计次数', management: '版本管理', repairWarnings: '提示', scopeDescription: '在共享和本地范围之间迁移已有 Skill', scopeLocalDescription: '将 Skill 迁移为本地 Skill', scopeSharedDescription: '将 Skill 迁移为共享 Skill', scopeRequired: '必须且只能选择 --local 或 --shared。', scopePlan: 'Skill 范围迁移计划', scopeResult: 'Skill 范围已更新',
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

/** 显示高对比度多选标记，避免与当前行光标混淆。 */
function CheckboxMark({ checked }: { checked: boolean }) {
  return checked
    ? <Text backgroundColor={accent} color="black" bold> ✓ </Text>
    : <Text dimColor> □ </Text>
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
  onComplete: (platforms: SkillPlatformId[] | null) => void
  /** 当前选择用于扫描来源还是建立软链。 */
  mode?: 'scan' | 'link'
  /** 是否允许不选择任何平台继续。 */
  allowEmpty?: boolean
  /** 界面初次打开时默认勾选的平台。 */
  initialSelected?: SkillPlatformId[]
  /** 本次允许展示和选择的平台范围。 */
  availablePlatforms?: SkillPlatformId[]
}

/** 首次扫描使用的 Ink 平台多选界面。 */
function PlatformPrompt({ locale, onComplete, mode = 'scan', allowEmpty = false, initialSelected, availablePlatforms }: PlatformPromptProps) {
  const allOptions: Array<{ id: SkillPlatformId; label: string }> = [
    { id: 'codex', label: 'ChatGPT / Codex' },
    { id: 'claude', label: 'Claude Code' },
    { id: 'cursor', label: 'Cursor' },
  ]
  const options = availablePlatforms ? allOptions.filter((option) => availablePlatforms.includes(option.id)) : allOptions
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<SkillPlatformId[]>(initialSelected ?? options.map((option) => option.id))
  const [warning, setWarning] = useState('')
  useInput((_input, key) => {
    if (_input.toLocaleLowerCase() === 'q' || key.escape) {
      onComplete(null)
      return
    }
    if (key.upArrow) setCursor((current) => (current + options.length - 1) % options.length)
    if (key.downArrow) setCursor((current) => (current + 1) % options.length)
    if (_input === ' ') {
      const id = options[cursor]!.id
      setSelected((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])
      setWarning('')
    }
    if (key.return) {
      if (!allowEmpty && !selected.length) {
        setWarning(t(locale, 'platformRequired'))
        return
      }
      onComplete(selected)
    }
  })
  return (
    <Frame title={t(locale, mode === 'link' ? 'chooseLinkPlatforms' : 'choosePlatforms')}>
      <Text dimColor>{t(locale, mode === 'link' ? 'linkOnlySelected' : 'scanOnlySelected')}</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((option, index) => {
          return <Box key={option.id}>
            <Text {...(index === cursor ? { color: accent } : {})}>{index === cursor ? '›' : ' '} </Text>
            <CheckboxMark checked={selected.includes(option.id)} />
            <Text {...(index === cursor ? { color: accent, bold: true } : {})}> {option.label}</Text>
          </Box>
        })}
      </Box>
      {warning ? <Text color="yellow">! {warning}</Text> : null}
    </Frame>
  )
}

/** 等待用户在 Ink 中确认首次扫描平台。 */
function choosePlatforms(locale: AskXLocale, mode: 'scan' | 'link' = 'scan', allowEmpty = false, initialSelected?: SkillPlatformId[], availablePlatforms?: SkillPlatformId[]): Promise<SkillPlatformId[] | null> {
  return new Promise((resolve) => {
    render(<PlatformPrompt locale={locale} mode={mode} allowEmpty={allowEmpty} {...(initialSelected ? { initialSelected } : {})} {...(availablePlatforms ? { availablePlatforms } : {})} onComplete={(platforms) => {
      resolve(platforms)
    }} />)
  })
}

/** 交互式 Skill 同步选择属性。 */
interface SkillSyncPromptProps {
  /** 最新只读扫描结果。 */
  report: SkillsScanReport
  /** 当前界面语言。 */
  locale: AskXLocale
  /** 完成选择时回传扫描分组及本地范围。 */
  onComplete: (result: { groupIds: string[]; localGroupIds: string[] } | null) => void
}

/** 扫描完成后的 Skill 多选界面。 */
function SkillSyncPrompt({ report, locale, onComplete }: SkillSyncPromptProps) {
  const safeGroupIds = createSafeSyncDecisions(report).flatMap((decision, index) => decision.kind === 'keep' ? [] : [report.groups[index]!.id])
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<string[]>(safeGroupIds)
  const [localGroupIds, setLocalGroupIds] = useState<string[]>(report.groups.filter(group => group.locations.some(location => location.importScope === 'local')).map(group => group.id))
  useInput((input, key) => {
    if (input.toLocaleLowerCase() === 'q' || key.escape) {
      onComplete(null)
      return
    }
    if (!report.groups.length) {
      if (key.return) {
        onComplete({ groupIds: [], localGroupIds: [] })
      }
      return
    }
    if (key.upArrow) setCursor((current) => (current + report.groups.length - 1) % report.groups.length)
    if (key.downArrow) setCursor((current) => (current + 1) % report.groups.length)
    if (input === ' ') {
      const group = report.groups[cursor]!
      if (!safeGroupIds.includes(group.id)) return
      setSelected((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])
    }
    if (input.toLocaleLowerCase() === 'l') {
      const group = report.groups[cursor]!
      setLocalGroupIds(current => current.includes(group.id) ? current.filter(id => id !== group.id) : [...current, group.id])
    }
    if (key.return) {
      onComplete({ groupIds: selected, localGroupIds })
    }
  })
  return (
    <Frame title={t(locale, 'chooseSkills')}>
      <Text dimColor>{t(locale, 'chooseSkillsHint')}</Text>
      <Box flexDirection="column" marginTop={1}>
        {report.groups.map((group, index) => {
          const safe = safeGroupIds.includes(group.id)
          return (
            <Box key={group.id}>
              <Text {...(index === cursor ? { color: accent } : {})} dimColor={!safe}>{index === cursor ? '›' : ' '} </Text>
              <CheckboxMark checked={selected.includes(group.id)} />
              <Text {...(index === cursor ? { color: accent, bold: true } : {})} dimColor={!safe}> {group.name}  [{t(locale, localGroupIds.includes(group.id) ? 'localScope' : 'sharedScope')}]{safe ? '' : `  (${t(locale, 'unsafeSkill')})`}</Text>
            </Box>
          )
        })}
        {!report.groups.length ? <Text dimColor>—</Text> : null}
      </Box>
    </Frame>
  )
}

/** 等待用户选择本次需要同步的 Skill。 */
function chooseSkills(report: SkillsScanReport, locale: AskXLocale): Promise<{ groupIds: string[]; localGroupIds: string[] } | null> {
  return new Promise((resolve) => {
    render(<SkillSyncPrompt report={report} locale={locale} onComplete={(result) => {
      resolve(result)
    }} />)
  })
}

/** 冲突向导当前可选的处理方式。 */
type ConflictAction = 'keep' | 'replace' | 'rename'

/** 交互式冲突处理属性。 */
interface ConflictResolutionPromptProps {
  /** 最新只读扫描结果。 */
  report: SkillsScanReport
  /** 当前界面语言。 */
  locale: AskXLocale
  /** 完成全部冲突决策时回传结果。 */
  onComplete: (decisions: SkillDecision[] | null) => void
}

/** 逐项收集冲突处理决策，退出时放弃整次命令。 */
function ConflictResolutionPrompt({ report, locale, onComplete }: ConflictResolutionPromptProps) {
  const conflicts = report.groups.filter((group) => group.status === 'conflict')
  const actions: Array<{ id: ConflictAction; label: string }> = [
    { id: 'keep', label: t(locale, 'conflictKeep') },
    { id: 'replace', label: t(locale, 'conflictReplace') },
    { id: 'rename', label: t(locale, 'conflictRename') },
  ]
  const [conflictIndex, setConflictIndex] = useState(0)
  const [stage, setStage] = useState<'action' | 'source' | 'rename' | 'summary'>('action')
  const [actionCursor, setActionCursor] = useState(0)
  const [sourceCursor, setSourceCursor] = useState(0)
  const [pendingAction, setPendingAction] = useState<Exclude<ConflictAction, 'keep'>>('replace')
  const [renameValue, setRenameValue] = useState('')
  const [renameWarning, setRenameWarning] = useState('')
  const [decisions, setDecisions] = useState<SkillDecision[]>([])
  const group = conflicts[conflictIndex]
  const sources = group?.locations.filter((location) => location.metadata.valid && !location.broken && location.contentHash) ?? []

  /** 保存当前冲突决策并进入下一项或摘要。 */
  const commitDecision = (decision: SkillDecision) => {
    const next = [...decisions, decision]
    setDecisions(next)
    if (conflictIndex + 1 >= conflicts.length) {
      setStage('summary')
      return
    }
    setConflictIndex((current) => current + 1)
    setActionCursor(0)
    setSourceCursor(0)
    setRenameValue('')
    setRenameWarning('')
    setStage('action')
  }

  useInput((input, key) => {
    if (input.toLocaleLowerCase() === 'q' || key.escape) {
      onComplete(null)
      return
    }
    if (stage === 'summary') {
      if (key.return) onComplete(decisions)
      return
    }
    if (!group) {
      onComplete([])
      return
    }
    if (stage === 'action') {
      if (key.upArrow) setActionCursor((current) => (current + actions.length - 1) % actions.length)
      if (key.downArrow) setActionCursor((current) => (current + 1) % actions.length)
      if (!key.return) return
      const action = actions[actionCursor]!.id
      if (action === 'keep') {
        commitDecision({ kind: 'keep', groupId: group.id })
        return
      }
      setPendingAction(action)
      setSourceCursor(0)
      setStage('source')
      return
    }
    if (stage === 'source') {
      if (input.toLocaleLowerCase() === 'b') {
        setStage('action')
        return
      }
      if (key.upArrow && sources.length) setSourceCursor((current) => (current + sources.length - 1) % sources.length)
      if (key.downArrow && sources.length) setSourceCursor((current) => (current + 1) % sources.length)
      if (!key.return || !sources[sourceCursor]) return
      const source = sources[sourceCursor]!
      if (pendingAction === 'replace') {
        const targetLocationIds = group.locations
          .filter((location) => location.id !== source.id && location.platform !== 'custom')
          .map((location) => location.id)
        commitDecision(targetLocationIds.length
          ? { kind: 'replace', sourceLocationId: source.id, targetLocationIds }
          : { kind: 'adopt', sourceLocationId: source.id })
        return
      }
      setRenameValue(`${group.name}-imported`)
      setRenameWarning('')
      setStage('rename')
      return
    }
    if (stage === 'rename') {
      if (input.toLocaleLowerCase() === 'b' && !renameValue) {
        setStage('source')
        return
      }
      if (key.backspace || key.delete) {
        setRenameValue((current) => current.slice(0, -1))
        setRenameWarning('')
        return
      }
      if (key.return) {
        const name = renameValue.trim()
        const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)
          && !report.locations.some((location) => location.name === name)
        if (!valid) {
          setRenameWarning(t(locale, 'conflictRenameInvalid'))
          return
        }
        commitDecision({ kind: 'rename-and-adopt', sourceLocationId: sources[sourceCursor]!.id, newName: name })
        return
      }
      if (input && !key.ctrl && !key.meta) {
        setRenameValue((current) => `${current}${input}`)
        setRenameWarning('')
      }
    }
  })

  if (stage === 'summary') {
    return (
      <Frame title={t(locale, 'conflictSummary')}>
        <Text dimColor>{t(locale, 'conflictSourceHint')}</Text>
        <Box flexDirection="column" marginTop={1}>
          {decisions.map((decision, index) => {
            const conflict = conflicts[index]!
            if (decision.kind === 'keep' || decision.kind === 'archive') return <Text key={conflict.id}>✓ {conflict.name}: {t(locale, 'conflictDecisionKeep')}</Text>
            const source = report.locations.find((location) => location.id === decision.sourceLocationId)!
            const sourceLabel = `${source.platform} · ${source.path}`
            const message = decision.kind === 'rename-and-adopt'
              ? t(locale, 'conflictDecisionRename').replace('{source}', sourceLabel).replace('{name}', decision.newName)
              : t(locale, 'conflictDecisionReplace').replace('{source}', sourceLabel)
            return <Text key={conflict.id}>✓ {conflict.name}: {message}</Text>
          })}
        </Box>
      </Frame>
    )
  }

  return (
    <Frame title={t(locale, stage === 'action' ? 'conflictResolution' : 'conflictChooseSource')}>
      <Text bold>{t(locale, 'conflictProgress').replace('{current}', String(conflictIndex + 1)).replace('{total}', String(conflicts.length))} · {group?.name}</Text>
      <Text dimColor>{t(locale, stage === 'action' ? 'conflictActionHint' : 'conflictSourceHint')}</Text>
      {stage === 'action' ? (
        <Box flexDirection="column" marginTop={1}>
          {actions.map((action, index) => <Text key={action.id} {...(index === actionCursor ? { color: accent, bold: true } : {})}>{index === actionCursor ? '›' : ' '} {action.label}</Text>)}
        </Box>
      ) : stage === 'source' ? (
        <Box flexDirection="column" marginTop={1}>
          {sources.map((source, index) => (
            <Box key={source.id} flexDirection="column">
              <Text {...(index === sourceCursor ? { color: accent, bold: true } : {})}>{index === sourceCursor ? '›' : ' '} {source.platform} · {source.metadata.version ?? '—'}</Text>
              <Text dimColor>    {source.path}</Text>
            </Box>
          ))}
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text>{t(locale, 'conflictRenamePrompt')}</Text>
          <Text color={accent}>› {renameValue}█</Text>
          {renameWarning ? <Text color="yellow">! {renameWarning}</Text> : null}
        </Box>
      )}
    </Frame>
  )
}

/** 等待用户逐项解决扫描报告中的内容冲突。 */
function resolveSkillConflicts(report: SkillsScanReport, locale: AskXLocale): Promise<SkillDecision[] | null> {
  if (!report.groups.some((group) => group.status === 'conflict')) return Promise.resolve([])
  return new Promise((resolve) => {
    render(<ConflictResolutionPrompt report={report} locale={locale} onComplete={resolve} />)
  })
}

/**
 * 逐项读取需要绑定到统一源的自定义文件夹。
 * @param locale 当前界面语言。
 * @returns 用户输入并去重后的文件夹路径。
 */
async function chooseCustomDirectories(locale: AskXLocale, message: 'customScanPrompt' | 'customLinkPrompt'): Promise<string[]> {
  activeInkInstance?.unmount()
  activeInkInstance = undefined
  process.stdin.resume()
  const inputKeepAlive = setInterval(() => undefined, 1_000)
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const directories: string[] = []
  try {
    while (true) {
      const directory = (await prompt.question(`${t(locale, message)} `)).trim()
      if (!directory) return [...new Set(directories)]
      directories.push(resolve(directory))
    }
  } finally {
    prompt.close()
    clearInterval(inputKeepAlive)
  }
}

/**
 * 让用户确认软链目录；第一步的扫描目录默认全部选中。
 * @param locale 当前终端语言。
 * @param defaults 第一阶段选择的默认目录。
 * @returns 用户最终确认的软链目录。
 */
async function chooseCustomLinkDirectories(locale: AskXLocale, defaults: string[], allowAdditions = true): Promise<string[]> {
  const additions = allowAdditions ? await chooseCustomDirectories(locale, 'customLinkPrompt') : []
  const directories = [...new Set([...defaults, ...additions].map((path) => resolve(path)))]
  if (!directories.length) return []
  process.stdin.resume()
  const inputKeepAlive = setInterval(() => undefined, 1_000)
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log(directories.map((path, index) => `${index + 1}. ${path}`).join('\n'))
    while (true) {
      const answer = (await prompt.question(`${t(locale, 'customLinkDirectorySelection')} `)).trim()
      if (!answer) return directories
      if (answer === '0') return []
      const indexes = answer.split(/[,，\s]+/).filter(Boolean).map((value) => Number(value) - 1)
      if (indexes.length <= 3 && new Set(indexes).size === indexes.length && indexes.every((index) => Number.isInteger(index) && directories[index])) {
        return indexes.map((index) => directories[index]!)
      }
      console.log(t(locale, 'customDirectorySelectionInvalid'))
    }
  } finally {
    prompt.close()
    clearInterval(inputKeepAlive)
  }
}

/** @returns 用户为扫描阶段输入的自定义目录。 */
function chooseCustomScanDirectories(locale: AskXLocale): Promise<string[]> {
  return chooseCustomDirectories(locale, 'customScanPrompt')
}

/**
 * 合并历史与本次扫描目录，并在超过上限时让用户明确选择保留项。
 * @param locale 当前终端语言。
 * @param previous 历史保存的扫描目录。
 * @param current 本次输入的扫描目录。
 * @returns 用户确认后最多三个目录。
 */
async function reconcileCustomScanDirectories(locale: AskXLocale, previous: string[], current: string[]): Promise<string[]> {
  const directories = [...new Set([...previous, ...current].map((path) => resolve(path)))]
  if (directories.length <= 3) return directories
  process.stdin.resume()
  const inputKeepAlive = setInterval(() => undefined, 1_000)
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log(directories.map((path, index) => `${index + 1}. ${path}`).join('\n'))
    while (true) {
      const answer = await prompt.question(`${t(locale, 'customDirectoryLimit')} `)
      const indexes = answer.split(/[,，\s]+/).filter(Boolean).map((value) => Number(value) - 1)
      if (indexes.length >= 1 && indexes.length <= 3 && new Set(indexes).size === indexes.length && indexes.every((index) => Number.isInteger(index) && directories[index])) {
        return indexes.map((index) => directories[index]!)
      }
      console.log(t(locale, 'customDirectorySelectionInvalid'))
    }
  } finally {
    prompt.close()
    clearInterval(inputKeepAlive)
  }
}

/** 写操作通用选项。 */
interface SkillsWriteOptions {
  /** 是否输出纯 JSON。 */
  json?: boolean
  /** 是否跳过交互并授权当前计划。 */
  yes?: boolean
}

/** CLI 一键清空的交互配置。 */
interface ClearConfiguration {
  /** 本次需要清空的模块。 */
  clearModules: ClearModule[]
  /** 清空前是否创建长期备份。 */
  createBackup: boolean
}

/** 一键清空第一步配置组件属性。 */
interface ClearConfigurationPromptProps {
  /** 当前终端语言。 */
  locale: AskXLocale
  /** 用户完成配置或放弃时的回调。 */
  onComplete: (configuration: ClearConfiguration | null) => void
}

/** 选择清空模块和是否创建备份。 */
function ClearConfigurationPrompt({ locale, onComplete }: ClearConfigurationPromptProps) {
  const options: Array<{ id: ClearModule | 'backup'; label: string }> = [
    { id: 'links', label: t(locale, 'clearModuleLinks') },
    { id: 'skills', label: t(locale, 'clearModuleSkills') },
    { id: 'backup', label: t(locale, 'clearBackupOption') },
  ]
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<Array<ClearModule | 'backup'>>(['links', 'skills', 'backup'])
  const [warning, setWarning] = useState('')
  useInput((input, key) => {
    if (input.toLocaleLowerCase() === 'q' || key.escape) return onComplete(null)
    if (key.upArrow) setCursor(current => (current + options.length - 1) % options.length)
    if (key.downArrow) setCursor(current => (current + 1) % options.length)
    if (input === ' ') {
      const id = options[cursor]!.id
      setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
      setWarning('')
    }
    if (key.return) {
      const clearModules = selected.filter((value): value is ClearModule => value !== 'backup')
      if (!clearModules.length) {
        setWarning(t(locale, 'clearSelectionRequired'))
        return
      }
      onComplete({ clearModules, createBackup: selected.includes('backup') })
    }
  })
  return (
    <Frame title={t(locale, 'clearConfiguration')}>
      <Text dimColor>{t(locale, 'clearConfigurationHint')}</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((option, index) => (
          <Box key={option.id}>
            <Text {...(index === cursor ? { color: accent, bold: true } : {})}>{index === cursor ? '›' : ' '} </Text>
            <CheckboxMark checked={selected.includes(option.id)} />
            <Text {...(index === cursor ? { color: accent, bold: true } : {})}> {option.label}</Text>
          </Box>
        ))}
      </Box>
      {warning ? <Text color="yellow">! {warning}</Text> : null}
    </Frame>
  )
}

/** 等待用户完成一键清空第一步配置。 */
function chooseClearConfiguration(locale: AskXLocale): Promise<ClearConfiguration | null> {
  return new Promise(resolve => render(<ClearConfigurationPrompt locale={locale} onComplete={resolve} />))
}

/**
 * 读取备份名称，直接回车时使用默认名称。
 * @param locale 当前终端语言。
 * @param defaultName 共享层生成的默认名称。
 * @returns 用户确认的备份名称。
 */
async function chooseBackupName(locale: AskXLocale, defaultName: string): Promise<string> {
  activeInkInstance?.unmount()
  activeInkInstance = undefined
  process.stdin.resume()
  const inputKeepAlive = setInterval(() => undefined, 1_000)
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const value = (await prompt.question(`${t(locale, 'backupNamePrompt')} (${defaultName}): `)).trim()
    return value || defaultName
  } finally {
    prompt.close()
    clearInterval(inputKeepAlive)
  }
}

/** 交互式写计划确认属性。 */
interface ConfirmationPromptProps {
  /** 当前界面语言。 */
  locale: AskXLocale
  /** 当前写操作使用的确认文案。 */
  messageKey: MessageKey
  /** 用户完成选择时回传确认状态。 */
  onComplete: (confirmed: boolean) => void
}

/** Skills 写计划使用的 Ink 确认界面。 */
function ConfirmationPrompt({ locale, messageKey, onComplete }: ConfirmationPromptProps) {
  useInput((input, key) => {
    const confirmed = resolveConfirmationInput(input, { return: key.return, escape: key.escape })
    if (confirmed !== undefined) onComplete(confirmed)
  })
  return (
    <Frame title={t(locale, messageKey)}>
      <Text>{t(locale, messageKey)}</Text>
      <Text dimColor>{t(locale, 'confirmKeys')}</Text>
    </Frame>
  )
}

/** 等待用户确认当前已经展示的写计划。 */
function confirmWrite(locale: AskXLocale, messageKey: MessageKey = 'confirmApply'): Promise<boolean> {
  return new Promise((resolve) => {
    render(<ConfirmationPrompt locale={locale} messageKey={messageKey} onComplete={(confirmed) => {
      resolve(confirmed)
    }} />)
  })
}

/**
 * 校验当前环境已经取得明确授权。
 * @param options JSON 与免交互选项。
 * @param planPayload 需要在机器模式返回的完整计划。
 * @returns 当前写操作是否可以继续。
 */
async function authorizeWrite(options: SkillsWriteOptions, planPayload: unknown, messageKey: MessageKey = 'confirmApply'): Promise<boolean> {
  if (options.yes) return true
  if (options.json || !process.stdin.isTTY) {
    console.log(JSON.stringify({
      error: { code: 'CONFIRMATION_REQUIRED', message: t(activeLocale, 'confirmationRequired') },
      plan: planPayload,
    }, null, 2))
    process.exitCode = 2
    return false
  }
  return confirmWrite(activeLocale, messageKey)
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
        {plan.platformOperations.map((operation) => <Text key={operation.platform} color={operation.action === 'takeover' ? 'yellow' : accent}>→ {operation.platform}  [{operation.action === 'keep-external' ? (locale === 'zh-CN' ? '保留外部软链' : 'keep external') : operation.action === 'takeover' ? (locale === 'zh-CN' ? '接管外部软链' : 'take over external') : t(locale, operation.action === 'bind' ? 'platformActionBind' : operation.action === 'resume' ? 'platformActionResume' : 'platformActionSkip')}]  {operation.path}{operation.externalLinkTarget ? `  ${operation.externalLinkTarget} → ${operation.target}` : ''}</Text>)}
        {plan.customLinkOperations.map((operation) => <Text key={operation.id} color={accent}>→ {operation.name}  {operation.path}</Text>)}
      </Box>
    </Frame>
  )
}

/** 只展示平台和自定义文件夹软链，不渲染 Skill 扫描结果。 */
function RootLinkPlanView({ plan, locale }: { plan: SkillsBatchPlan; locale: AskXLocale }) {
  return (
    <Frame title={t(locale, 'linkPlan')}>
      <Text>{t(locale, 'planHash')}  <Text dimColor>{plan.hash}</Text></Text>
      {plan.platformOperations.map((operation) => (
        <Text key={operation.platform} color={operation.action === 'takeover' ? 'yellow' : accent}>→ {operation.platform}  [{operation.action}]  {operation.path}  →  {operation.action === 'keep-external' ? operation.externalLinkTarget : operation.target}</Text>
      ))}
      {plan.customLinkOperations.map((operation) => (
        <Text key={operation.id} color={accent}>→ {operation.name}  {operation.path}  →  {operation.target}</Text>
      ))}
    </Frame>
  )
}

/** 外部软链接管前的终端信息。 */
function ExternalLinkConflictView({ platform, canonicalRoot, locale }: { platform: SkillPlatformStatus; canonicalRoot: string; locale: AskXLocale }) {
  return (
    <Frame title={locale === 'zh-CN' ? '检测到外部软链' : 'External symlink detected'}>
      <Text>{locale === 'zh-CN' ? '平台' : 'Platform'}  <Text color={accent}>{platform.name}</Text></Text>
      <Text>{locale === 'zh-CN' ? '软链地址' : 'Link path'}  {platform.skillsDir}</Text>
      <Text>{locale === 'zh-CN' ? '当前目标' : 'Current target'}  <Text color="yellow">{platform.linkTarget}</Text></Text>
      <Text>{locale === 'zh-CN' ? '变更后目标' : 'New target'}  <Text color={accent}>{canonicalRoot}</Text></Text>
      <Text dimColor>{locale === 'zh-CN' ? '无法仅凭软链可靠识别创建软件。默认保留；接管时会备份原软链，取消 AskX 软链后可恢复。' : 'The creating application cannot be identified reliably from a symlink alone. Keep it by default; takeover backs it up for restoration.'}</Text>
    </Frame>
  )
}

/**
 * 逐个请求外部软链接管授权。
 * @param platforms 本次选择的软链平台。
 * @returns 用户明确同意接管的平台。
 */
async function chooseExternalLinkTakeovers(platforms: SkillPlatformId[]): Promise<SkillPlatformId[]> {
  const bootstrap = await skillsManager.bootstrap()
  const bindings = new Map(bootstrap.platformBindings.map(binding => [binding.platform, binding]))
  const conflicts = bootstrap.platforms.filter(platform => platforms.includes(platform.id) && (!bindings.has(platform.id) || Boolean(bindings.get(platform.id)?.suspendedAt)) && platform.skillsPathKind === 'symlink' && platform.linkTarget)
  const selected: SkillPlatformId[] = []
  for (const platform of conflicts) {
    render(<ExternalLinkConflictView platform={platform} canonicalRoot={bootstrap.canonicalSkillsDir} locale={activeLocale} />)
    if (await confirmWrite(activeLocale, 'externalTakeoverConfirm')) selected.push(platform.id)
  }
  return selected
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
  /** 本次因未授权接管而保留了外部软链。 */
  externalPreserved?: boolean
}

/** 自定义文件夹软链的 CLI 执行结果。 */
interface CliDirectoryLinkResult {
  /** 文件夹展示名称。 */
  name: string
  /** 文件夹绝对路径。 */
  path: string
  /** Core 返回的稳定执行状态。 */
  status: 'applied' | 'skipped' | 'failed'
  /** 执行失败时的可读原因。 */
  error?: string | undefined
  /** 成功或幂等操作的事务回执。 */
  receipt?: CustomLinkReceipt | undefined
}

/** 多个平台与自定义目录软链结果的终端展示。 */
function PlatformLinkResultsView({ results, directoryResults = [], batchReceipt, locale, title, action }: { results: CliPlatformLinkResult[]; directoryResults?: CliDirectoryLinkResult[]; batchReceipt?: SkillsBatchReceipt | undefined; locale: AskXLocale; title: string; action: 'link' | 'unlink' }) {
  const messageKeyByResult = {
    'already-linked-no-action': 'alreadyLinkedNoAction',
    failed: 'failed',
    'link-applied': 'linkApplied',
    skipped: 'skipped',
    'unlink-applied': 'unlinkApplied',
    'unlink-no-data': 'unlinkNoData',
  } as const
  return (
    <Frame title={title}>
      {results.map((result) => {
        const messageKey = result.externalPreserved ? 'externalLinkPreserved' : messageKeyByResult[platformLinkResultMessage(result.status, action)]
        return (
          <Text key={result.platform} color={result.status === 'applied' ? 'green' : result.status === 'failed' ? 'red' : 'yellow'}>
            {result.status === 'applied' ? '✓' : result.status === 'failed' ? '×' : '·'} {result.platform}  {t(locale, messageKey)}{result.error ? `  ${result.error}` : ''}
          </Text>
        )
      })}
      {directoryResults.map((result) => {
        const messageKey = messageKeyByResult[platformLinkResultMessage(result.status, action)]
        return (
          <Text key={result.path} color={result.status === 'applied' ? 'green' : result.status === 'failed' ? 'red' : 'yellow'}>
            {result.status === 'applied' ? '✓' : result.status === 'failed' ? '×' : '·'} {result.name}  {result.path}  {t(locale, messageKey)}{result.error ? `  ${result.error}` : ''}
          </Text>
        )
      })}
      {batchReceipt?.customLinkResults.map((result) => {
        const normalizedStatus = result.status === 'rolled-back' ? 'failed' : result.status
        const messageKey = messageKeyByResult[platformLinkResultMessage(normalizedStatus, 'link')]
        return (
          <Text key={result.id} color={result.status === 'applied' ? 'green' : normalizedStatus === 'failed' ? 'red' : 'yellow'}>
            {result.status === 'applied' ? '✓' : normalizedStatus === 'failed' ? '×' : '·'} {result.name}  {result.path}  {t(locale, messageKey)}
          </Text>
        )
      })}
    </Frame>
  )
}

/** 自定义文件夹软链状态计划。 */
function CustomLinkPlanView({ plan, locale, action }: { plan: CustomLinkPlan; locale: AskXLocale; action: 'link' | 'unlink' }) {
  return (
    <Frame title={t(locale, action === 'link' ? 'linkPlan' : 'unlinkPlan')}>
      <Text>{t(locale, 'planHash')}  <Text dimColor>{plan.hash}</Text></Text>
      <Text>→ {plan.name}  {plan.path}  →  {plan.target}</Text>
      <Text>{t(locale, 'operations')}  <Text color={accent}>{plan.operations.length}</Text></Text>
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
          {backup.valid ? '✓' : '×'} {backup.label}  <Text dimColor>{backup.version}</Text>  {t(locale, backup.valid ? 'valid' : 'invalid')}  {backup.skillCount ?? 0} {t(locale, 'skills')}{backup.issue ? `  ${backup.issue}` : ''}
        </Text>
      ))}
    </Frame>
  )
}

/** 展示统一源备份写计划。 */
function CanonicalPlanView({ plan, locale, title }: { plan: CanonicalSourceMutationPlan; locale: AskXLocale; title: string }) {
  const clearScope = plan.clearModules.map(module => t(locale, module === 'links' ? 'clearModuleLinks' : 'clearModuleSkills')).join('、')
  return (
    <Frame title={title}>
      <Text>{t(locale, 'operations')}  <Text color="yellow">{plan.action}</Text></Text>
      <Text>{t(locale, 'backup')}  <Text color={accent}>{plan.backupRequired ? t(locale, 'clearBackupOption') : t(locale, 'notBackedUp')}</Text></Text>
      {plan.backupLabel ? <Text>{t(locale, 'backupName')}  <Text color={accent}>{plan.backupLabel}</Text></Text> : null}
      {plan.backupVersion ? <Text>{t(locale, 'backupIdentifier')}  <Text color={accent}>{plan.backupVersion}</Text></Text> : null}
      {plan.backupPath ? <Text>{t(locale, 'backupPath')}  <Text color={accent}>{plan.backupPath}</Text></Text> : null}
      <Text>{t(locale, 'skills')}  {plan.currentSkillCount}</Text>
      {plan.action === 'clear' && <Text>{t(locale, 'clearScope')}  <Text color={accent}>{clearScope}</Text></Text>}
      <Text dimColor>{t(locale, 'planHash')}  {plan.hash}</Text>
    </Frame>
  )
}

/** 展示清空后的软链与 Skill 备份回执。 */
function CanonicalClearResultView({ receipt, locale }: { receipt: CanonicalSourceMutationReceipt; locale: AskXLocale }) {
  const summary = receipt.clearBackupSummary
  /** 将软链条目格式化为名称列表。 */
  const linkNames = (links: CanonicalLinkBackupItem[]): string => links.map(link => link.name).join('、') || t(locale, 'noData')
  const linkedBackupPath = summary?.backupPath ? terminalLink(pathToFileURL(summary.backupPath).href, summary.backupPath) : undefined
  return (
    <Frame title={t(locale, 'clearResult')}>
      <Text bold>{t(locale, 'skillBackup')}:</Text>
      <Text>{t(locale, 'cleared')}  <Text color="green">{summary?.skills.cleared ?? 0}</Text>  {t(locale, 'notCleared')}  <Text color="yellow">{summary?.skills.notCleared ?? 0}</Text>  {t(locale, 'backedUp')}  <Text color="green">{summary?.skills.backedUp ?? 0}</Text>  {t(locale, 'notBackedUp')}  <Text color="yellow">{summary?.skills.notBackedUp ?? 0}</Text></Text>
      <Box flexDirection="column" marginTop={1}>
        <Text bold>{t(locale, 'linkBindings')}:</Text>
        <Text>{t(locale, 'cleared')}  <Text color="green">{summary ? linkNames(summary.linkSummary.cleared) : t(locale, 'noData')}</Text></Text>
        <Text>{t(locale, 'notCleared')}  <Text color="yellow">{summary ? linkNames(summary.linkSummary.notCleared) : t(locale, 'noData')}</Text></Text>
        <Text>{t(locale, 'backedUp')}  <Text color="green">{summary ? linkNames(summary.linkSummary.backedUp) : t(locale, 'noData')}</Text></Text>
        <Text>{t(locale, 'notBackedUp')}  <Text color="yellow">{summary ? linkNames(summary.linkSummary.notBackedUp) : t(locale, 'noData')}</Text></Text>
      </Box>
      {summary?.backupVersion && <Text>{t(locale, 'backupIdentifier')}:  <Text color={accent}>{summary.backupVersion}</Text></Text>}
      {summary?.backupLabel && <Text>{t(locale, 'backupName')}:  <Text color={accent}>{summary.backupLabel}</Text></Text>}
      {linkedBackupPath && <Text>{t(locale, 'backupPath')}:  {linkedBackupPath}</Text>}
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

/** 当前 Skill 列表、统一目录和平台关联状态。 */
function ManagedSkillListView({ bootstrap, locale }: { bootstrap: SkillsBootstrap; locale: AskXLocale }) {
  const connected = bootstrap.platformBindings.filter((binding) => !binding.suspendedAt).map((binding) => binding.platform)
  const listedSkills = [
    ...bootstrap.managedSkills.map(skill => ({ ...skill, scope: 'shared' as const, path: skill.canonicalPath })),
    ...bootstrap.localSkills.map(skill => ({ ...skill, scope: 'local' as const, path: skill.localPath })),
  ]
  return (
    <Frame title={t(locale, 'skillListTitle')}>
      <Text>{t(locale, 'canonicalFolder')}  <Text color={accent}>{bootstrap.canonicalSkillsDir}</Text></Text>
      <Text>{t(locale, 'connectedPlatforms')}  <Text color={connected.length ? 'green' : 'yellow'}>{connected.join(' · ') || '-'}</Text></Text>
      <Box flexDirection="column" marginTop={1}>
        {listedSkills.length
          ? listedSkills.map((skill, index) => <Text key={`${skill.scope}:${skill.id}`}>{String(index + 1).padStart(2, '0')}  <Text bold>{skill.name}</Text>  <Text color={skill.scope === 'local' ? 'yellow' : accent}>[{t(locale, skill.scope === 'local' ? 'localScope' : 'sharedScope')}]</Text>  <Text dimColor>{skill.path}</Text></Text>)
          : <Text dimColor>{t(locale, 'noManagedSkills')}</Text>}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>{t(locale, 'statsHint')}:  askx skills stats</Text>
        <Text dimColor>{t(locale, 'manageHint')}:  askx skills scan / askx skills link</Text>
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
      {plan.registryRevision !== undefined && <Text>{t(locale, 'registryRevision')}  #{plan.registryRevision}</Text>}
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

const program = new Command()
/** 当前 AskAgent X 发布版本，格式为“年.月日.当日次数”。 */
const askxVersion = '26.812.1'
program.name('askx').description(t(activeLocale, 'appDescription')).version(askxVersion)

program
  .command('doctor')
  .description(t(activeLocale, 'doctorDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .action(async ({ json }: { json?: boolean }) => {
    const detections = await detectPlatforms()
    if (json) console.log(JSON.stringify(detections, null, 2))
    else render(<DoctorView detections={detections} locale={activeLocale} />)
  })

program
  .command('clear')
  .description(t(activeLocale, 'clearDescription'))
  .option('--links', t(activeLocale, 'clearLinksDescription'))
  .option('--skills', t(activeLocale, 'clearSkillsDescription'))
  .option('--backup-name <name>', t(activeLocale, 'backupNameDescription'))
  .option('--no-backup', t(activeLocale, 'noBackupDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .option('-y, --yes', t(activeLocale, 'yesDescription'))
  .action(async (options: SkillsWriteOptions & { links?: boolean, skills?: boolean, backup?: boolean, backupName?: string }) => {
    if (options.backup === false && options.backupName) {
      const message = t(activeLocale, 'backupOptionConflict')
      if (options.json) console.log(JSON.stringify({ error: { code: 'BACKUP_OPTION_CONFLICT', message } }, null, 2))
      else render(<NoticeView title={t(activeLocale, 'clearConfiguration')} message={message} />)
      process.exitCode = 2
      return
    }
    const hasConfigurationArguments = process.argv.slice(2).some(argument => ['--links', '--skills', '--backup-name', '--no-backup'].includes(argument) || argument.startsWith('--backup-name='))
    let clearModules: ClearModule[] = options.links || options.skills
      ? [...(options.links ? ['links' as const] : []), ...(options.skills ? ['skills' as const] : [])]
      : ['links' as const, 'skills' as const]
    let createBackup = options.backup !== false
    let backupName = options.backupName
    if (process.stdin.isTTY && !options.json && !options.yes && !hasConfigurationArguments) {
      const configuration = await chooseClearConfiguration(activeLocale)
      if (!configuration) {
        render(<NoticeView title={t(activeLocale, 'clearConfiguration')} message={t(activeLocale, 'cancelled')} />)
        return
      }
      clearModules = configuration.clearModules
      createBackup = configuration.createBackup
      if (createBackup) backupName = await chooseBackupName(activeLocale, await skillsManager.suggestCanonicalBackupLabel())
    }
    const plan = await skillsManager.planCanonicalSource('clear', undefined, clearModules, createBackup, backupName)
    if (!options.json) render(<CanonicalPlanView plan={plan} locale={activeLocale} title={t(activeLocale, 'clearPlan')} />)
    if (!await authorizeWrite(options, plan)) return
    const receipt = await skillsManager.applyCanonicalSource(plan, consentFor(plan))
    if (options.json) console.log(JSON.stringify(receipt, null, 2))
    else render(<CanonicalClearResultView receipt={receipt} locale={activeLocale} />)
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
  if (process.stdin.isTTY && !json) return choosePlatforms(activeLocale)
  if (initialized) {
    const configuredPlatforms = (await settingsStore.read()).skills.platforms
    if (configuredPlatforms.length) return configuredPlatforms
  }
  const payload = { error: { code: 'PLATFORM_SELECTION_REQUIRED', message: t(activeLocale, 'platformSelectionRequired') } }
  if (json) console.log(JSON.stringify(payload, null, 2))
  else render(<NoticeView title={t(activeLocale, 'skillsScan')} message={payload.error.message} />)
  process.exitCode = 2
  return null
}

/** macOS 受保护目录授权后的重试提示属性。 */
interface MacPrivacyRetryPromptProps {
  /** 当前界面语言。 */
  locale: AskXLocale
  /** 被系统拒绝的目录。 */
  path: string
  /** 是否已经授权并重试过一次。 */
  repeated: boolean
  /** 回传重试或取消选择。 */
  onComplete: (retry: boolean) => void
}

/** 提示用户完成 macOS 应用级文件夹授权。 */
function MacPrivacyRetryPrompt({ locale, path, repeated, onComplete }: MacPrivacyRetryPromptProps) {
  const parent = dirname(path)
  const relativeDirectory = `./${basename(path)}`
  useInput((input, key) => {
    const confirmed = resolveConfirmationInput(input, { return: key.return, escape: key.escape })
    if (confirmed !== undefined) onComplete(confirmed)
  })
  return (
    <Frame title={t(locale, 'macPrivacyTitle')}>
      <Text color="yellow">! {t(locale, 'macPrivacyDenied').replace('{path}', path)}</Text>
      <Text>{t(locale, repeated ? 'macPrivacyStillDenied' : 'macPrivacyInstructions')}</Text>
      <Text>{t(locale, 'macPrivacyLocalRetry')}</Text>
      <Text color="cyan">cd {shellQuote(parent)}</Text>
      <Text color="cyan">askx skills scan --directory {shellQuote(relativeDirectory)}</Text>
      <Text dimColor>{t(locale, 'macPrivacyRetry')}</Text>
    </Frame>
  )
}

/** 将路径编码为可直接复制到 POSIX shell 的单个参数。 */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** 打开 macOS 文件与文件夹隐私设置。 */
async function openMacPrivacySettings(): Promise<void> {
  const child = spawn('/usr/bin/open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders'], {
    stdio: 'ignore',
  })
  await Promise.race([once(child, 'exit'), once(child, 'error')])
}

/** 等待用户完成 macOS 文件夹授权并决定是否重试当前命令。 */
async function requestMacPrivacyRetry(path: string, locale: AskXLocale, repeated: boolean): Promise<boolean> {
  if (!repeated) await openMacPrivacySettings()
  return new Promise((resolve) => {
    render(<MacPrivacyRetryPrompt path={path} locale={locale} repeated={repeated} onComplete={resolve} />)
  })
}

/**
 * 扫描 Skill，并在 macOS 应用级目录授权后原地重试。
 * @param platforms 本次扫描的平台。
 * @param customRoots 本次扫描的自定义目录。
 * @returns 扫描报告；用户放弃授权时返回 null。
 */
async function scanWithMacPrivacyRecovery(platforms: SkillPlatformId[], customRoots: string[]): Promise<SkillsScanReport | null> {
  let permissionAttempts = 0
  while (true) {
    try {
      return await skillsManager.scan(platforms, customRoots)
    } catch (error) {
      const accessError = error as Partial<SkillDirectoryAccessError>
      const macPrivacyDenied = process.platform === 'darwin'
        && accessError.name === 'SkillDirectoryAccessError'
        && accessError.causeCode === 'EPERM'
        && typeof accessError.path === 'string'
      if (!macPrivacyDenied || !process.stdin.isTTY) throw error
      if (!await requestMacPrivacyRetry(accessError.path!, activeLocale, permissionAttempts > 0)) return null
      permissionAttempts += 1
    }
  }
}

/**
 * 执行扫描、Skill 选择、软链目标选择和最终保存的完整交互向导。
 * @param platforms 本次扫描的平台来源。
 * @param customRoots 本次扫描的自定义目录来源。
 */
async function runSkillsSetupWizard(platforms: SkillPlatformId[], customRoots: string[] = [], configurationStrategy: SkillsConfigurationStrategy = 'replace'): Promise<void> {
  const wizardKeepAlive = setInterval(() => undefined, 1_000)
  try {
    const settings = await settingsStore.read()
    const report = await scanWithMacPrivacyRecovery(platforms, customRoots)
    if (!report) {
      render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
      return
    }
    const issues = scanIssues(report)
    render(<SkillsScanView report={report} issues={issues} status={issues.length ? 'warning' : 'ok'} locale={activeLocale} />)

    const skillSelection = await chooseSkills(report, activeLocale)
    if (!skillSelection) {
      render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
      return
    }
    const conflictDecisions = await resolveSkillConflicts(report, activeLocale)
    if (!conflictDecisions) {
      render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
      return
    }
    const linkPlatforms = configurationStrategy === 'merge'
      ? platforms.length ? await choosePlatforms(activeLocale, 'link', true, platforms, platforms) : []
      : await choosePlatforms(activeLocale, 'link', true, platforms)
    if (!linkPlatforms) {
      render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
      return
    }
    const takeoverPlatforms = await chooseExternalLinkTakeovers(linkPlatforms)
    const linkCustomRoots = await chooseCustomLinkDirectories(activeLocale, customRoots, configurationStrategy !== 'merge')
    const plan = await skillsManager.planOnboarding({
      platforms,
      customRoots,
      detectionFingerprint: report.fingerprint,
      settingsRevision: settings.revision,
      decisions: createSelectedSyncDecisions(report, skillSelection.groupIds, conflictDecisions).map((decision) => {
        if (!('sourceLocationId' in decision)) return decision
        const group = report.groups.find(entry => entry.locations.some(location => location.id === decision.sourceLocationId))
        return { ...decision, scope: group && skillSelection.localGroupIds.includes(group.id) ? 'local' as const : 'shared' as const }
      }),
      managementChoices: [],
      mode: 'connect',
      configurationStrategy,
      linkPlatforms,
      takeoverPlatforms,
      linkCustomRoots,
    })
    render(<SkillsBatchPlanView plan={plan} report={report} locale={activeLocale} title={t(activeLocale, 'scanPlan')} />)
    if (!await authorizeWrite({}, plan)) {
      render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
      return
    }
    await skillsManager.applyOnboarding(plan, settings.revision, consentFor(plan))
    try {
      const latestSettings = await settingsStore.read()
      const nextPlatforms = configurationStrategy === 'merge'
        ? [...new Set([...latestSettings.skills.platforms, ...platforms])]
        : platforms
      if (latestSettings.skills.platforms.join(',') !== nextPlatforms.join(',')) {
        await settingsStore.update({ skills: { platforms: nextPlatforms } }, { source: 'cli', expectedRevision: latestSettings.revision })
      }
    } catch {
      render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'platformPreferenceSyncFailed')} />)
    }
    render(<ManagedSkillListView bootstrap={await skillsManager.bootstrap()} locale={activeLocale} />)
  } finally {
    clearInterval(wizardKeepAlive)
  }
}

/** 裸 `askx skills` 命令：查看列表，首次使用时完成扫描与平台关联。 */
skills.action(async () => {
  const bootstrap = await skillsManager.bootstrap()
  if (bootstrap.initialized) {
    render(<ManagedSkillListView bootstrap={bootstrap} locale={activeLocale} />)
    return
  }
  if (!process.stdin.isTTY) {
    render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'platformSelectionRequired')} />)
    process.exitCode = 2
    return
  }
  const platforms = await choosePlatforms(activeLocale, 'scan', true)
  if (!platforms) {
    render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
    return
  }
  const customRoots = await reconcileCustomScanDirectories(
    activeLocale,
    bootstrap.customRoots.map((root) => root.path),
    await chooseCustomScanDirectories(activeLocale),
  )
  if (!platforms.length && !customRoots.length) {
    render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'sourceRequired')} />)
    return
  }
  await runSkillsSetupWizard(platforms, customRoots)
})

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
    if (plan.operations.length > 0 && !await authorizeWrite(options, plan, action === 'suspend' ? 'unlinkConfirm' : 'linkConfirm')) {
      if (!options.json && process.stdin.isTTY) render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
      return { cancelled: true }
    }
    const receipt = await skillsManager.applyPlatformLink(plan, consentFor(plan))
    return { cancelled: false, result: { platform, status: receipt.status, receipt } }
  } catch (error) {
    return { cancelled: false, result: { platform, status: 'failed', error: (error as Error).message } }
  }
}

/** 生成、确认并执行一个已有自定义文件夹的软链状态操作。 */
async function executeCustomLinkAction(bindingId: string, action: 'resume' | 'suspend', options: SkillsWriteOptions): Promise<{
  /** 用户是否取消了当前命令。 */
  cancelled: boolean
  /** 未取消时的文件夹结果。 */
  result?: CliDirectoryLinkResult | undefined
}> {
  try {
    const plan = await skillsManager.planCustomLink(bindingId, action)
    const presentationAction = action === 'resume' ? 'link' : 'unlink'
    if (!options.json) render(<CustomLinkPlanView plan={plan} locale={activeLocale} action={presentationAction} />)
    const confirmationKey = action === 'resume' ? 'linkConfirm' : 'unlinkConfirm'
    if (plan.operations.length > 0 && !await authorizeWrite(options, plan, confirmationKey)) {
      if (!options.json && process.stdin.isTTY) render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
      return { cancelled: true }
    }
    const receipt = await skillsManager.applyCustomLink(plan, consentFor(plan))
    return { cancelled: false, result: { name: plan.name, path: plan.path, status: receipt.status, receipt } }
  } catch (error) {
    const bootstrap = await skillsManager.bootstrap()
    const binding = bootstrap.customLinkBindings.find((entry) => entry.id === bindingId)
    return {
      cancelled: false,
      result: {
        name: binding?.name ?? bindingId,
        path: binding?.path ?? bindingId,
        status: 'failed',
        error: (error as Error).message,
      },
    }
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
    try {
    const bootstrap = await skillsManager.bootstrap()
    const invocationMode = resolveSkillsScanInvocationMode({ json: Boolean(json), platforms: platform, directories: directory })
    const platforms = invocationMode === 'full-reconcile'
      ? await choosePlatforms(activeLocale, 'scan', true)
      : platform.length
        ? parseSkillPlatforms(platform)
        : directory.length
          ? []
          : invocationMode === 'targeted-import'
            ? []
            : await resolveSourcePlatforms(platform, bootstrap.initialized, json)
    if (!platforms) return
    if (!json && process.stdin.isTTY) {
      const customRoots = invocationMode === 'targeted-import'
        ? [...new Set(directory.map((entry) => resolve(entry)))].sort()
        : await reconcileCustomScanDirectories(activeLocale, [], await chooseCustomScanDirectories(activeLocale))
      if (!platforms.length && !customRoots.length) {
        render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'sourceRequired')} />)
        return
      }
      await runSkillsSetupWizard(platforms, customRoots, invocationMode === 'targeted-import' ? 'merge' : 'replace')
      return
    }
    const report = await skillsManager.scan(platforms, directory)
    const issues = scanIssues(report)
    if (json) console.log(JSON.stringify(report, null, 2))
    else render(<SkillsScanView report={report} issues={issues} status={issues.length ? 'warning' : 'ok'} locale={activeLocale} />)
    } catch (error) {
      const message = (error as Error).message
      if (json) console.log(JSON.stringify({ error: { code: 'SKILLS_SCAN_FAILED', message } }, null, 2))
      else if (process.stdin.isTTY) render(<NoticeView title={t(activeLocale, 'skillsScan')} message={message} />)
      else console.error(message)
      process.exitCode = 1
    }
  })

/** Skills 软链命令选项。 */
interface SkillsLinkOptions extends SkillsWriteOptions {
  /** 要绑定或恢复的平台参数。 */
  platform: string[]
  /** 要额外绑定到统一源的本地目录。 */
  directory: string[]
  /** 明确允许接管本次选中平台的外部软链。 */
  takeoverExternalLink?: boolean
}

skills
  .command('link')
  .description(t(activeLocale, 'linkDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .option('-y, --yes', t(activeLocale, 'yesDescription'))
  .option('-p, --platform <platform>', t(activeLocale, 'platformsArgument'), collectPlatform, [])
  .option('-d, --directory <path>', t(activeLocale, 'linkDirectoryDescription'), collectDirectory, [])
  .option('--takeover-external-link', '明确备份并接管检测到的外部软链 / Explicitly back up and take over external symlinks')
  .action(async (options: SkillsLinkOptions) => {
    let bootstrap = await skillsManager.bootstrap()
    if (!bootstrap.initialized) throw new Error(t(activeLocale, 'skillsNotInitialized'))
    let selectedPlatforms: SkillPlatformId[] = []
    if (options.platform.length) selectedPlatforms = parseSkillPlatforms(options.platform)
    else if (!options.directory.length && process.stdin.isTTY && !options.json) {
      const promptedPlatforms = await choosePlatforms(activeLocale, 'link')
      if (!promptedPlatforms) {
        render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
        return
      }
      selectedPlatforms = promptedPlatforms
    }
    else if (!options.directory.length) throw new Error(t(activeLocale, 'platformWriteRequired'))

    const results: CliPlatformLinkResult[] = []
    const bindings = new Map(bootstrap.platformBindings.map((binding) => [binding.platform, binding]))
    const platformStatuses = new Map(bootstrap.platforms.map(platform => [platform.id, platform]))
    const suspendedExternalPlatforms = new Set(selectedPlatforms.filter(platform => bindings.get(platform)?.suspendedAt && platformStatuses.get(platform)?.skillsPathKind === 'symlink'))
    const suspendedPlatforms = selectedPlatforms.filter((platform) => bindings.get(platform)?.suspendedAt && !suspendedExternalPlatforms.has(platform))
    const activePlatforms = selectedPlatforms.filter((platform) => bindings.has(platform) && !bindings.get(platform)?.suspendedAt)
    const newPlatforms = selectedPlatforms.filter((platform) => !bindings.has(platform) || suspendedExternalPlatforms.has(platform))

    for (const platform of suspendedPlatforms) {
      const execution = await executePlatformLinkAction(platform, 'resume', options)
      if (execution.cancelled) return
      if (execution.result) results.push(execution.result)
    }
    results.push(...activePlatforms.map((platform) => ({ platform, status: 'skipped' as const })))

    bootstrap = await skillsManager.bootstrap()
    const normalizedDirectories = [...new Set(options.directory.map((path) => resolve(path)))]
    const customBindings = new Map(bootstrap.customLinkBindings.map((binding) => [binding.path, binding]))
    const suspendedDirectories = normalizedDirectories.filter((path) => customBindings.get(path)?.suspendedAt)
    const activeDirectories = normalizedDirectories.filter((path) => customBindings.has(path) && !customBindings.get(path)?.suspendedAt)
    const newDirectories = normalizedDirectories.filter((path) => !customBindings.has(path))
    const directoryResults: CliDirectoryLinkResult[] = activeDirectories.map((path) => ({
      name: customBindings.get(path)!.name,
      path,
      status: 'skipped',
    }))
    for (const path of suspendedDirectories) {
      const execution = await executeCustomLinkAction(customBindings.get(path)!.id, 'resume', options)
      if (execution.cancelled) return
      if (execution.result) directoryResults.push(execution.result)
    }

    let batchReceipt: SkillsBatchReceipt | undefined
    if (newPlatforms.length || newDirectories.length) {
      bootstrap = await skillsManager.bootstrap()
      const settings = await settingsStore.read()
      const report = await skillsManager.scan([])
      const takeoverPlatforms = options.takeoverExternalLink
        ? newPlatforms
        : options.json || options.yes ? [] : await chooseExternalLinkTakeovers(newPlatforms)
      const plan = await skillsManager.planOnboarding({
        platforms: [],
        detectionFingerprint: report.fingerprint,
        settingsRevision: settings.revision,
        decisions: [],
        mode: 'connect',
        configurationStrategy: 'preserve',
        linkPlatforms: newPlatforms,
        takeoverPlatforms,
        linkCustomRoots: newDirectories,
      })
      if (!options.json) render(<RootLinkPlanView plan={plan} locale={activeLocale} />)
      if (!await authorizeWrite(options, plan, 'linkConfirm')) {
        if (!options.json && process.stdin.isTTY) render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
        return
      }
      const latestSettings = await settingsStore.read()
      batchReceipt = await skillsManager.applyOnboarding(plan, latestSettings.revision, consentFor(plan))
      results.push(...batchReceipt.platformResults.map((result) => ({
        platform: result.platform,
        status: result.status === 'rolled-back' ? 'failed' as const : result.status,
        ...(plan.platformOperations.find(operation => operation.platform === result.platform)?.action === 'keep-external' ? { externalPreserved: true } : {}),
        ...(result.warnings.length ? { error: result.warnings.join('; ') } : {}),
      })))
    }

    const payload = { results, directoryResults, ...(batchReceipt ? { batchReceipt } : {}) }
    if (options.json) console.log(JSON.stringify(payload, null, 2))
    else render(<PlatformLinkResultsView results={results} directoryResults={directoryResults} batchReceipt={batchReceipt} locale={activeLocale} title={t(activeLocale, 'linkResult')} action="link" />)
  })

/** Skills 取消软链命令选项。 */
interface SkillsUnlinkOptions extends SkillsWriteOptions {
  /** 要停用软链的平台参数。 */
  platform: string[]
  /** 要取消软链绑定的自定义文件夹。 */
  directory: string[]
}

skills
  .command('unlink')
  .description(t(activeLocale, 'unlinkDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .option('-y, --yes', t(activeLocale, 'yesDescription'))
  .option('-p, --platform <platform>', t(activeLocale, 'platformsArgument'), collectPlatform, [])
  .option('-d, --directory <path>', t(activeLocale, 'linkDirectoryDescription'), collectDirectory, [])
  .action(async (options: SkillsUnlinkOptions) => {
    const bootstrap = await skillsManager.bootstrap()
    if (!bootstrap.initialized) throw new Error(t(activeLocale, 'skillsNotInitialized'))
    let platforms: SkillPlatformId[]
    if (options.platform.length) platforms = parseSkillPlatforms(options.platform)
    else if (options.directory.length) platforms = []
    else if (process.stdin.isTTY && !options.json) {
      const promptedPlatforms = await choosePlatforms(activeLocale, 'link')
      if (!promptedPlatforms) {
        render(<NoticeView title={t(activeLocale, 'skillsTitle')} message={t(activeLocale, 'cancelled')} />)
        return
      }
      platforms = promptedPlatforms
    }
    else throw new Error(t(activeLocale, 'platformWriteRequired'))

    const results: CliPlatformLinkResult[] = []
    for (const platform of platforms) {
      const execution = await executePlatformLinkAction(platform, 'suspend', options)
      if (execution.cancelled) return
      if (execution.result) results.push(execution.result)
    }
    const latestBootstrap = await skillsManager.bootstrap()
    const customBindings = new Map(latestBootstrap.customLinkBindings.map((binding) => [binding.path, binding]))
    const directoryResults: CliDirectoryLinkResult[] = []
    for (const path of [...new Set(options.directory.map((directory) => resolve(directory)))]) {
      const binding = customBindings.get(path)
      if (!binding) {
        directoryResults.push({ name: basename(path), path, status: 'skipped' })
        continue
      }
      const execution = await executeCustomLinkAction(binding.id, 'suspend', options)
      if (execution.cancelled) return
      if (execution.result) directoryResults.push(execution.result)
    }
    if (options.json) console.log(JSON.stringify({ results, directoryResults }, null, 2))
    else render(<PlatformLinkResultsView results={results} directoryResults={directoryResults} locale={activeLocale} title={t(activeLocale, 'unlinkResult')} action="unlink" />)
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

/** 已有 Skill 范围迁移选项。 */
interface SkillsScopeOptions extends SkillsWriteOptions {
  /** 是否迁移到本地专属范围。 */
  local?: boolean
  /** 是否迁移到共享范围。 */
  shared?: boolean
}

skills
  .command('scope')
  .argument('<skill-name>')
  .description(t(activeLocale, 'scopeDescription'))
  .option('--local', t(activeLocale, 'scopeLocalDescription'))
  .option('--shared', t(activeLocale, 'scopeSharedDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .option('-y, --yes', t(activeLocale, 'yesDescription'))
  .action(async (skillName: string, options: SkillsScopeOptions) => {
    if (Boolean(options.local) === Boolean(options.shared)) throw new Error(t(activeLocale, 'scopeRequired'))
    const bootstrap = await skillsManager.bootstrap()
    const targetScope = options.local ? 'local' as const : 'shared' as const
    const record = targetScope === 'local'
      ? bootstrap.managedSkills.find(skill => skill.kind !== 'system' && skill.name === skillName)
      : bootstrap.localSkills.find(skill => skill.name === skillName)
    if (!record) throw new Error(`${skillName}: ${t(activeLocale, targetScope === 'local' ? 'scopeLocalDescription' : 'scopeSharedDescription')}`)
    const plan: LocalSkillMigrationPlan = await skillsManager.planLocalSkillMigration(record.id, targetScope)
    if (!options.json) render(<NoticeView title={t(activeLocale, 'scopePlan')} message={`${plan.sourcePath} → ${plan.destinationPath}\n${t(activeLocale, 'planHash')} ${plan.hash}`} />)
    if (!await authorizeWrite(options, plan)) return
    const receipt = await skillsManager.applyLocalSkillMigration(plan, consentFor(plan))
    if (options.json) console.log(JSON.stringify(receipt, null, 2))
    else render(<NoticeView title={t(activeLocale, 'scopeResult')} message={`${skillName} → ${targetScope === 'local' ? t(activeLocale, 'localScope') : t(activeLocale, 'sharedScope')}`} />)
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

/** 启动 UI 服务，并把端口占用转换为稳定的人类或 JSON 输出。 */
async function startUiWithPortFeedback(options: Parameters<typeof startUi>[0], json = false): Promise<Awaited<ReturnType<typeof startUi>> | null> {
  try {
    return await startUi(options)
  } catch (error) {
    const portError = error as { name?: string; message?: string; port?: number }
    if (portError.name !== 'UiPortInUseError') throw error
    const payload = { error: { code: 'UI_PORT_IN_USE', message: portError.message, port: portError.port } }
    if (json) console.log(JSON.stringify(payload, null, 2))
    else render(<NoticeView title={t(activeLocale, 'localUi')} message={portError.message ?? ''} />)
    process.exitCode = 1
    return null
  }
}

const ui = program
  .command('ui')
  .description(t(activeLocale, 'uiDescription'))
  .option('-p, --port <port>', t(activeLocale, 'portDescription'))

ui
  .action(async ({ port }: { port?: string }) => {
    const activeSession = await readUiSession()
    if (activeSession) {
      render(<NoticeView title={t(activeLocale, 'localUi')} message={`${t(activeLocale, 'uiAlreadyRunning')}: http://127.0.0.1:${activeSession.port}`} />)
      return
    }
    const parsedPort = parseUiPort(port)
    const server = await startUiWithPortFeedback(parsedPort === undefined ? {} : { port: parsedPort })
    if (!server) return
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
  .option('--json', t(activeLocale, 'jsonDescription'))
  .addHelpText('after', `\n  -p, --port <port>  ${t(activeLocale, 'portDescription')}`)
  .action(async ({ json }: { json?: boolean }, command: Command) => {
    const { port } = command.parent?.opts() as { port?: string }
    const activeSession = await readUiSession()
    if (activeSession) {
      const result = { running: true, pid: activeSession.pid, port: activeSession.port, url: `http://127.0.0.1:${activeSession.port}` }
      console.log(json ? JSON.stringify(result, null, 2) : `${t(activeLocale, 'uiAlreadyRunning')}: ${terminalUrl(result.url)}`)
      return
    }
    const parsedPort = parseUiPort(port)
    const server = await startUiWithPortFeedback({ ...(parsedPort === undefined ? {} : { port: parsedPort }), detached: true }, Boolean(json))
    if (!server) return
    const session = await readUiSession()
    const result = { running: true, pid: session?.pid, port: session?.port, url: server.url }
    console.log(json ? JSON.stringify(result, null, 2) : `${t(activeLocale, 'uiStarted')}: ${terminalUrl(server.url)}`)
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
    console.log(json ? JSON.stringify(result, null, 2) : session ? `${t(activeLocale, 'uiRunning')}: ${terminalUrl(`http://127.0.0.1:${session.port}`)}` : t(activeLocale, 'uiNotRunning'))
  })

ui
  .command('restart')
  .description(t(activeLocale, 'uiRestartDescription'))
  .option('--json', t(activeLocale, 'jsonDescription'))
  .addHelpText('after', `\n  -p, --port <port>  ${t(activeLocale, 'portDescription')}`)
  .action(async ({ json }: { json?: boolean }, command: Command) => {
    const { port } = command.parent?.opts() as { port?: string }
    const activeSession = await readUiSession()
    await stopUi()
    const parsedPort = parseUiPort(port)
    const restartPort = parsedPort ?? activeSession?.port
    const server = await startUiWithPortFeedback({ ...(restartPort === undefined ? {} : { port: restartPort }), detached: true }, Boolean(json))
    if (!server) return
    const session = await readUiSession()
    const result = { running: true, pid: session?.pid, port: session?.port, url: server.url }
    console.log(json ? JSON.stringify(result, null, 2) : `${t(activeLocale, 'uiStarted')}: ${terminalUrl(server.url)}`)
  })

ui
  .command('token')
  .description(t(activeLocale, 'tokenDescription'))
  .action(async () => {
    const developmentToken = 'askx-local-dev'
    const printDevelopmentToken = async (): Promise<boolean> => {
      try {
        const response = await fetch(`http://127.0.0.1:4242/api/health?token=${developmentToken}`)
        if (response.ok) {
          const quickUrl = `http://127.0.0.1:4242/?token=${developmentToken}`
          console.log(`${t(activeLocale, 'tokenUrl')}: ${terminalUrl(quickUrl)}`)
          console.log(`${t(activeLocale, 'tokenValue')}: ${developmentToken}`)
          return true
        }
      } catch {
        // 开发服务未运行时继续检查安装版后台服务。
      }
      return false
    }

    if (resolveUiTokenServicePreference() === 'development' && await printDevelopmentToken()) return
    const activeSession = await readUiSession()
    if (activeSession) {
      const quickUrl = `http://127.0.0.1:${activeSession.port}/?token=${encodeURIComponent(activeSession.token)}`
      console.log(`${t(activeLocale, 'tokenUrl')}: ${terminalUrl(quickUrl)}`)
      console.log(`${t(activeLocale, 'tokenValue')}: ${activeSession.token}`)
      return
    }
    if (await printDevelopmentToken()) return
    throw new Error(t(activeLocale, 'noToken'))
  })

program
  .command('uninstall')
  .description(t(activeLocale, 'uninstallDescription'))
  .action(async () => {
    const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const installRecord = await readInstallRecord(defaultContext().dataDir)
    const recordedPackageManager = installRecord && resolve(installRecord.packageDirectory) === packageDirectory
      ? installRecord.packageManager
      : undefined
    const packageManager = recordedPackageManager ?? packageManagerFromInstallPath(packageDirectory)
    if (!packageManager) throw new Error(t(activeLocale, 'uninstallSourceOnly'))
    await stopUi()
    const invocation = createUninstallInvocation(packageManager)
    const child = spawn(invocation.command, invocation.args, {
      stdio: 'inherit',
      windowsHide: true,
    })
    const [code] = await once(child, 'exit')
    if (code !== 0) throw new Error(`${t(activeLocale, 'uninstallFailed')} (${code ?? 1})`)
  })

await program.parseAsync()
