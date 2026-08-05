import { expect, test } from '@playwright/test'

/** 统计接口返回的最小性能夹具。 */
const statsFixture = {
  revision: 4,
  updatedAt: '2026-08-05T00:00:00.000Z',
  totalSkills: 1,
  totalUsage: 3,
  totalTargets: 1,
  issueTargets: 0,
  versions: { '26.805.1': 1 },
  targetStatuses: { linked: 1 },
  management: {
    managed: [{ recordId: '10000000-0000-4000-8000-000000000001', name: 'demo-skill', scope: 'shared', path: '/tmp/.askx/skills/demo-skill', state: 'askx-managed', managed: true, registryRegistered: true, version: '26.805.1', managerSkillId: 'skill_26_805_0123456789', canManage: false, canRemove: true }],
    unmanaged: [],
  },
  items: [{
    skillId: 'skill_26_805_0123456789',
    name: 'demo-skill',
    version: '26.805.1',
    usageCount: 3,
    targetCount: 1,
    issueCount: 0,
    targets: [{ key: 'platform:claude', kind: 'platform', path: '/tmp/.claude/skills', status: 'linked' }],
  }],
}

/** 为 Skills 统计页面安装不触碰本机目录的只读 API 夹具。 */
async function installSkillsFixtures(page: import('@playwright/test').Page): Promise<{ statsRequests: () => number }> {
  let statsRequestCount = 0
  const platform = {
    id: 'claude',
    name: 'Claude Code',
    skillsDir: '/tmp/.claude/skills',
    installed: true,
    skillsDirExists: true,
    linkSupported: true,
    notes: [],
  }
  await page.route('**/api/settings', route => route.fulfill({ json: {
    version: 1,
    revision: 1,
    updatedAt: '2026-08-05T00:00:00.000Z',
    updatedBy: 'system',
    locale: 'zh-CN',
    themeColor: 'cyan',
    skills: { backupBeforeLink: true, platforms: ['claude'] },
  } }))
  await page.route('**/api/skills/bootstrap', route => route.fulfill({ json: {
    initialized: true,
    manifestRevision: 2,
    canonicalSkillsDir: '/tmp/.askx/skills',
    localSkillsDir: '/tmp/.askx/local-skills',
    systemSkillHealth: 'ready',
    platforms: [platform],
    managedSkills: [],
    localSkills: [],
    managedHealth: [],
    customRoots: [],
    platformBindings: [],
    customLinkBindings: [],
    platformHealth: [{ platform: 'claude', status: 'pending', connected: false, issues: [] }],
  } }))
  await page.route('**/api/skills/scan', route => route.fulfill({ json: {
    scannedAt: '2026-08-05T00:00:00.000Z',
    platforms: ['claude'],
    platformStatuses: [platform],
    customRoots: [],
    locations: [],
    groups: [],
    fingerprint: 'fixture',
  } }))
  await page.route('**/api/skills/history', route => route.fulfill({ json: [] }))
  await page.route('**/api/skills/stats', async (route) => {
    statsRequestCount += 1
    await route.fulfill({ json: statsFixture })
  })
  return { statsRequests: () => statsRequestCount }
}

test('统计明细保持懒加载，重复切换不会重复请求或持续增长内存', async ({ page }) => {
  const fixture = await installSkillsFixtures(page)
  await page.goto('/skills-x?token=askx-local-dev')
  await expect(page.getByRole('tab', { name: /共享 Skills/u })).toBeVisible()
  expect(fixture.statsRequests()).toBe(0)

  await page.requestGC()
  const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
  await page.getByRole('tab', { name: '统计' }).click()
  await expect(page.getByText('26.805.1 · 1')).toBeVisible()
  expect(fixture.statsRequests()).toBe(1)

  for (let index = 0; index < 20; index += 1) {
    await page.getByRole('tab', { name: /共享 Skills/u }).click()
    await page.getByRole('tab', { name: '统计' }).click()
  }
  await page.requestGC()
  const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)

  expect(fixture.statsRequests()).toBe(1)
  if (heapBefore > 0 && heapAfter > 0) expect(heapAfter - heapBefore).toBeLessThan(8 * 1024 * 1024)
})
