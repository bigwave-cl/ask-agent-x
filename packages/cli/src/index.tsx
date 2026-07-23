#!/usr/bin/env node
import { defaultContext, ModuleRegistry, type AskXModule, type DetectionIssue } from '@askx/core'
import { SkillsModule, type SkillsTopology } from '@askx/module-skills'
import { detectPlatforms, type PlatformDetection } from '@askx/platform-adapters'
import { startUi } from '@askx/web/server'
import { Command } from 'commander'
import { Box, render, Text } from 'ink'
import type { ReactNode } from 'react'

const accent = '#d7ff3f'
const registry = new ModuleRegistry()
registry.register(new SkillsModule())

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

function State({ value }: { value: 'ready' | 'blocked' | 'not found' | 'ok' | 'warning' }) {
  const color = value === 'ready' || value === 'ok' ? 'green' : value === 'blocked' || value === 'warning' ? 'yellow' : 'gray'
  return <Text color={color}>● {value}</Text>
}

function ModulesView({ modules }: { modules: AskXModule[] }) {
  return (
    <Frame title="built-in modules">
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

function DoctorView({ detections }: { detections: PlatformDetection[] }) {
  return (
    <Frame title="doctor">
      {detections.map((platform) => {
        const state = platform.installed ? (platform.linkSupported ? 'ready' : 'blocked') : 'not found'
        return (
          <Box key={platform.id} flexDirection="column" marginBottom={1}>
            <Box gap={2}>
              <Text bold>{platform.name.padEnd(16)}</Text>
              <State value={state} />
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

function IssueList({ issues }: { issues: DetectionIssue[] }) {
  if (!issues.length) return <Text color="green">No topology issues detected.</Text>
  return (
    <Box flexDirection="column" marginTop={1}>
      {issues.map((issue) => <Text key={`${issue.code}:${issue.path ?? issue.message}`} color="yellow">! {issue.message}{issue.path ? ` (${issue.path})` : ''}</Text>)}
    </Box>
  )
}

function SkillsScanView({ topology, issues, status }: { topology: SkillsTopology; issues: DetectionIssue[]; status: 'ok' | 'warning' | 'blocked' }) {
  return (
    <Frame title="skills scan">
      <Box marginBottom={1} gap={1}><Text>Status</Text><State value={status} /></Box>
      {topology.roots.map((root) => (
        <Box key={root.path} gap={1}>
          <Text color={root.exists ? 'green' : 'gray'}>{root.exists ? '✓' : '·'}</Text>
          <Text bold>{root.platform.padEnd(8)}</Text>
          <Text dimColor>{root.path}</Text>
        </Box>
      ))}
      <Box marginTop={1} gap={2}>
        <Text><Text color={accent}>{topology.skills.length}</Text> Skills</Text>
        <Text><Text color={topology.conflicts.length ? 'yellow' : 'green'}>{topology.conflicts.length}</Text> conflicts</Text>
        <Text><Text color={topology.brokenLinks.length ? 'red' : 'green'}>{topology.brokenLinks.length}</Text> broken links</Text>
      </Box>
      <IssueList issues={issues} />
    </Frame>
  )
}

function StatusView({ status, issues, fingerprint }: { status: 'ok' | 'warning' | 'blocked'; issues: DetectionIssue[]; fingerprint: string }) {
  return (
    <Frame title="skills status">
      <Box gap={1}><Text>Status</Text><State value={status} /></Box>
      <Text dimColor>Fingerprint  {fingerprint.slice(0, 16)}…</Text>
      <IssueList issues={issues} />
    </Frame>
  )
}

function NoticeView({ title, message }: { title: string; message: string }) {
  return <Frame title={title}><Text color="yellow">◆ {message}</Text></Frame>
}

function UiView({ url }: { url: string }) {
  return (
    <Frame title="local ui">
      <Text color="green">● Nuxt server ready</Text>
      <Text>{url}</Text>
      <Text dimColor>Press Ctrl+C to stop.</Text>
    </Frame>
  )
}

const program = new Command()
program.name('askx').description('Extend every agent. Keep control.').version('0.1.0')

const modules = program.command('modules').description('Inspect built-in AskAgent X modules')
modules.command('list').action(() => {
  render(<ModulesView modules={registry.list()} />)
})

program
  .command('doctor')
  .description('Detect Agent installations, paths, versions and link eligibility')
  .option('--json', 'Print machine-readable JSON')
  .action(async ({ json }: { json?: boolean }) => {
    const detections = await detectPlatforms()
    if (json) console.log(JSON.stringify(detections, null, 2))
    else render(<DoctorView detections={detections} />)
  })

const skills = program.command('skills').description('Inspect and manage Skills topology')
skills
  .command('scan')
  .description('Read-only scan of all known Skill roots')
  .option('--json', 'Print machine-readable JSON')
  .action(async ({ json }: { json?: boolean }) => {
    const report = await registry.get('skills').detect(defaultContext())
    if (json) console.log(JSON.stringify(report, null, 2))
    else render(<SkillsScanView topology={report.data as SkillsTopology} issues={report.issues} status={report.status} />)
  })

skills.command('status').description('Show current read-only Skills status').action(async () => {
  const report = await registry.get('skills').detect(defaultContext())
  render(<StatusView status={report.status} issues={report.issues} fingerprint={report.fingerprint} />)
})

function unavailable(command: Command): void {
  command.action(() => {
    render(<NoticeView title={command.name()} message="Write operations are intentionally locked in the foundation release." />)
    process.exitCode = 2
  })
}

for (const name of ['sync', 'link', 'unlink', 'update']) {
  unavailable(skills.command(name).description(`${name} Skills (foundation placeholder)`))
}
const backups = skills.command('backups').description('Manage Skills backups')
for (const name of ['list', 'restore', 'remove']) unavailable(backups.command(name))

program
  .command('ui')
  .description('Start the local Nuxt management interface')
  .option('-p, --port <port>', 'Local port', '4242')
  .action(async ({ port }: { port: string }) => {
    const parsedPort = Number.parseInt(port, 10)
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) throw new Error(`Invalid port: ${port}`)
    const server = await startUi({ port: parsedPort })
    const ink = render(<UiView url={server.url} />)
    const close = async () => {
      ink.unmount()
      await server.close()
      process.exit(0)
    }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
  })

await program.parseAsync()
