import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'

const adminUsername = process.env.E2E_ADMIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const acceptanceScreenshot = resolve(
  process.cwd(),
  '../.ai-work/acceptance-standard-library-1440x900.png',
)

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

test('standard library matches Figma node 70:322 geometry and real configured content', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  browserErrors.length = 0
  await page.goto('/#/standards')

  const root = page.locator('.standard-library')
  const panel = page.locator('.library-panel')
  const table = page.locator('.standard-table')
  await expect(root).toBeVisible()
  await expect(page.locator('.category-list button').first()).toBeVisible({ timeout: 60_000 })
  await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 60_000 })

  await expect(page.locator('.metrics .metric')).toHaveCount(3)
  await expect(page.locator('.metric__icon img')).toHaveCount(3)
  await expect(page.locator('.category-tabs button')).toHaveText(['交付阶段', '管理领域'])
  await expect(table.locator('thead th')).toHaveText([
    '资料标题',
    '当前版本',
    '生效日期',
    '更新人',
    '操作',
  ])
  await expect(page.locator('.arco-pagination')).toHaveCount(0)

  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector)
      if (!node) throw new Error(`Missing ${selector}`)
      const box = node.getBoundingClientRect()
      return { width: box.width, height: box.height }
    }
    const headerWidths = Array.from(
      document.querySelectorAll<HTMLElement>('.standard-table thead th'),
    ).map((node) => node.getBoundingClientRect().width)
    const bodyWidths = Array.from(
      document.querySelectorAll<HTMLElement>('.standard-table tbody tr:first-child td'),
    ).map((node) => node.getBoundingClientRect().width)
    const rowHeights = Array.from(
      document.querySelectorAll<HTMLElement>('.standard-table tr'),
    ).map((node) => node.getBoundingClientRect().height)

    return {
      categoryDescription: rect('.category-description'),
      categoryRow: rect('.category-list button'),
      contentPanel: rect('.content-panel'),
      headerWidths,
      bodyWidths,
      libraryPanel: rect('.library-panel'),
      metric: rect('.metric'),
      metrics: rect('.metrics'),
      rowHeights,
      sidebar: rect('.category-sidebar'),
      tabs: rect('.category-tabs'),
      toolbar: rect('.toolbar'),
    }
  })

  expect(geometry.metrics.height).toBe(88)
  expect(geometry.metric.height).toBe(76)
  expect(geometry.toolbar.height).toBe(32)
  expect(geometry.libraryPanel.height).toBe(625)
  expect(geometry.sidebar.width).toBe(270)
  expect(geometry.tabs.height).toBe(44)
  expect(geometry.categoryRow.height).toBe(44)
  expect(geometry.categoryDescription.height).toBe(80)
  expect(geometry.contentPanel.width).toBeGreaterThanOrEqual(937)
  expect(geometry.headerWidths).toEqual([365, 90, 130, 170, 182])
  expect(geometry.bodyWidths).toEqual(geometry.headerWidths)
  expect(geometry.rowHeights.every((height) => height === 44)).toBe(true)

  await expect(page.locator('.category-description h1')).not.toHaveText('-')
  await expect(page.locator('.category-description p')).not.toHaveText('')
  await expect(table.locator('tbody tr').first().locator('td').nth(0)).not.toHaveText('')
  await expect(table.locator('tbody tr').first().locator('td').nth(1)).not.toHaveText('')
  await expect(panel).toHaveCSS('border-top-width', '1px')
  await root.screenshot({ path: acceptanceScreenshot })

  const keyword = '项目启动会纪要模板'
  const filteredResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.pathname === '/api/v1/standards' &&
      url.searchParams.get('keyword') === keyword &&
      response.status() === 200
    )
  })
  await page.locator('.keyword-input input').fill(keyword)
  await page.getByRole('button', { name: '查询' }).click()
  await filteredResponse
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table.locator('tbody tr').first()).toContainText(keyword)

  await page.locator('.keyword-input input').clear()
  await page.getByRole('button', { name: '查询' }).click()
  await expect(table.locator('tbody tr').first()).toBeVisible()
  await page.locator('.category-tabs button').nth(1).click()
  await expect(page.locator('.category-tabs button').nth(1)).toHaveClass(/active/u)
  await expect(page.locator('.category-description h1')).not.toHaveText('-')
  await page.locator('.category-tabs button').nth(0).click()
  await expect(page.locator('.category-tabs button').nth(0)).toHaveClass(/active/u)

  await table.locator('.title-cell button').first().click()
  await expect(page.locator('.arco-drawer')).toBeVisible()
  await expect(page.locator('.version-section')).toBeVisible()
  await page.locator('.arco-drawer-close-btn').click()
  await page.getByRole('button', { name: '新建' }).click()
  const createModal = page.locator('.arco-modal:visible')
  await expect(createModal).toBeVisible()
  await createModal.locator('.arco-modal-close-btn').click()
  expect(browserErrors).toEqual([])
})
