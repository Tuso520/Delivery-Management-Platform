import { expect, test, type Page, type Route } from '@playwright/test'
import { resolve } from 'node:path'

const adminUsername = process.env.E2E_ADMIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const screenshotPath = resolve(process.cwd(), '../.ai-work/acceptance-user-shell-1440x900.png')
const avatarDataUrl =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%23165DFF%22/%3E%3Ccircle cx=%2232%22 cy=%2224%22 r=%2212%22 fill=%22white%22/%3E%3Cpath d=%22M12 58c2-13 10-20 20-20s18 7 20 20%22 fill=%22white%22/%3E%3C/svg%3E'

async function fulfillSessionWithAvatar(route: Route): Promise<void> {
  const response = await route.fetch()
  const body = await response.json()
  if (body?.data?.user) body.data.user.avatar = avatarDataUrl
  await route.fulfill({ response, json: body })
}

async function login(page: Page): Promise<void> {
  if (!adminUsername || !adminPassword) throw new Error('UI E2E credentials are required')
  await page.goto('/#/login')
  const fields = page.locator('.login-form input')
  await fields.nth(0).fill(adminUsername)
  await fields.nth(1).fill(adminPassword)
  await page.locator('.login-button').click()
  await page.waitForURL((url) => !url.hash.startsWith('#/login'))
}

test('match user center scrolling, account menu, Feishu avatar and blue D identity', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/api/v1/auth/login', fulfillSessionWithAvatar)
  await page.route('**/api/v1/auth/refresh', fulfillSessionWithAvatar)
  await page.route('**/api/v1/users?**', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    const template = body?.data?.items?.[0]
    const url = new URL(route.request().url())
    const pageNumber = Number(url.searchParams.get('page') || 1)
    const pageSize = Number(url.searchParams.get('pageSize') || 20)
    const allUsers = Array.from({ length: 60 }, (_, index) => ({
      ...template,
      id: `scroll-user-${index + 1}`,
      username: `scroll_user_${String(index + 1).padStart(2, '0')}`,
      realName: `滚动验收用户 ${index + 1}`,
      email: `scroll_user_${index + 1}@example.com`,
    }))
    const start = (pageNumber - 1) * pageSize
    body.data = {
      items: allUsers.slice(start, start + pageSize),
      page: pageNumber,
      pageSize,
      total: allUsers.length,
    }
    await route.fulfill({ response, json: body })
  })

  await page.goto('/#/login')
  const loginLogo = page.locator('.brand-logo')
  await expect(loginLogo).toBeVisible()
  const favicon = await page.request.get('/favicon.svg')
  expect(favicon.ok()).toBe(true)
  const faviconSource = await favicon.text()
  expect(faviconSource).toContain('#165DFF')
  expect(faviconSource).not.toContain('rx=')

  await login(page)
  const headerLogo = page.locator('.brand-mark')
  await expect(headerLogo).toHaveText('D')
  await expect(headerLogo).toHaveCSS('background-color', 'rgb(22, 93, 255)')
  await expect(page.locator('.user-avatar img')).toHaveAttribute('src', avatarDataUrl)
  await expect(page.locator('.user-avatar')).toHaveCSS('border-radius', '50%')

  await page.locator('.user-trigger').click()
  const dropdown = page.locator('.arco-dropdown')
  await expect(dropdown).toContainText('退出登录')
  await expect(dropdown.locator('.arco-dropdown-option')).toHaveCount(1)
  await expect(dropdown).not.toContainText('个人中心')
  await expect(dropdown).not.toContainText('跟随系统')
  await expect(dropdown).not.toContainText('English')
  await expect(dropdown).not.toContainText('币种')
  await expect(dropdown).not.toContainText('汇率')
  await expect(dropdown).not.toContainText('审批规则')
  await page.keyboard.press('Escape')

  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: '用户中心', level: 1 })).toBeVisible()
  const viewport = page.locator('.table-card .business-table__viewport')
  await expect(viewport).toBeVisible()
  const dimensions = await viewport.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight)
  await viewport.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expect(page.getByText('滚动验收用户 21')).toBeAttached()

  await page.reload()
  await expect(page.getByRole('heading', { name: '用户中心', level: 1 })).toBeVisible()
  await expect(page.locator('.user-avatar img')).toHaveAttribute('src', avatarDataUrl)
  await page.screenshot({ path: screenshotPath, fullPage: true })

  await page.locator('.user-trigger').click()
  await page.getByText('退出登录', { exact: true }).click()
  await page.waitForURL((url) => url.hash.startsWith('#/login'))
  await expect(page.locator('.login-button')).toBeVisible()
})
