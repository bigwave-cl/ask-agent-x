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
        return params?.cursor ? { data: [{ id: 'p2', name: 'Other', roots: [{ path: alias }] }], nextCursor: null } : { data: [{ id: 'p1', name: 'Demo', roots: [{ path: root }, { path: alias }] }], nextCursor: 'next' }
      } })
      expect(await service.listProjects()).toEqual([{ path: root, name: 'Demo', projectId: 'p1' }])
      expect(calls).toHaveLength(2)
      expect((await service.requireProject(alias)).path).toBe(root)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('rejects missing directories before any create request', async () => {
    const methods: string[] = []
    const service = new BridgeProjectService({ request: async method => { methods.push(method); return {} } })
    await expect(service.createProject('/tmp/askx-missing-project-directory-9c192')).rejects.toThrow()
    expect(methods).toEqual([])
  })
})
