import { defineConfig } from '@playwright/test'

const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL?.trim().replace(/\/+$/, '')

if (!apiBaseUrl) {
  throw new Error('PLAYWRIGHT_API_BASE_URL is required and must point to a running real NestJS API')
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 20_000,
  use: {
    baseURL: apiBaseUrl,
    extraHTTPHeaders: { Accept: 'application/json' },
  },
})
