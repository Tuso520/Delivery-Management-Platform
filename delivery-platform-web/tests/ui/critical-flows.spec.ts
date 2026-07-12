import { expect, test, type Page } from '@playwright/test'

interface ProjectListEnvelope {
  data: {
    items: Array<{
      contractAmount?: number | string | null
      convertedAmount?: number | string | null
      projectCode: string
    }>
    total: number
  }
}

interface SessionEnvelope {
  data: { accessToken: string }
}

const adminUsername = process.env.E2E_ADMIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const limitedUsername = process.env.E2E_LIMITED_USERNAME
const limitedPassword = process.env.E2E_LIMITED_PASSWORD

function requireCredentials(
  username: string | undefined,
  password: string | undefined,
): [string, string] {
  if (!username || !password) {
    throw new Error('UI E2E credentials are required')
  }
  return [username, password]
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function login(page: Page, username: string | undefined, password: string | undefined) {
  const [resolvedUsername, resolvedPassword] = requireCredentials(username, password)
  await page.goto('/#/login')
  await page.getByPlaceholder('用户名').fill(resolvedUsername)
  await page.getByPlaceholder('密码').fill(resolvedPassword)
  await page.getByRole('button', { name: /登\s*录/u }).click()
  await page.waitForURL((url) => !url.hash.startsWith('#/login'))
}

async function fetchProjectsForBrowserSession(page: Page): Promise<ProjectListEnvelope> {
  const refreshResponse = await page.request.post('/api/v1/auth/refresh', { timeout: 60_000 })
  expect(refreshResponse.status()).toBe(200)
  const session = (await refreshResponse.json()) as SessionEnvelope
  const projectsResponse = await page.request.get('/api/v1/projects?page=1&pageSize=20', {
    headers: { authorization: `Bearer ${session.data.accessToken}` },
    timeout: 60_000,
  })
  expect(projectsResponse.status()).toBe(200)
  return (await projectsResponse.json()) as ProjectListEnvelope
}

test('administrator can use the target architecture navigation', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)
  await login(page, adminUsername, adminPassword)
  browserErrors.length = 0
  const projects = await fetchProjectsForBrowserSession(page)
  expect(projects.data.total).toBe(10)

  await page.goto('/#/projects')
  await expect(page.getByText('项目台账', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /项目总数\s*10/u })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByText('VN-LG-2026-001', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: '创建项目' })).toBeVisible()

  await page.goto('/#/archive')
  await expect(page.getByRole('heading', { name: '项目档案' }).first()).toBeVisible({
    timeout: 60_000,
  })

  await page.goto('/#/standards')
  await expect(page.getByRole('heading', { name: '标准库' }).first()).toBeVisible({
    timeout: 60_000,
  })

  await page.goto('/#/knowledge')
  await expect(page.getByRole('heading', { name: '知识库' }).first()).toBeVisible({
    timeout: 60_000,
  })

  await page.goto('/#/organization/roles')
  await expect(page.getByRole('heading', { name: '角色管理' }).first()).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByText('SUPER_ADMIN', { exact: true })).toBeVisible({ timeout: 60_000 })
  expect(browserErrors).toEqual([])
})

test('project manager is restricted by data scope, field permissions and settings permissions', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page)
  await login(page, limitedUsername, limitedPassword)
  browserErrors.length = 0
  const projects = await fetchProjectsForBrowserSession(page)

  expect(projects.data.total).toBe(7)
  for (const project of projects.data.items) {
    expect(project.contractAmount ?? null).toBeNull()
    expect(project.convertedAmount ?? null).toBeNull()
  }
  await page.goto('/#/projects')
  await expect(page.getByText('项目台账', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /项目总数\s*7/u })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('button', { name: '永久删除' })).toHaveCount(0)

  await expect(page.getByRole('button', { name: '打开设置' })).toBeVisible()
  await page.goto('/#/settings/system')
  await page.waitForURL((url) => url.hash === '#/dashboard')
  await expect(page.getByRole('heading', { name: '数据看板' })).toBeVisible()
  expect(browserErrors).toEqual([])
})
