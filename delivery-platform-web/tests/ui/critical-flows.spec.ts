import { expect, test, type APIResponse, type Page } from '@playwright/test'

interface ProjectListItem {
  archivedAt?: string | null
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

async function login(page: Page, username: string | undefined, password: string | undefined) {
  const [resolvedUsername, resolvedPassword] = requireCredentials(username, password)
  await page.goto('/#/login')
  await page.getByPlaceholder('用户名').fill(resolvedUsername)
  await page.getByPlaceholder('密码').fill(resolvedPassword)
  await page.getByRole('button', { name: /登\s*录/u }).click()
  await page.waitForURL((url) => !url.hash.startsWith('#/login'))
}

async function getAccessToken(page: Page): Promise<string> {
  const refreshResponse = await page.request.post('/api/v1/auth/refresh', { timeout: 60_000 })
  expect(refreshResponse.status()).toBe(200)
  const session = (await refreshResponse.json()) as SessionEnvelope
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
  expect(expectedStatuses).toContain(response.status())
  return (await response.json()) as ProjectEnvelope
}

test('administrator can use the target architecture navigation', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)
  await login(page, adminUsername, adminPassword)
  browserErrors.length = 0
  const accessToken = await getAccessToken(page)
  const projects = await fetchProjectList(
    page,
    accessToken,
    '/api/v1/projects?scope=all&page=1&pageSize=20',
  )
  expect(projects.data.total).toBe(9)
  expect(projects.data.items.every((project) => !project.archivedAt)).toBe(true)
  expect(projects.data.items[0]).toMatchObject({
    contractType: expect.any(String),
    product: expect.any(String),
    projectType: expect.any(String),
    shortName: expect.any(String),
  })
  expect(projects.data.items[0]?.keywords?.length).toBeGreaterThan(0)

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

  await page.goto('/#/projects')
  await expect(page.getByRole('button', { name: /项目总数\s*9/u })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByText('示例项目 1', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('VN-LG-2026-001', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '创建项目' })).toBeVisible()

  await page.locator('.scope-field .arco-select-view').click()
  await page.locator('.arco-select-option').filter({ hasText: '归档项目' }).click()
  await expect(page.getByText('示例项目 10', { exact: true })).toBeVisible({ timeout: 60_000 })
  const seededArchivedProjectRow = page.locator('tr').filter({ hasText: '示例项目 10' })
  await expect(seededArchivedProjectRow.getByRole('button', { name: '恢复' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(seededArchivedProjectRow.getByRole('button', { name: '永久删除' })).toBeVisible({
    timeout: 60_000,
  })

  await page.goto('/#/archive')
  await expect(page).toHaveURL(/#\/archive(?:\?.*)?$/u)

  await page.goto('/#/standards')
  await expect(page).toHaveURL(/#\/standards(?:\?.*)?$/u)

  await page.goto('/#/knowledge')
  await expect(page).toHaveURL(/#\/knowledge(?:\?.*)?$/u)

  await page.goto('/#/organization/roles')
  await expect(page.getByRole('heading', { name: '角色管理' }).first()).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByText('SUPER_ADMIN', { exact: true })).toBeVisible({ timeout: 60_000 })
  expect(browserErrors).toEqual([])
})

test('administrator can create, edit, inspect, progress, archive and restore a project', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page)
  await login(page, adminUsername, adminPassword)
  browserErrors.length = 0
  const accessToken = await getAccessToken(page)
  const authorization = { authorization: `Bearer ${accessToken}` }
  const projects = await fetchProjectList(
    page,
    accessToken,
    '/api/v1/projects?scope=all&page=1&pageSize=20',
  )
  const templateSource = projects.data.items[0]
  expect(templateSource).toBeDefined()

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
        contractType: 'EPC',
        countryCode: 'CN',
        customerName: 'E2E 客户',
        keywords: ['NEW_BUILD', 'SOFTWARE_COMMISSIONING'],
        product: 'DEEPSIGHT',
        projectName: `端到端项目 ${marker}`,
        projectType: 'DATA_CENTER',
        saveAsDraft: true,
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
    canArchive: true,
    canEdit: true,
    canUpdateProgress: true,
    contractType: 'EPC',
    keywords: ['NEW_BUILD', 'SOFTWARE_COMMISSIONING'],
    product: 'DEEPSIGHT',
    projectType: 'DATA_CENTER',
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

  await page.goto(`/#/projects?scope=all&keyword=${encodeURIComponent(`${shortName} 已编辑`)}`)
  await page.getByText(`${shortName} 已编辑`, { exact: true }).click()
  await expect(page.getByText(progressed.data.projectCode, { exact: true })).toBeVisible({
    timeout: 60_000,
  })
  const detailDialog = page.locator('.project-detail-modal .arco-modal')
  await expect(detailDialog).toBeVisible()
  await expect(detailDialog.getByRole('heading', { name: '项目详情' })).toBeVisible()
  await expect
    .poll(async () => (await detailDialog.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(802)
  const detailBox = await detailDialog.boundingBox()
  const viewport = page.viewportSize()
  expect(detailBox).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(Math.abs((detailBox!.x + detailBox!.width / 2) - viewport!.width / 2)).toBeLessThan(4)
  await expect(page.getByRole('button', { name: '编辑项目' })).toBeVisible()
  await expect(page.getByRole('button', { name: '修改进度' })).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page).toHaveURL(/#\/projects\?/u)
  const returnedQuery = new URLSearchParams(new URL(page.url()).hash.split('?')[1])
  expect(returnedQuery.get('scope')).toBe('all')
  expect(returnedQuery.get('keyword')).toBe(`${shortName} 已编辑`)

  const archived = await expectProjectResponse(
    await page.request.post(`/api/v1/projects/${progressed.data.id}/archive`, {
      data: { reason: 'E2E 归档验证', revision: progressed.data.revision },
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
  await page.goto(
    `/#/projects?view=archived&keyword=${encodeURIComponent(`${shortName} 已编辑`)}`,
  )
  await expect(page.getByText(`${shortName} 已编辑`, { exact: true })).toBeVisible({
    timeout: 60_000,
  })

  const blockedPurge = await page.request.delete(
    `/api/v1/projects/${rearchived.data.id}/permanent`,
    { headers: authorization, timeout: 60_000 },
  )
  expect(blockedPurge.status()).toBe(409)
  expect(browserErrors).toEqual([])
})

test('administrator round-trips a private MinIO file and File Worker output', async ({ page }) => {
  await login(page, adminUsername, adminPassword)
  const accessToken = await getAccessToken(page)
  const authorization = { authorization: `Bearer ${accessToken}` }
  const projects = await fetchProjectList(
    page,
    accessToken,
    '/api/v1/projects?scope=all&page=1&pageSize=20',
  )
  const project = projects.data.items[0]
  expect(project).toBeDefined()

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

  const thumbnailResponse = await page.request.get(
    `/api/v1/files/${uploaded.data.id}/thumbnail`,
    { headers: authorization, timeout: 60_000 },
  )
  expect(thumbnailResponse.status()).toBe(200)
  expect(thumbnailResponse.headers()['content-type']).toContain('image/webp')
  expect((await thumbnailResponse.body()).byteLength).toBeGreaterThan(0)
})

test('project manager is restricted by data scope, field permissions and settings permissions', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page)
  await login(page, limitedUsername, limitedPassword)
  browserErrors.length = 0
  const accessToken = await getAccessToken(page)
  const projects = await fetchProjectList(page, accessToken)

  expect(projects.data.total).toBe(6)
  for (const project of projects.data.items) {
    expect(project.contractAmount ?? null).toBeNull()
    expect(project.convertedCnyAmount ?? null).toBeNull()
  }
  await page.goto('/#/projects')
  await expect(page.getByRole('button', { name: /项目总数\s*6/u })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('button', { name: '永久删除' })).toHaveCount(0)

  await expect(page.getByRole('button', { name: '打开设置' })).toBeVisible()
  await page.goto('/#/settings/system')
  await page.waitForURL((url) => url.hash === '#/dashboard')
  await expect(page.getByRole('heading', { name: '数据看板' })).toBeVisible()
  expect(browserErrors).toEqual([])
})
