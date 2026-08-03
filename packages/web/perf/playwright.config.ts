import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.performance.spec.ts',
  outputDir: '.nuxt/playwright-test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4252',
    browserName: 'chromium',
    headless: true,
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'pnpm preview:performance',
    url: 'http://127.0.0.1:4252/demo?module=overview',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
