import type { SkillsBatchPlan, SkillsScanReport } from '@askx/module-skills/skill-types'
import { describe, expect, it } from 'vitest'
import { createKeepDecisions, createSafeSyncDecisions, summarizeSkillsBatchPlan } from './skills-command-helpers.js'

/** 创建 CLI 决策测试所需的最小扫描报告。 */
function createReport(): SkillsScanReport {
  const validMetadata = { valid: true, name: 'demo' }
  return {
    scannedAt: '2026-08-04T00:00:00.000Z',
    platforms: ['claude'],
    platformStatuses: [],
    customRoots: [],
    locations: [],
    fingerprint: 'scan-fingerprint',
    groups: [
      {
        id: 'unique',
        name: 'unique',
        hashes: ['one'],
        status: 'unique',
        recommendedAction: 'adopt',
        locations: [{ id: 'unique-source', platform: 'claude', name: 'unique', path: '/tmp/unique', kind: 'directory', contentHash: 'one', managerState: 'unmanaged', metadata: validMetadata, broken: false }],
      },
      {
        id: 'identical',
        name: 'identical',
        hashes: ['two'],
        status: 'identical',
        recommendedAction: 'merge',
        locations: [{ id: 'identical-source', platform: 'claude', name: 'identical', path: '/tmp/identical', kind: 'directory', contentHash: 'two', managerState: 'unmanaged', metadata: validMetadata, broken: false }],
      },
      {
        id: 'conflict',
        name: 'conflict',
        hashes: ['three', 'four'],
        status: 'conflict',
        recommendedAction: 'keep',
        locations: [{ id: 'conflict-source', platform: 'claude', name: 'conflict', path: '/tmp/conflict', kind: 'directory', contentHash: 'three', managerState: 'unmanaged', metadata: validMetadata, broken: false }],
      },
    ],
  }
}

describe('Skills CLI helpers', () => {
  it('只自动接管安全来源并保留冲突', () => {
    const report = createReport()
    expect(createSafeSyncDecisions(report)).toEqual([
      { kind: 'adopt', sourceLocationId: 'unique-source' },
      { kind: 'merge', sourceLocationId: 'identical-source' },
      { kind: 'keep', groupId: 'conflict' },
    ])
    expect(createKeepDecisions(report)).toEqual(report.groups.map((group) => ({ kind: 'keep', groupId: group.id })))
  })

  it('按计划和扫描状态输出确认摘要', () => {
    const report = createReport()
    const plan = {
      units: createSafeSyncDecisions(report).map((decision, index) => ({ id: String(index), skillName: report.groups[index]!.name, decision, operations: [], warnings: [] })),
      platformOperations: [{ kind: 'bind-platform', platform: 'claude', path: '/tmp/skills', target: '/tmp/askx' }],
      customLinkOperations: [],
    } as unknown as SkillsBatchPlan

    expect(summarizeSkillsBatchPlan(plan, report)).toEqual({ total: 3, adopt: 1, merge: 1, keep: 1, conflicts: 1, platformLinks: 1, customLinks: 0 })
  })
})
