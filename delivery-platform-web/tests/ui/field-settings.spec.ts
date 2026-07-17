import { expect, test } from '@playwright/test'

test('administrator can render the unified settings center and field settings', async ({ page }) => {
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
  await expect(page.getByText('字段设置', { exact: true })).toBeVisible()
  await expect(page.locator('.category-item')).toHaveCount(12)
  await expect(page.getByRole('columnheader', { name: '名称' }).last()).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '编码' }).last()).toBeVisible()
  await expect(page.getByRole('button', { name: '新增字段值' })).toBeVisible()

  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))
  expect(overflow.page).toBeLessThanOrEqual(1)
  expect(overflow.body).toBeLessThanOrEqual(1)
  expect(browserErrors).toEqual([])
})
