import { describe, expect, it, vi } from 'vitest'
import { BridgeSessionCatalogService } from './session-catalog.js'
import type { BridgeRelations } from '@askx/core/bridge-relations'

describe('BridgeSessionCatalogService', () => {
    it('groups current and historical sessions without losing old links', async () => {
        const service = new BridgeSessionCatalogService(
            { listProjects: vi.fn(async () => [{ path: '/projects/current', name: 'Current', projectId: 'p1' }, { path: '/projects/old', name: 'Old', projectId: 'p2' }]) } as never,
            { listThreads: vi.fn(async (_cursor: string | undefined, _limit: number, path: string) => ({ threads: path === '/projects/current' ? [{ id: 'thread-current', title: 'Current thread', cwd: path, projectId: 'p1', gitInfo: null, updatedAt: null, createdAt: null }] : [{ id: 'thread-old', title: 'Old thread', cwd: path, projectId: 'p2', gitInfo: null, updatedAt: null, createdAt: null }], nextCursor: null })) } as never,
        )
        const relations = {
            version: 2,
            revision: 7,
            groups: [{ chatId: 'oc_A', name: 'Team A' }],
            projectGroups: [{ chatId: 'oc_A', projectPath: '/projects/current', active: true }, { chatId: 'oc_A', projectPath: '/projects/old', active: false }],
            threadGroups: [{ chatId: 'oc_A', projectPath: '/projects/current', threadId: 'thread-current' }, { chatId: 'oc_A', projectPath: '/projects/old', threadId: 'thread-old' }],
            migrationConflicts: [],
        } satisfies BridgeRelations
        const result = await service.build(relations)
        expect(result.groups[0]?.activeProject?.path).toBe('/projects/current')
        expect(result.groups[0]?.projects.map(item => [item.project.path, item.active, item.sessions.map(session => session.id)])).toEqual([
            ['/projects/current', true, ['thread-current']],
            ['/projects/old', false, ['thread-old']],
        ])
    })
    it('保留不可用项目和会话占位，不读取缺失项目的会话', async () => {
        const listThreads = vi.fn()
        const service = new BridgeSessionCatalogService(
            { listProjects: vi.fn(async () => []) } as never,
            { listThreads } as never,
        )
        const result = await service.build({
            version: 2, revision: 1,
            groups: [{ chatId: 'oc_A', name: 'A' }],
            projectGroups: [{ chatId: 'oc_A', projectPath: '/missing', active: true }],
            threadGroups: [{ chatId: 'oc_A', projectPath: '/missing', threadId: 'old-thread' }],
            migrationConflicts: [],
        })
        expect(listThreads).not.toHaveBeenCalled()
        expect(result.groups[0]?.activeProject).toBeNull()
        expect(result.groups[0]?.projects[0]).toMatchObject({ active: true, available: false, project: { path: '/missing' }, sessions: [{ id: 'old-thread' }] })
    })

})
