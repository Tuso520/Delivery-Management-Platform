import { defineConfig } from '@playwright/test'

const webBaseUrl = process.env.PLAYWRIGHT_WEB_BASE_URL?.trim().replace(/\/+$/, '')
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL?.trim() || 'chrome'

if (!webBaseUrl) {
  throw new Error(
    'PLAYWRIGHT_WEB_BASE_URL is required and must point to the running web application',
  )
}

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  // This scenario intentionally crosses several lazy-loaded routes and real
  // MySQL-backed pages. Keep per-action and per-navigation limits strict, but
  // allow the complete end-to-end journey to finish on constrained CI runners.
  timeout: 300_000,
  use: {
    baseURL: webBaseUrl,
    browserName: 'chromium',
    channel: browserChannel,
    locale: 'zh-CN',
    actionTimeout: 20_000,
    navigationTimeout: 40_000,
    trace: 'retain-on-failure',
  },
})
