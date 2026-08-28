import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test'

interface ProjectListItem {
  archivedAt?: string | null
  canDelete?: boolean
  canPermanentDelete?: boolean
  canRestore?: boolean
  contractAmount?: number | string | null
  contractType?: string | null
  convertedCnyAmount?: number | string | null
  id: string
  keywords?: string[]
  product?: string | null
  progressPercent?: number | null
  projectCode: string
  projectType?: string | null
  shortName?: string | null
}

interface ProjectListEnvelope {
  data: {
    items: ProjectListItem[]
    total: number
  }
}

interface ProjectEnvelope {
  data: ProjectListItem & {
    archiveTemplateId: string
    canArchive: boolean
    canEdit: boolean
    canUpdateProgress: boolean
    currentStage: string
    projectName: string
    revision: number
  }
}

interface SessionEnvelope {
  data: { accessToken: string }
}

interface ArchiveTreeEnvelope {
  data: {
    folders: Array<{
      id: string
      items: Array<{
        id: string
        name: string
        canUpload: boolean
        reviewRequired: boolean
        allowedExtensions?: string[] | null
        namingRule?: string | null
        currentVersion?: { logicalFileId?: string | null } | null
        fileCount: number
      }>
    }>
  }
}

interface FileEnvelope {
  data: { id: string; displayName: string }
}

interface ProcessingStatusEnvelope {
  data: Array<{
    type: string
    status: string
    progress: number
    outputAssetId?: string | null
    errorCode?: string | null
  }>
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

async function expectPermissionDialogLayout(page: Page, dialog: Locator): Promise<void> {
  for (const viewport of [
    { width: 640, height: 535 },
    { width: 706, height: 535 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport)
    const metrics = await dialog.evaluate((modal) => {
      const tableViewport = modal.querySelector<HTMLElement>('.business-table__viewport')
      const headers = [...modal.querySelectorAll<HTMLElement>('.arco-table-th')]
      const firstRowCells = [
        ...modal.querySelectorAll<HTMLElement>(
          '.permission-matrix tbody .arco-table-tr:first-child td',
        ),
      ]
      if (!tableViewport || headers.length !== 5 || firstRowCells.length !== 5) {
        throw new Error('permission matrix layout nodes are incomplete')
      }

      const verticalScrollers = [...modal.querySelectorAll<HTMLElement>('*')]
        .filter((element) => {
          const overflowY = getComputedStyle(element).overflowY
          return (
            element.scrollHeight > element.clientHeight + 1 &&
            (overflowY === 'auto' || overflowY === 'scroll')
          )
        })
        .map((element) => element.className)

      return {
        modalHorizontalOverflow: modal.scrollWidth - modal.clientWidth,
        tableHorizontalOverflow: tableViewport.scrollWidth - tableViewport.clientWidth,
        verticalScrollers,
        headerWidths: headers.map((header) => Math.round(header.getBoundingClientRect().width)),
        firstRowWidths: firstRowCells.map((cell) =>
          Math.round(cell.getBoundingClientRect().width),
        ),
      }
    })

    expect(metrics.modalHorizontalOverflow).toBeLessThanOrEqual(1)
    expect(metrics.tableHorizontalOverflow).toBeLessThanOrEqual(1)
    expect(metrics.verticalScrollers).toEqual(['business-table__viewport'])
    expect(metrics.headerWidths.slice(1)).toEqual([64, 96, 96, 64])
    expect(metrics.headerWidths[0]).toBeGreaterThan(220)
    expect(metrics.firstRowWidths).toEqual(metrics.headerWidths)
  }
  await page.setViewportSize({ width: 1280, height: 720 })
}

async function login(
  page: Page,
  username: string | undefined,
  password: string | undefined,
): Promise<string> {
  const [resolvedUsername, resolvedPassword] = requireCredentials(username, password)
  await page.goto('/#/login')
  await page.getByPlaceholder('用户名').fill(resolvedUsername)
  await page.getByPlaceholder('密码').fill(resolvedPassword)
  const loginResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/login' &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  )
  await page.locator('.login-button').click()
  const session = (await (await loginResponse).json()) as SessionEnvelope
  await page.waitForURL((url) => !url.hash.startsWith('#/login'))
  return session.data.accessToken
}

async function fetchProjectList(
  page: Page,
  accessToken: string,
  path = '/api/v1/projects?scope=mine&page=1&pageSize=20',
): Promise<ProjectListEnvelope> {
  const projectsResponse = await page.request.get(path, {
    headers: { authorization: `Bearer ${accessToken}` },
    timeout: 60_000,
  })
  expect(projectsResponse.status()).toBe(200)
  return (await projectsResponse.json()) as ProjectListEnvelope
}

async function expectProjectResponse(
  response: APIResponse,
  expectedStatuses: number[] = [200, 201],
): Promise<ProjectEnvelope> {
  const payload = (await response.json()) as ProjectEnvelope
  if (!expectedStatuses.includes(response.status())) {
    throw new Error(
      `${response.url()}: expected status ${expectedStatuses.join(' or ')}, ` +
        `received ${response.status()}; response=${JSON.stringify(payload)}`,
    )
  }
  return payload
}

function requireSeedProject(
  projects: ProjectListEnvelope,
  projectCode = 'VN-LG-2026-001',
): ProjectListItem {
  const project = projects.data.items.find((item) => item.projectCode === projectCode)
  if (!project) {
    throw new Error(`Required seeded project ${projectCode} was not returned by the project API`)
  }
  return project
}

test('administrator can use the target architecture navigation', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)
  const accessToken = await login(page, adminUsername, adminPassword)
  browserErrors.length = 0
  const projects = await fetchProjectList(
    page,
    accessToken,
    '/api/v1/projects?scope=all&page=1&pageSize=20',
  )
  expect(projects.data.total).toBeGreaterThanOrEqual(9)
  expect(projects.data.items.every((project) => !project.archivedAt)).toBe(true)
  const seedProject = requireSeedProject(projects)
  expect(seedProject).toMatchObject({
    canDelete: true,
    contractType: expect.any(String),
    product: expect.any(String),
    projectType: expect.any(String),
    shortName: expect.any(String),
  })
  expect(seedProject.keywords?.length).toBeGreaterThan(0)

  const archivedProjects = await fetchProjectList(
    page,
    accessToken,
    '/api/v1/projects/archived?page=1&pageSize=20',
  )
  expect(archivedProjects.data.total).toBeGreaterThanOrEqual(1)
  expect(
    archivedProjects.data.items.find((project) => project.shortName === '示例项目 10'),
  ).toMatchObject({
    archivedAt: expect.any(String),
    canPermanentDelete: true,
    canRestore: true,
  })

  await page.goto('/#/projects?scope=all')
  await expect(
    page
      .locator('.summary-metric')
      .filter({ hasText: new RegExp(`项目总数\\s*${projects.data.total}`, 'u') }),
  ).toBeVisible({ timeout: 60_000 })
  await page.goto(`/#/projects?scope=all&keyword=${encodeURIComponent('示例项目 1')}`)
  await expect(page.getByText('示例项目 1', { exact: true })).toBeVisible({ timeout: 60_000 })
  const activeProject = projects.data.items.find((project) => project.shortName === '示例项目 1')
  if (!activeProject) throw new Error('Active administrator deletion fixture is missing')
  await expect(page.locator(`#project-delete-${activeProject.id}`)).toBeVisible()
  await expect(page.getByText('VN-LG-2026-001', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新建' })).toBeVisible()

  await page.locator('.scope-field .arco-select-view').click()
  await expect(page.locator('.arco-select-option').filter({ hasText: '归档项目' })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByText('示例项目 10', { exact: true })).toHaveCount(0)

  await page.goto('/#/archive')
  await expect(page).toHaveURL(/#\/archive\?projectId=[^&]+$/u, { timeout: 60_000 })

  await page.goto('/#/standards')
  await expect(page).toHaveURL(/#\/standards(?:\?.*)?$/u)

  await page.goto('/#/knowledge')
  await expect(page).toHaveURL(/#\/knowledge(?:\?.*)?$/u)
  await expect(page.getByRole('heading', { name: '知识库' }).first()).toBeVisible({
    timeout: 60_000,
  })

  await page.goto('/#/settings/role-permissions')
  await expect(page.getByRole('heading', { name: '角色权限' }).first()).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByText('SUPER_ADMIN', { exact: true })).toBeVisible({ timeout: 60_000 })
  expect(browserErrors).toEqual([])
})

test('role permissions lifecycle is super-admin-only and new roles start empty', async ({
  page,
}) => {
  const accessToken = await login(page, adminUsername, adminPassword)
  const authorization = { authorization: `Bearer ${accessToken}` }
  const marker = Date.now().toString()
  const roleCode = `E2E_ROLE_${marker}`

  const createResponse = await page.request.post('/api/v1/roles', {
    headers: authorization,
    data: { roleCode, roleName: `E2E 角色 ${marker}`, description: '角色权限自动化验收' },
  })
  expect(createResponse.status()).toBe(201)
  const created = (await createResponse.json()) as { data: { id: string } }

  const emptyDetailResponse = await page.request.get(`/api/v1/roles/${created.data.id}`, {
    headers: authorization,
  })
  expect(emptyDetailResponse.status()).toBe(200)
  const emptyDetail = (await emptyDetailResponse.json()) as { data: { permissions: unknown[] } }
  expect(emptyDetail.data.permissions).toEqual([])

  const catalogResponse = await page.request.get('/api/v1/permissions', { headers: authorization })
  expect(catalogResponse.status()).toBe(200)
  const catalog = (await catalogResponse.json()) as {
    data: Array<{
      pages: Array<{
        pageName: string
        permissions: Array<{
          id: string
          permissionCode: string
          permissionName: string
          restrictedToSystemAdministrator?: boolean
        }>
      }>
    }>
  }
  const catalogPages = catalog.data.flatMap(({ pages }) => pages)
  const projectPage = catalogPages.find(({ pageName }) => pageName === '项目概览')
  const paymentPage = catalogPages.find(({ pageName }) => pageName === '款项计划')
  const projectUpdatePermission = projectPage?.permissions.find(
    ({ permissionCode }) => permissionCode === 'project:update',
  )
  const paymentOperatePermission = paymentPage?.permissions.find(
    ({ permissionCode }) => permissionCode === 'payment:operate',
  )
  expect(projectUpdatePermission).toMatchObject({ permissionName: '编辑项目' })
  expect(paymentOperatePermission).toMatchObject({ permissionName: '编辑款项计划' })
  const permissionIds = [projectUpdatePermission?.id, paymentOperatePermission?.id]
  expect(permissionIds).toEqual([expect.any(String), expect.any(String)])

  const administratorOnlyPermission = catalogPages
    .flatMap(({ permissions }) => permissions)
    .find(({ permissionCode }) => permissionCode === 'role:assign_permission')
  expect(administratorOnlyPermission).toMatchObject({
    restrictedToSystemAdministrator: true,
  })
  const rejectedAdministratorPermission = await page.request.post(
    `/api/v1/roles/${created.data.id}/permissions`,
    {
      headers: authorization,
      data: { permissionIds: [administratorOnlyPermission?.id] },
    },
  )
  expect(rejectedAdministratorPermission.status()).toBe(400)
  expect(await rejectedAdministratorPermission.json()).toMatchObject({
    message: '普通角色不能分配系统管理员专属权限',
  })

  let permissionCatalogRequests = 0
  let roleDetailRequests = 0
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (request.method() === 'GET' && path === '/api/v1/permissions') {
      permissionCatalogRequests += 1
    }
    if (request.method() === 'GET' && path === `/api/v1/roles/${created.data.id}`) {
      roleDetailRequests += 1
    }
  })
  await page.goto('/#/settings/role-permissions')
  const createdRoleRow = page.locator('.arco-table-tr').filter({ hasText: roleCode })
  await expect(createdRoleRow).toBeVisible({ timeout: 60_000 })
  await createdRoleRow.getByRole('button', { name: '配置权限' }).click()
  const permissionDialog = page.locator('.arco-modal').filter({ hasText: roleCode })
  await expect(permissionDialog).toBeVisible()
  await expect.poll(() => permissionCatalogRequests).toBe(1)
  await expect.poll(() => roleDetailRequests).toBe(1)
  const initialPermissionTable = await permissionDialog
    .locator('.permission-matrix.arco-table')
    .elementHandle()
  expect(initialPermissionTable).not.toBeNull()
  await expectPermissionDialogLayout(page, permissionDialog)

  for (const permissionName of ['查看项目列表', '编辑项目', '上传档案文件', '下载文件']) {
    const permissionRow = permissionDialog.locator('.arco-table-tr').filter({
      hasText: permissionName,
    })
    await expect(permissionRow).toBeVisible()
    await permissionRow.locator('.arco-checkbox').first().click()
    expect(await initialPermissionTable?.evaluate((element) => element.isConnected)).toBe(true)
    await expect(permissionDialog.locator('.arco-spin-mask')).toHaveCount(0)
  }
  const downloadPermissionRow = permissionDialog
    .locator('.arco-table-tr')
    .filter({ hasText: '下载文件' })
  const downloadPermissionCheckbox = downloadPermissionRow
    .getByRole('checkbox')
    .first()
  await downloadPermissionRow.locator('.arco-checkbox').first().click({ delay: 10 })
  await expect(downloadPermissionCheckbox).not.toBeChecked()
  await downloadPermissionRow.locator('.arco-checkbox').first().click({ delay: 10 })
  await expect(downloadPermissionCheckbox).toBeChecked()
  const savePermissionsResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/roles/${created.data.id}/permissions` &&
      response.request().method() === 'POST',
  )
  await permissionDialog.getByRole('button', { name: '保存', exact: true }).click()
  expect((await savePermissionsResponse).status()).toBe(200)
  await expect(permissionDialog).toBeHidden()
  expect(permissionCatalogRequests).toBe(1)
  expect(roleDetailRequests).toBe(1)

  await page.reload()
  const reloadedRoleRow = page.locator('.arco-table-tr').filter({ hasText: roleCode })
  await expect(reloadedRoleRow).toBeVisible({ timeout: 60_000 })
  await reloadedRoleRow.getByRole('button', { name: '配置权限' }).click()
  const reloadedDialog = page.locator('.arco-modal').filter({ hasText: roleCode })
  await expect(reloadedDialog).toBeVisible()
  for (const permissionName of ['查看项目列表', '编辑项目', '上传档案文件', '下载文件']) {
    const permissionRow = reloadedDialog.locator('.arco-table-tr').filter({
      hasText: permissionName,
    })
    await expect(permissionRow.getByRole('checkbox').first()).toBeChecked()
  }
  await reloadedDialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(permissionCatalogRequests).toBeLessThanOrEqual(2)
  expect(roleDetailRequests).toBe(2)

  const protectedRoleRow = page.locator('.arco-table-tr').filter({ hasText: 'SUPER_ADMIN' })
  await protectedRoleRow.getByRole('button', { name: '查看权限' }).click()
  const protectedDialog = page.locator('.arco-modal').filter({ hasText: 'SUPER_ADMIN' })
  await expect(protectedDialog.getByRole('checkbox').first()).toBeDisabled()
  await protectedDialog.getByRole('button', { name: '取消', exact: true }).click()

  await reloadedRoleRow.getByRole('button', { name: '配置权限' }).click()
  const switchedBackDialog = page.locator('.arco-modal').filter({ hasText: roleCode })
  await expect(
    switchedBackDialog
      .locator('.arco-table-tr')
      .filter({ hasText: '上传档案文件' })
      .getByRole('checkbox')
      .first(),
  ).toBeChecked()
  await switchedBackDialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(roleDetailRequests).toBe(3)

  const assignedDetailResponse = await page.request.get(`/api/v1/roles/${created.data.id}`, {
    headers: authorization,
  })
  expect(assignedDetailResponse.status()).toBe(200)
  const assigned = (await assignedDetailResponse.json()) as {
    data: { permissions: Array<{ permissionCode: string }> }
  }
  expect(assigned.data.permissions.map(({ permissionCode }) => permissionCode).sort()).toEqual([
    'archive:upload',
    'file:download',
    'project:update',
    'project:view',
  ])

  const updateResponse = await page.request.put(`/api/v1/roles/${created.data.id}`, {
    headers: authorization,
    data: { roleName: `E2E 角色（已编辑）${marker}` },
  })
  expect(updateResponse.status()).toBe(200)

  const deleteResponse = await page.request.delete(`/api/v1/roles/${created.data.id}`, {
    headers: authorization,
  })
  expect(deleteResponse.status()).toBe(200)

  const logoutResponse = await page.request.post('/api/v1/auth/logout', {
    headers: authorization,
  })
  expect(logoutResponse.status()).toBe(200)
  await page.reload()

  const limitedToken = await login(page, limitedUsername, limitedPassword)
  const deniedResponse = await page.request.get('/api/v1/roles', {
    headers: { authorization: `Bearer ${limitedToken}` },
  })
  expect(deniedResponse.status()).toBe(403)
  await page.goto('/#/settings/role-permissions')
  await page.waitForURL((url) => url.hash === '#/dashboard')
})

test('administrator can create, edit, inspect, progress, archive and restore a project', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page)
  const accessToken = await login(page, adminUsername, adminPassword)
  browserErrors.length = 0
  const authorization = { authorization: `Bearer ${accessToken}` }
  const projects = await fetchProjectList(
    page,
    accessToken,
    '/api/v1/projects?scope=all&page=1&pageSize=20',
  )
  const templateSource = requireSeedProject(projects)
  if (
    !templateSource.contractType ||
    !templateSource.product ||
    !templateSource.projectType ||
    !templateSource.keywords?.length
  ) {
    throw new Error('Seeded project configuration values are required for project creation E2E')
  }

  const templateDetail = await expectProjectResponse(
    await page.request.get(`/api/v1/projects/${templateSource.id}`, {
      headers: authorization,
      timeout: 60_000,
    }),
    [200],
  )
  const marker = Date.now().toString()
  const shortName = `E2E 项目 ${marker}`
  const created = await expectProjectResponse(
    await page.request.post('/api/v1/projects', {
      data: {
        archiveTemplateId: templateDetail.data.archiveTemplateId,
        city: '上海',
        contractType: templateSource.contractType,
        countryCode: 'CN',
        customerName: 'E2E 客户',
        keywords: templateSource.keywords,
        product: templateSource.product,
        projectName: `端到端项目 ${marker}`,
        projectType: templateSource.projectType,
        saveAsDraft: false,
        shortName,
      },
      headers: { ...authorization, 'idempotency-key': `project-e2e-${marker}` },
      timeout: 60_000,
    }),
  )

  const detail = await expectProjectResponse(
    await page.request.get(`/api/v1/projects/${created.data.id}`, {
      headers: authorization,
      timeout: 60_000,
    }),
    [200],
  )
  expect(detail.data).toMatchObject({
    canArchive: false,
    canEdit: true,
    canUpdateProgress: true,
    contractType: templateSource.contractType,
    keywords: templateSource.keywords,
    product: templateSource.product,
    projectType: templateSource.projectType,
    shortName,
  })

  const updated = await expectProjectResponse(
    await page.request.patch(`/api/v1/projects/${detail.data.id}`, {
      data: {
        customerName: 'E2E 客户（已编辑）',
        revision: detail.data.revision,
        shortName: `${shortName} 已编辑`,
      },
      headers: authorization,
      timeout: 60_000,
    }),
  )
  const progressed = await expectProjectResponse(
    await page.request.patch(`/api/v1/projects/${updated.data.id}/progress`, {
      data: {
        expectedAcceptanceAt: '2026-12-31T00:00:00.000Z',
        progressPercent: 35,
        reason: 'E2E 进度验证',
        revision: updated.data.revision,
        targetStage: 'DEEPENING',
      },
      headers: authorization,
      timeout: 60_000,
    }),
  )
  expect(progressed.data).toMatchObject({ currentStage: 'DEEPENING', progressPercent: 35 })
  const completed = await expectProjectResponse(
    await page.request.post(`/api/v1/projects/${progressed.data.id}/complete`, {
      data: { reason: 'E2E 完成并归档验证', revision: progressed.data.revision },
      headers: authorization,
      timeout: 60_000,
    }),
  )
  expect(completed.data).toMatchObject({ canArchive: true, status: 'COMPLETED' })

  await page.goto(`/#/projects?scope=all&keyword=${encodeURIComponent(`${shortName} 已编辑`)}`)
  await page.getByText(`${shortName} 已编辑`, { exact: true }).click()
  const detailDialog = page.locator('.project-detail-dialog .arco-modal')
  await expect(detailDialog).toBeVisible({ timeout: 60_000 })
  await expect(detailDialog.getByRole('heading', { name: '项目详情' })).toBeVisible()
  await expect(
    detailDialog
      .locator('.view-field')
      .filter({ hasText: /^\s*项目编号/u })
      .first()
      .locator('div'),
  ).toHaveText(progressed.data.projectCode)
  await expect
    .poll(async () => (await detailDialog.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
    .toBe(1040)
  const detailBox = await detailDialog.boundingBox()
  const viewport = page.viewportSize()
  expect(detailBox).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(Math.abs(detailBox!.x + detailBox!.width / 2 - viewport!.width / 2)).toBeLessThan(4)
  await expect(detailDialog.getByRole('button', { name: '保存' })).toHaveCount(0)
  await expect(detailDialog.locator('input:not([disabled])')).toHaveCount(0)
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page).toHaveURL(/#\/projects\?/u)
  const returnedQuery = new URLSearchParams(new URL(page.url()).hash.split('?')[1])
  expect(returnedQuery.get('scope')).toBe('all')
  expect(returnedQuery.get('keyword')).toBe(`${shortName} 已编辑`)

  const archived = await expectProjectResponse(
    await page.request.post(`/api/v1/projects/${completed.data.id}/archive`, {
      data: { reason: 'E2E 归档验证', revision: completed.data.revision },
      headers: authorization,
      timeout: 60_000,
    }),
  )
  expect(archived.data.archivedAt).toEqual(expect.any(String))

  const restored = await expectProjectResponse(
    await page.request.post(`/api/v1/projects/${archived.data.id}/restore`, {
      data: { reason: 'E2E 恢复验证', revision: archived.data.revision },
      headers: authorization,
      timeout: 60_000,
    }),
  )
  expect(restored.data.archivedAt).toBeNull()

  const rearchived = await expectProjectResponse(
    await page.request.post(`/api/v1/projects/${restored.data.id}/archive`, {
      data: { reason: 'E2E 归档列表验证', revision: restored.data.revision },
      headers: authorization,
      timeout: 60_000,
    }),
  )
  const lifecycleArchivedProjects = await fetchProjectList(
    page,
    accessToken,
    `/api/v1/projects/archived?keyword=${encodeURIComponent(`${shortName} 已编辑`)}&page=1&pageSize=20`,
  )
  expect(lifecycleArchivedProjects.data.total).toBe(1)
  expect(lifecycleArchivedProjects.data.items[0]).toMatchObject({
    canPermanentDelete: true,
    canRestore: true,
  })
  const blockedPurge = await page.request.delete(
    `/api/v1/projects/${rearchived.data.id}/permanent`,
    { headers: authorization, timeout: 60_000 },
  )
  expect(blockedPurge.status()).toBe(409)
  expect(browserErrors).toEqual([])
})

test('administrator round-trips a private MinIO file and File Worker output', async ({ page }) => {
  const accessToken = await login(page, adminUsername, adminPassword)
  const authorization = { authorization: `Bearer ${accessToken}` }
  const projects = await fetchProjectList(
    page,
    accessToken,
    '/api/v1/projects?scope=all&page=1&pageSize=20',
  )
  const project = requireSeedProject(projects)

  const treeResponse = await page.request.get(`/api/v1/projects/${project.id}/archive-tree`, {
    headers: authorization,
    timeout: 60_000,
  })
  expect(treeResponse.status()).toBe(200)
  const tree = (await treeResponse.json()) as ArchiveTreeEnvelope
  const item = tree.data.folders
    .flatMap((folder) => folder.items)
    .find(
      (candidate) =>
        candidate.canUpload &&
        !candidate.reviewRequired &&
        (!candidate.allowedExtensions?.length || candidate.allowedExtensions.includes('png')) &&
        candidate.namingRule,
    )
  expect(
    item,
    'seed project must expose a non-review PNG archive item with an explicit naming rule',
  ).toBeDefined()

  const fileName = `${item!.namingRule!.replace(/\{version\}/giu, 'V1.0')}.png`
  const currentLogicalFileId = item!.currentVersion?.logicalFileId
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  )
  const uploadResponse = await page.request.post(
    `/api/v1/projects/${project.id}/archive-items/${item!.id}/files`,
    {
      headers: { ...authorization, 'idempotency-key': `runtime-file-${Date.now()}` },
      multipart: {
        uploadMode: currentLogicalFileId ? 'NEW_VERSION' : 'REPLACE',
        revisionLevel: 'MINOR',
        ...(currentLogicalFileId
          ? { logicalFileId: currentLogicalFileId }
          : { createNewLogicalFile: 'true' }),
        changeDescription: 'CI MinIO and File Worker consistency acceptance',
        file: { name: fileName, mimeType: 'image/png', buffer: image },
      },
      timeout: 60_000,
    },
  )
  const uploadPayload = (await uploadResponse.json()) as FileEnvelope
  expect(uploadResponse.status(), JSON.stringify(uploadPayload)).toBe(201)
  const uploaded = uploadPayload
  expect(uploaded.data).toMatchObject({ id: expect.any(String), displayName: fileName })

  const downloadResponse = await page.request.get(`/api/v1/files/${uploaded.data.id}/download`, {
    headers: authorization,
    timeout: 60_000,
  })
  expect(downloadResponse.status()).toBe(200)
  expect(Buffer.from(await downloadResponse.body())).toEqual(image)

  let processing: ProcessingStatusEnvelope['data'] = []
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/v1/files/${uploaded.data.id}/processing-status`,
          { headers: authorization, timeout: 60_000 },
        )
        expect(response.status()).toBe(200)
        processing = ((await response.json()) as ProcessingStatusEnvelope).data
        const thumbnail = processing.find((job) => job.type === 'THUMBNAIL')
        if (thumbnail?.status === 'FAILED') {
          throw new Error(`thumbnail processing failed: ${thumbnail.errorCode ?? 'unknown'}`)
        }
        return thumbnail?.status
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe('COMPLETED')
  expect(processing.find((job) => job.type === 'THUMBNAIL')).toMatchObject({
    progress: 100,
    outputAssetId: expect.any(String),
  })

  const thumbnailResponse = await page.request.get(`/api/v1/files/${uploaded.data.id}/thumbnail`, {
    headers: authorization,
    timeout: 60_000,
  })
  expect(thumbnailResponse.status()).toBe(200)
  expect(thumbnailResponse.headers()['content-type']).toContain('image/webp')
  expect((await thumbnailResponse.body()).byteLength).toBeGreaterThan(0)
})

test('project manager is restricted by data scope, field permissions and settings permissions', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page)
  const accessToken = await login(page, limitedUsername, limitedPassword)
  browserErrors.length = 0
  const projects = await fetchProjectList(page, accessToken)

  expect(projects.data.total).toBe(6)
  for (const project of projects.data.items) {
    expect(project.contractAmount ?? null).toBeNull()
    expect(project.convertedCnyAmount ?? null).toBeNull()
  }
  await page.goto('/#/projects')
  await expect(page.locator('.summary-metric').filter({ hasText: /项目总数\s*6/u })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('button', { name: '永久删除' })).toHaveCount(0)

  const archiveTemplateResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/archive-templates' &&
      response.request().method() === 'GET',
  )
  await page.goto(`/#/projects/${projects.data.items[0].id}/edit`)
  expect((await archiveTemplateResponse).status()).toBe(200)
  const projectDialog = page.locator('.project-detail-dialog .arco-modal')
  await expect(projectDialog).toBeVisible({ timeout: 60_000 })
  await expect(
    projectDialog
      .locator('.arco-form-item')
      .filter({ hasText: /^\s*档案模版/u })
      .locator('.arco-select-view-value'),
  ).toContainText('DC-ARCH-DEFAULT')
  await projectDialog.getByRole('button', { name: '关闭' }).click()

  await page.locator('.user-trigger').click()
  await expect(page.locator('.arco-dropdown-option').filter({ hasText: '参数配置' })).toHaveCount(0)
  await page.goto('/#/settings/system')
  await page.waitForURL((url) => url.hash === '#/dashboard')
  await expect(page.getByRole('heading', { name: '数据看板' })).toBeVisible()
  await page.goto('/#/settings/role-permissions')
  await page.waitForURL((url) => url.hash === '#/dashboard')
  expect(browserErrors).toEqual([])
})

test('only the administrator can safely delete any project from the overview', async ({
  page,
}) => {
  const adminToken = await login(page, adminUsername, adminPassword)
  const archivedProjects = await fetchProjectList(
    page,
    adminToken,
    `/api/v1/projects/archived?keyword=${encodeURIComponent('示例项目 10')}&page=1&pageSize=20`,
  )
  const project = archivedProjects.data.items.find(({ shortName }) => shortName === '示例项目 10')
  expect(project).toMatchObject({
    archivedAt: expect.any(String),
    canDelete: true,
    canPermanentDelete: true,
  })
  if (!project) throw new Error('Dedicated archived deletion fixture is missing')

  const [resolvedLimitedUsername, resolvedLimitedPassword] = requireCredentials(
    limitedUsername,
    limitedPassword,
  )
  const limitedLoginResponse = await page.request.post('/api/v1/auth/login', {
    data: { username: resolvedLimitedUsername, password: resolvedLimitedPassword },
  })
  expect(limitedLoginResponse.status()).toBe(200)
  const limitedSession = (await limitedLoginResponse.json()) as SessionEnvelope
  const forbiddenDelete = await page.request.delete(`/api/v1/projects/${project.id}`, {
    headers: { authorization: `Bearer ${limitedSession.data.accessToken}` },
  })
  expect(forbiddenDelete.status()).toBe(403)
  expect(await forbiddenDelete.json()).toMatchObject({
    code: 403,
    message: expect.any(String),
  })

  await page.goto(`/#/projects?scope=archived&keyword=${encodeURIComponent('示例项目 10')}`)
  const deleteButton = page.locator(`#project-delete-${project.id}`)
  await expect(deleteButton).toBeVisible({ timeout: 60_000 })
  await deleteButton.click()
  const confirmation = page.locator('.business-confirm-dialog')
  await expect(confirmation).toContainText(`确认删除项目“${project.projectName}”？`)

  const deleteResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/projects/${project.id}` &&
      response.request().method() === 'DELETE',
  )
  const refreshedList = page.waitForResponse(
    (response) => {
      const url = new URL(response.url())
      return (
        url.pathname === '/api/v1/projects' &&
        url.searchParams.get('scope') === 'archived' &&
        response.request().method() === 'GET'
      )
    },
  )
  const refreshedSummary = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/projects/summary' &&
      response.request().method() === 'GET',
  )
  await confirmation.getByRole('button', { name: '删除', exact: true }).click()
  expect((await deleteResponse).status()).toBe(200)
  expect((await refreshedList).status()).toBe(200)
  expect((await refreshedSummary).status()).toBe(200)
  await expect(page.getByText('示例项目 10', { exact: true })).toHaveCount(0)
})
