import { expect, test } from '@playwright/test'

test('administrator can render the settings center and Figma field configuration page', async ({ page }) => {
  const username = process.env.E2E_ADMIN_USERNAME
  const password = process.env.E2E_ADMIN_PASSWORD
  if (!username || !password) throw new Error('E2E admin credentials are required')

  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/login')
  await page.locator('input[autocomplete="username"]').fill(username)
  await page.locator('input[autocomplete="current-password"]').fill(password)
  await page.locator('.login-button').click()
  await page.waitForURL((url) => !url.hash.startsWith('#/login'))
  // The anonymous session restore intentionally receives 401 before login.
  browserErrors.length = 0
  await page.evaluate(() => { window.location.hash = '/settings' })
  await page.waitForURL(/#\/settings$/u)

  await expect(page.getByRole('heading', { name: '设置中心' })).toBeVisible()
  await page.evaluate(() => { window.location.hash = '/settings/fields' })
  await page.waitForURL(/#\/settings\/fields$/u)

  const fieldPage = page.locator('.field-config-page')
  await expect(fieldPage).toBeVisible()
  await expect(fieldPage.locator('.category-tab')).toHaveCount(10)
  await expect(fieldPage.getByRole('columnheader', { name: '名称' })).toBeVisible()
  await expect(fieldPage.getByRole('columnheader', { name: '编码' })).toBeVisible()
  await expect(fieldPage.getByRole('columnheader', { name: '状态' })).toBeVisible()
  await fieldPage.getByRole('button', { name: '新增一行' }).click()
  const fieldDialog = page.locator('.arco-modal')
  await expect(fieldDialog).toBeVisible()
  await expect(fieldDialog.getByText('字段名称', { exact: true })).toBeVisible()
  await expect(fieldDialog.getByText('字段编码', { exact: true })).toBeVisible()
  await expect
    .poll(async () => (await fieldDialog.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(574)
  await expect
    .poll(async () => (await fieldDialog.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(586)
  await fieldDialog.getByRole('button', { name: '取消' }).click()

  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))
  expect(overflow.page).toBeLessThanOrEqual(1)
  expect(overflow.body).toBeLessThanOrEqual(1)
  expect(browserErrors).toEqual([])
})
