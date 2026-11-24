import { mkdtemp, mkdir, symlink, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { BridgeProjectService } from './project-service.js'

describe('BridgeProjectService', () => {
  it('expands roots and deduplicates real paths across project pages', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'askx-project-test-'))
    try {
      const root = join(await realpath(directory), 'root')
      const alias = join(directory, 'alias')
      await mkdir(root)
      await symlink(root, alias)
      const calls: unknown[] = []
      const service = new BridgeProjectService({ request: async (_method, params) => {
        if (_method === 'project/read') return { project: { roots: [{ path: root }] } }
        calls.push(params)
        return params?.cursor ? { data: [{ id: 'p2', name: 'Other', roots: [{ path: alias }], updatedAt: 1767225600 }], nextCursor: null } : { data: [{ id: 'p1', name: 'Demo', roots: [{ path: root }, { path: alias }], updatedAt: 1767225600 }] , nextCursor: 'next' }
      } })
      expect(await service.listProjects()).toEqual([{ path: root, name: 'Demo', projectId: 'p1', updatedAt: '2026-01-01T00:00:00.000Z' }])
      expect(calls).toHaveLength(2)
      expect((await service.requireProject(alias)).path).toBe(root)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('normalizes Codex project updatedAt from Unix seconds and tolerates old responses', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'askx-project-time-test-'))
    try {
      const service = new BridgeProjectService({ request: async method => method === 'project/list'
        ? { data: [{ id: 'with-time', name: 'With time', roots: [{ path: directory }], updatedAt: 1767225600 }, { id: 'without-time', name: 'Without time', roots: [{ path: directory + '-missing' }] }], nextCursor: null }
        : {} })
      expect(await service.listProjects()).toEqual([{ path: await realpath(directory), name: 'With time', projectId: 'with-time', updatedAt: '2026-01-01T00:00:00.000Z' }])
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('rejects missing directories before any create request', async () => {
    const methods: string[] = []
    const service = new BridgeProjectService({ request: async method => { methods.push(method); return {} } })
    await expect(service.createProject('/tmp/askx-missing-project-directory-9c192')).rejects.toThrow()
    expect(methods).toEqual([])
  })
})
