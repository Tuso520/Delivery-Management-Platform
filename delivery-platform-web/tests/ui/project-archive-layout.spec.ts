import { expect, test, type Page } from '@playwright/test'

const adminUsername = process.env.E2E_ADMIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD

async function login(page: Page): Promise<void> {
  if (!adminUsername || !adminPassword) throw new Error('UI E2E credentials are required')

  await page.goto('/#/login')
  const fields = page.locator('.login-form input')
  await expect(fields).toHaveCount(2)
  await fields.nth(0).fill(adminUsername)
  await fields.nth(1).fill(adminPassword)
  await page.locator('.login-button').click()
  await page.waitForURL((url) => !url.hash.startsWith('#/login'))
}

test('project archive matches Figma 43:317 geometry and columns', async ({ page }) => {
  await login(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/archive')
  await expect(page.locator('.archive-directory__item').first()).toBeVisible({ timeout: 60_000 })

  const layout = await page.locator('.archive-page').evaluate((root) => {
    const metrics = root.querySelector<HTMLElement>('.archive-metrics')
    const toolbar = root.querySelector<HTMLElement>('.archive-toolbar')
    const workspace = root.querySelector<HTMLElement>('.archive-workspace')
    const directory = root.querySelector<HTMLElement>('.archive-directory')
    const firstDirectoryItem = root.querySelector<HTMLElement>('.archive-directory__item')
    const firstRow = root.querySelector<HTMLElement>('.arco-table-td')
    const headers = [...root.querySelectorAll<HTMLElement>('thead .arco-table-th')]
    if (
      !metrics ||
      !toolbar ||
      !workspace ||
      !directory ||
      !firstDirectoryItem ||
      !firstRow ||
      headers.length !== 6
    ) {
      throw new Error('Project archive layout nodes are incomplete')
    }
    return {
      root: root.getBoundingClientRect().toJSON(),
      metricsHeight: Math.round(metrics.getBoundingClientRect().height),
      toolbarHeight: Math.round(toolbar.getBoundingClientRect().height),
      workspaceHeight: Math.round(workspace.getBoundingClientRect().height),
      directoryWidth: Math.round(directory.getBoundingClientRect().width),
      directoryRowHeight: Math.round(firstDirectoryItem.getBoundingClientRect().height),
      tableRowHeight: Math.round(firstRow.getBoundingClientRect().height),
      headerWidths: headers.map((header) => Math.round(header.getBoundingClientRect().width)),
    }
  })

  expect(layout.root.width).toBe(1234)
  expect(layout.root.height).toBeGreaterThanOrEqual(784)
  expect(layout).toMatchObject({
    metricsHeight: 100,
    toolbarHeight: 32,
    directoryWidth: 270,
    directoryRowHeight: 44,
    tableRowHeight: 44,
    headerWidths: [340, 80, 100, 113, 122, 182],
  })
  expect(layout.workspaceHeight).toBeGreaterThanOrEqual(602)
  await expect(page.getByRole('button', { name: '上传', exact: true })).toBeVisible()
  await expect(page.getByText('同步模板', { exact: true })).toHaveCount(0)
})
