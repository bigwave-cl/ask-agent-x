import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/** 浏览器侧性能采样状态。 */
interface PerformanceWindow extends Window {
  /** 超过 50ms 的主线程长任务。 */
  __askxLongTasks: number[]
}

/**
 * 安装主线程长任务采样器。
 *
 * @param page 当前浏览器页面。
 */
async function installLongTaskObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const performanceWindow = window as PerformanceWindow
    performanceWindow.__askxLongTasks = []
    if (!('PerformanceObserver' in window)) return
    const observer = new PerformanceObserver((list) => {
      performanceWindow.__askxLongTasks.push(...list.getEntries().map(entry => entry.duration))
    })
    observer.observe({ type: 'longtask', buffered: true })
  })
}

/**
 * 打开 MDC 示例并等待编辑器完成第一次异步高亮。
 *
 * @param page 当前浏览器页面。
 */
async function openMdcEditor(page: Page): Promise<void> {
  await page.goto('/demo?module=components&secKey=components-mdc-render')
  const editor = page.locator('[data-testid="mdc-render-demo"] .code-editor').first()
  await expect(editor).toBeVisible()
  await expect(editor).toHaveAttribute('data-highlight-status', 'ready')
}

test('首次页面不创建 Worker，展开后只加载所需语法', async ({ page }) => {
  /** 高亮运行时相关网络请求。 */
  const highlightRequests: string[] = []
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (/codeHighlight\.worker|\/(?:bash|css|javascript|json|markdown|scss|typescript|xml|yaml)-/u.test(pathname)) {
      highlightRequests.push(pathname)
    }
  })

  await page.goto('/demo?module=components')
  await expect(page.locator('[data-demo-section="components-button"]')).toBeVisible()
  await page.waitForTimeout(500)
  expect(page.workers()).toHaveLength(0)
  expect(highlightRequests).toHaveLength(0)

  await page.locator('[data-demo-section="components-mdc-render"] > button').click()
  const editor = page.locator('[data-testid="mdc-render-demo"] .code-editor').first()
  await expect(editor).toHaveAttribute('data-highlight-status', 'ready')
  expect(page.workers()).toHaveLength(1)
  expect(highlightRequests.filter(path => path.includes('codeHighlight.worker'))).toHaveLength(1)
  expect(highlightRequests.filter(path => path.includes('/markdown-'))).toHaveLength(1)
  expect(highlightRequests.some(path => /\/(?:bash|css|javascript|json|scss|typescript|xml|yaml)-/u.test(path))).toBe(false)

  const textarea = editor.locator('textarea')
  const syntaxFixtures = [
    { language: 'yaml', source: 'name: askx\nenabled: true' },
    { language: 'sh', resolvedLanguage: 'bash', source: 'export ASKX_ENV="local"\necho "$ASKX_ENV"' },
    { language: 'json', source: '{"name":"askx","enabled":true}' },
  ]

  for (const fixture of syntaxFixtures) {
    await test.step(`异步加载 ${fixture.language} 语法`, async () => {
      const resolvedLanguage = fixture.resolvedLanguage ?? fixture.language
      await textarea.fill(`\`\`\`${fixture.language}\n${fixture.source}\n\`\`\``)
      const codeBlock = page.locator(`[data-testid="mdc-render-demo"] .mdc-render-code pre[data-language="${resolvedLanguage}"]`)
      await expect(codeBlock).toBeAttached()
      await codeBlock.scrollIntoViewIfNeeded()
      const highlightedTokens = codeBlock.locator('code > span[class*="hljs-"]')
      await expect.poll(() => highlightedTokens.count()).toBeGreaterThan(0)
    })
  }

  expect(page.workers()).toHaveLength(1)
  expect(highlightRequests.filter(path => path.includes('/yaml-'))).toHaveLength(1)
  expect(highlightRequests.filter(path => path.includes('/bash-'))).toHaveLength(1)
  expect(highlightRequests.filter(path => path.includes('/json-'))).toHaveLength(1)
})

test('连续输入保持单 Worker、稳定帧耗时并在卸载后回收', async ({ page }, testInfo) => {
  await installLongTaskObserver(page)
  await openMdcEditor(page)

  const editor = page.locator('[data-testid="mdc-render-demo"] .code-editor').first()
  const textarea = editor.locator('textarea')
  await page.evaluate(() => {
    (window as PerformanceWindow).__askxLongTasks = []
  })
  /** 预热后输入到下一帧的延迟样本。 */
  const interactionDurations = await textarea.evaluate(async (element) => {
    const input = element as HTMLTextAreaElement
    const inputSamples: number[] = []
    const frameSamples: number[] = []
    const base = '# 性能测试\n\n' + '- Worker 异步高亮\n'.repeat(600)

    for (let index = 0; index < 40; index += 1) {
      const startedAt = performance.now()
      input.value = `${base}\n${index}`
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(index), inputType: 'insertText' }))
      inputSamples.push(performance.now() - startedAt)
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      frameSamples.push(performance.now() - startedAt)
    }

    return { inputSamples, frameSamples }
  })

  await page.waitForTimeout(500)
  await expect(editor).toHaveAttribute('data-highlight-status', 'ready')
  expect(page.workers()).toHaveLength(1)

  /** 去除首次样本后计算 P95 帧延迟。 */
  const stableInputDurations = interactionDurations.inputSamples.slice(3).sort((left, right) => left - right)
  const stableFrameDurations = interactionDurations.frameSamples.slice(3).sort((left, right) => left - right)
  const p95InputIndex = Math.min(stableInputDurations.length - 1, Math.ceil(stableInputDurations.length * 0.95) - 1)
  const p95FrameIndex = Math.min(stableFrameDurations.length - 1, Math.ceil(stableFrameDurations.length * 0.95) - 1)
  const p95InputDuration = stableInputDurations[p95InputIndex] ?? 0
  const p95FrameDuration = stableFrameDurations[p95FrameIndex] ?? 0
  /** 连续输入期间的长任务。 */
  const longTasks = await page.evaluate(() => (window as PerformanceWindow).__askxLongTasks)

  expect(p95InputDuration).toBeLessThan(16)
  expect(p95FrameDuration).toBeLessThan(32)
  expect(longTasks.filter(duration => duration >= 50)).toHaveLength(0)

  await page.requestGC()
  /** 压力测试前页面堆内存。 */
  const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
  await page.evaluate(() => {
    (window as PerformanceWindow).__askxLongTasks = []
  })

  await textarea.evaluate(async (element) => {
    const input = element as HTMLTextAreaElement
    const body = 'const stable = true\n'.repeat(800)

    for (let index = 0; index < 60; index += 1) {
      input.value = `## 第 ${index} 次更新\n\n${body}`
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(index), inputType: 'insertText' }))
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
  })
  await page.waitForTimeout(600)
  await page.requestGC()
  /** 压力测试后页面堆内存。 */
  const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
  /** 压力更新期间的长任务。 */
  const stressLongTasks = await page.evaluate(() => (window as PerformanceWindow).__askxLongTasks)

  if (heapBefore > 0 && heapAfter > 0) expect(heapAfter - heapBefore).toBeLessThan(16 * 1024 * 1024)
  expect(stressLongTasks.filter(duration => duration >= 50)).toHaveLength(0)

  const performanceMetrics = { p95InputDuration, p95FrameDuration, longTasks, stressLongTasks, heapBefore, heapAfter }
  console.info(`[highlight performance] ${JSON.stringify(performanceMetrics)}`)

  await testInfo.attach('highlight-performance.json', {
    body: JSON.stringify(performanceMetrics, null, 2),
    contentType: 'application/json',
  })

  await page.locator('[data-demo-section="components-mdc-render"] > button').click()
  await expect.poll(() => page.workers().length).toBe(0)
})
