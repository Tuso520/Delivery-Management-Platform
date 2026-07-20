import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

test('管理员可以完成字段配置全流程并保持 Figma 桌面布局', async ({ page }) => {
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
  // 匿名会话恢复在登录前会按设计返回 401，不计入已登录页面错误。
  browserErrors.length = 0
  await page.evaluate(() => { window.location.hash = '/settings' })
  await page.waitForURL(/#\/settings$/u)

  await expect(page.getByRole('heading', { name: '设置中心' })).toBeVisible()
  await page.evaluate(() => { window.location.hash = '/settings/fields' })
  await page.waitForURL(/#\/settings\/fields$/u)

  const fieldPage = page.locator('.field-config-page')
  await expect(fieldPage).toBeVisible()
  await expect(fieldPage.locator('.category-tab')).toHaveCount(10)
  await expect(fieldPage.getByRole('tab', { name: '合同币种' })).toBeVisible()
  await expect(fieldPage.getByRole('columnheader', { name: '名称' })).toBeVisible()
  await expect(fieldPage.getByRole('columnheader', { name: '编码' })).toBeVisible()
  await expect(fieldPage.getByRole('columnheader', { name: '排序' })).toBeVisible()
  await expect(fieldPage.getByRole('columnheader', { name: '状态' })).toBeVisible()
  await expect(fieldPage.getByRole('columnheader', { name: '操作' })).toBeVisible()
  await fieldPage.getByRole('tab', { name: '项目类型' }).click()
  await expect(page.locator('.arco-message')).toHaveCount(0, { timeout: 5_000 })

  const visualDir = process.env.FIELD_VISUAL_DIR
  if (visualDir) {
    mkdirSync(visualDir, { recursive: true })
    await page.screenshot({ path: join(visualDir, 'field-settings-1440x900.png'), fullPage: true })
  }

  await fieldPage.getByRole('button', { name: '新增一行' }).click()
  const fieldDialog = page.locator('.arco-modal')
  await expect(fieldDialog).toBeVisible()
  await expect(fieldDialog.getByText('字段名称', { exact: true })).toBeVisible()
  await expect(fieldDialog.getByText('字段编码', { exact: true })).toBeVisible()
  await expect.poll(async () => (await fieldDialog.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(574)
  await expect
    .poll(async () => (await fieldDialog.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(586)

  const dialogInputs = fieldDialog.locator('input')
  await dialogInputs.nth(0).fill('端到端验收类型')
  await dialogInputs.nth(1).fill('E2E_FIELD_ACCEPTANCE')
  await dialogInputs.nth(2).fill('998')
  if (visualDir) {
    await page.screenshot({ path: join(visualDir, 'field-settings-modal-1440x900.png'), fullPage: true })
  }
  await fieldDialog.getByRole('button', { name: '保存' }).click()
  await expect(fieldDialog).toBeHidden()
  await expect(fieldPage.getByText('端到端验收类型', { exact: true })).toBeVisible()

  const searchInput = fieldPage.getByPlaceholder('搜索名称或编码')
  await searchInput.fill('E2E_FIELD_ACCEPTANCE')
  await fieldPage.getByRole('button', { name: '查询' }).click()
  const acceptanceRow = fieldPage.locator('tr', { hasText: 'E2E_FIELD_ACCEPTANCE' })
  await expect(acceptanceRow).toHaveCount(1)
  await acceptanceRow.getByRole('button', { name: '编辑' }).click()
  await dialogInputs.nth(0).fill('端到端验收类型（已编辑）')
  await fieldDialog.locator('.arco-switch').click()
  await fieldDialog.getByRole('button', { name: '保存' }).click()
  await expect(acceptanceRow.getByText('停用', { exact: true })).toBeVisible()

  await acceptanceRow.getByRole('button', { name: '编辑' }).click()
  await fieldDialog.locator('.arco-switch').click()
  await fieldDialog.getByRole('button', { name: '保存' }).click()
  await expect(acceptanceRow.getByText('启用', { exact: true })).toBeVisible()

  await acceptanceRow.getByRole('button', { name: '删除' }).click()
  const confirmDialog = page.locator('.arco-modal').filter({ hasText: '确认删除字段值' })
  await confirmDialog.getByRole('button', { name: '删除' }).click()
  await expect(acceptanceRow).toHaveCount(0)

  await searchInput.clear()
  await fieldPage.getByRole('button', { name: '查询' }).click()
  await fieldPage.getByRole('tab', { name: '国家' }).click()
  await expect(fieldPage.getByText('中国', { exact: true })).toBeVisible()
  await fieldPage.getByRole('button', { name: '刷新' }).click()
  await expect(page.locator('.arco-message')).toHaveCount(0, { timeout: 5_000 })

  if (visualDir) {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.screenshot({ path: join(visualDir, 'field-settings-1920x1080.png'), fullPage: true })
  }

  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))
  expect(overflow.page).toBeLessThanOrEqual(1)
  expect(overflow.body).toBeLessThanOrEqual(1)
  expect(browserErrors).toEqual([])
})
