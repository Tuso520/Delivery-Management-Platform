import { Buffer } from 'node:buffer'

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

interface SessionEnvelope {
  data: { accessToken: string }
}

interface KnowledgeItem {
  id: string
  categoryId: string
  title: string
  displayVersion?: {
    version: string
    contentType: 'FILE' | 'MARKDOWN' | 'LINK'
    fileVersion?: {
      logicalFileId: string
      asset: {
        originalName: string
        extension: string | null
      }
    } | null
    markdownContent?: string | null
    externalUrl?: string | null
  } | null
  versions?: Array<{
    fileVersion?: {
      logicalFileId: string
    } | null
    supportingFiles: Array<{
      fileVersion: {
        logicalFileId: string
      }
    }>
  }>
}

interface KnowledgeListEnvelope {
  data: {
    items: KnowledgeItem[]
    page: number
    pageSize: number
    total: number
  }
}

interface KnowledgeEnvelope {
  data: KnowledgeItem
}

interface UploadEnvelope {
  data: {
    fileVersionId: string
    logicalFileId: string
  }
}

const adminUsername = process.env.E2E_ADMIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const limitedUsername = process.env.E2E_LIMITED_USERNAME
const limitedPassword = process.env.E2E_LIMITED_PASSWORD
const knowledgeReaderUsername = process.env.E2E_KNOWLEDGE_READER_USERNAME ?? 'elec_xu'
const knowledgeReaderPassword =
  process.env.E2E_KNOWLEDGE_READER_PASSWORD ?? process.env.E2E_LIMITED_PASSWORD

function requireCredential(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function login(
  page: Page,
  username: string | undefined,
  password: string | undefined,
): Promise<string> {
  await page.goto('/#/login')
  await page.getByPlaceholder('用户名').fill(requireCredential(username, 'E2E username'))
  await page.getByPlaceholder('密码').fill(requireCredential(password, 'E2E password'))
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/login' &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  )
  await page.locator('.login-button').click()
  const response = (await (await responsePromise).json()) as SessionEnvelope
  await page.waitForURL((url) => !url.hash.startsWith('#/login'))
  return response.data.accessToken
}

function authHeaders(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` }
}

async function fetchKnowledge(
  request: APIRequestContext,
  accessToken: string,
  query = 'page=1&pageSize=100&sortBy=updatedAt&sortOrder=desc',
): Promise<KnowledgeListEnvelope> {
  const response = await request.get(`/api/v1/knowledge?${query}`, {
    headers: authHeaders(accessToken),
  })
  expect(response.status()).toBe(200)
  return (await response.json()) as KnowledgeListEnvelope
}

async function uploadKnowledgeFile(
  request: APIRequestContext,
  accessToken: string,
  name: string,
  content: string,
): Promise<UploadEnvelope['data']> {
  const response = await request.post('/api/v1/files/drafts', {
    headers: {
      ...authHeaders(accessToken),
      'idempotency-key': `knowledge-ui-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
    multipart: {
      ownerType: 'KNOWLEDGE',
      changeDescription: '知识库 Figma 自动化验收',
      file: {
        name,
        mimeType: 'text/markdown',
        buffer: Buffer.from(content, 'utf8'),
      },
    },
  })
  expect(response.status()).toBe(201)
  return ((await response.json()) as UploadEnvelope).data
}

const knowledgeViewports = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
] as const

async function measureKnowledgeLayout(page: Page) {
  return page.evaluate(() => {
    const element = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector)
      if (!node) throw new Error(`Missing ${selector}`)
      return node
    }
    const rect = (selector: string) => {
      const box = element(selector).getBoundingClientRect()
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      }
    }
    const widths = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .slice(0, 5)
        .map((node) => node.getBoundingClientRect().width)

    const layoutMain = element('.layout-main')
    const categoryList = element('.knowledge-category-list')
    const tableRegion = element('.knowledge-table-region')
    const tableViewport = element('.knowledge-table-region .business-table__viewport')

    return {
      root: rect('.knowledge-library'),
      layoutMain: rect('.layout-main'),
      panel: rect('.knowledge-panel'),
      sidebar: rect('.knowledge-categories'),
      content: rect('.knowledge-content'),
      description: rect('.knowledge-category-description'),
      tableRegion: rect('.knowledge-table-region'),
      table: rect('.knowledge-table'),
      headerWidths: widths('.knowledge-table thead th'),
      bodyWidths: widths('.knowledge-table tbody tr:first-child td'),
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pageOverflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      layoutOverflowX: layoutMain.scrollWidth - layoutMain.clientWidth,
      layoutOverflowY: layoutMain.scrollHeight - layoutMain.clientHeight,
      tableOverflowX: tableViewport.scrollWidth - tableViewport.clientWidth,
      tableOverflowY: tableViewport.scrollHeight - tableViewport.clientHeight,
      categoryOverflowY: categoryList.scrollHeight - categoryList.clientHeight,
      categoryOverflowStyle: getComputedStyle(categoryList).overflowY,
      tableOverflowStyle: getComputedStyle(tableViewport).overflow,
    }
  })
}

test('knowledge library matches Figma node 125:624 and uses real backend services', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.setViewportSize({ width: 1440, height: 900 })
  const accessToken = await login(page, adminUsername, adminPassword)
  browserErrors.length = 0
  await page.goto('/#/knowledge')

  const root = page.locator('.knowledge-library')
  const table = page.locator('.knowledge-table')
  await expect(root).toBeVisible()
  await expect
    .poll(() => page.locator('.knowledge-category').count(), { timeout: 60_000 })
    .toBeGreaterThan(0)
  const configuredCategoryCount = await page.locator('.knowledge-category').count()
  await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.knowledge-metric')).toHaveCount(3)
  await expect(page.locator('.knowledge-metric__icon img')).toHaveCount(3)
  await expect(table.locator('thead th')).toHaveText([
    '资料标题',
    '当前版本',
    '生效日期',
    '更新人',
    '操作',
  ])
  await expect(page.locator('.arco-pagination')).toHaveCount(0)

  const figmaGeometry = await page.evaluate(() => {
    const size = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector)
      if (!node) throw new Error(`Missing ${selector}`)
      const box = node.getBoundingClientRect()
      return { width: box.width, height: box.height }
    }
    return {
      metrics: size('.knowledge-metrics'),
      metric: size('.knowledge-metric'),
      toolbar: size('.knowledge-toolbar'),
      queryButton: size('.knowledge-query-button'),
      addButton: size('.knowledge-add-button'),
      categoryHeader: size('.knowledge-category-header'),
      categoryRow: size('.knowledge-category'),
      rowHeights: Array.from(
        document.querySelectorAll<HTMLElement>(
          '.knowledge-table thead tr, .knowledge-table tbody tr:not(.knowledge-table__state-row)',
        ),
      ).map((node) => node.getBoundingClientRect().height),
    }
  })

  expect(figmaGeometry.metrics.height).toBe(88)
  expect(figmaGeometry.metric.height).toBe(76)
  expect(figmaGeometry.toolbar.height).toBe(32)
  expect(figmaGeometry.queryButton).toEqual({ width: 82, height: 32 })
  expect(figmaGeometry.addButton).toEqual({ width: 82, height: 32 })
  expect(figmaGeometry.categoryHeader.height).toBe(44)
  expect(figmaGeometry.categoryRow.height).toBe(44)
  expect(figmaGeometry.rowHeights[0]).toBe(33)
  expect(
    figmaGeometry.rowHeights.slice(1).every((height) => Math.abs(height - 35) <= 0.5),
  ).toBe(true)

  const activeCategoryLabel = (
    await page.locator('.knowledge-category--active span').innerText()
  ).trim()
  await expect(page.locator('.knowledge-category-description h1')).toHaveText(activeCategoryLabel)
  await expect(page.locator('.knowledge-category-description p')).not.toBeEmpty()

  const selectedCategoryId = await page
    .locator('.knowledge-category--active')
    .getAttribute('data-category-id')
  expect(selectedCategoryId).toBeTruthy()

  const longTitle = `知识库超长标题-${Date.now()}-${'跨国交付现场调试与验收操作规范'.repeat(5)}`
  const longMaterialName = `${longTitle}.md`
  let longItemId = ''
  let fileItemId = ''
  let uiCreatedItemId = ''
  let fileMaterialName = ''
  try {
    const createLongResponse = await page.request.post('/api/v1/knowledge', {
      headers: authHeaders(accessToken),
      data: {
        title: longTitle,
        categoryId: selectedCategoryId,
        summary: '用于核验超长标题、摘要、日期、版本与人员展示格式。',
        effectiveAt: '2026-12-12',
        version: 'V9.9',
        contentType: 'MARKDOWN',
        fileVersionId: null,
        markdownContent: '# 自动化验收正文',
        externalUrl: null,
        supportingFileVersionIds: [],
      },
    })
    expect(createLongResponse.status()).toBe(201)
    longItemId = ((await createLongResponse.json()) as KnowledgeEnvelope).data.id

    fileMaterialName = `knowledge-main-${Date.now()}.md`
    const mainFile = await uploadKnowledgeFile(
      page.request,
      accessToken,
      fileMaterialName,
      'knowledge main file',
    )
    const supportingFile = await uploadKnowledgeFile(
      page.request,
      accessToken,
      `knowledge-support-${Date.now()}.md`,
      'knowledge supporting file',
    )
    const createFileResponse = await page.request.post('/api/v1/knowledge', {
      headers: authHeaders(accessToken),
      data: {
        title: `知识文件与附件验收-${Date.now()}`,
        categoryId: selectedCategoryId,
        effectiveAt: '2026-12-12',
        version: 'V1.0',
        contentType: 'FILE',
        fileVersionId: mainFile.fileVersionId,
        markdownContent: null,
        externalUrl: null,
        supportingFileVersionIds: [supportingFile.fileVersionId],
      },
    })
    expect(createFileResponse.status()).toBe(201)
    fileItemId = ((await createFileResponse.json()) as KnowledgeEnvelope).data.id

    const fileDetailResponse = await page.request.get(`/api/v1/knowledge/${fileItemId}`, {
      headers: authHeaders(accessToken),
    })
    expect(fileDetailResponse.status()).toBe(200)
    const fileDetail = ((await fileDetailResponse.json()) as KnowledgeEnvelope).data
    expect(fileDetail.versions?.[0]?.supportingFiles).toHaveLength(1)
    for (const logicalFileId of [mainFile.logicalFileId, supportingFile.logicalFileId]) {
      const previewResponse = await page.request.get(
        `/api/v1/files/${logicalFileId}/preview-session`,
        { headers: authHeaders(accessToken) },
      )
      expect(previewResponse.status()).toBe(200)
      const downloadResponse = await page.request.get(`/api/v1/files/${logicalFileId}/download`, {
        headers: authHeaders(accessToken),
      })
      expect(downloadResponse.status()).toBe(200)
      expect(await downloadResponse.body()).not.toHaveLength(0)
    }

    await page.reload()
    await expect(page.getByRole('button', { name: longMaterialName })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('button', { name: fileMaterialName })).toBeVisible()
    const refreshedList = await fetchKnowledge(page.request, accessToken)
    const fileListItem = refreshedList.data.items.find((item) => item.id === fileItemId)
    expect(fileListItem?.displayVersion?.fileVersion?.asset.originalName).toBe(fileMaterialName)
    const longTitleMetrics = await page
      .getByRole('button', { name: longMaterialName })
      .locator('.knowledge-table__title-text')
      .evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        overflow: getComputedStyle(node).overflow,
        whiteSpace: getComputedStyle(node).whiteSpace,
        textOverflow: getComputedStyle(node).textOverflow,
      }))
    expect(longTitleMetrics.clientWidth).toBeGreaterThan(0)
    expect(longTitleMetrics.scrollWidth).toBeGreaterThanOrEqual(longTitleMetrics.clientWidth)
    expect(longTitleMetrics.overflow).toBe('hidden')
    expect(longTitleMetrics.whiteSpace).toBe('nowrap')
    expect(longTitleMetrics.textOverflow).toBe('ellipsis')
    const longRow = page.locator('.knowledge-table tbody tr').filter({ hasText: longTitle })
    await expect(longRow.locator('td').nth(1)).toHaveText('-')
    await expect(longRow.locator('td').nth(2)).toHaveText('2026-12-12')

    const panelHeights: number[] = []
    for (const viewport of knowledgeViewports) {
      await page.setViewportSize(viewport)
      await expect(page.getByRole('button', { name: longMaterialName })).toBeVisible()
      const geometry = await measureKnowledgeLayout(page)
      panelHeights.push(geometry.panel.height)

      expect(Math.abs(geometry.root.height - geometry.layoutMain.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.root.width - geometry.layoutMain.width)).toBeLessThanOrEqual(1)
      expect(geometry.sidebar.width).toBe(270)
      expect(geometry.description.height).toBe(72)
      expect(Math.abs(geometry.sidebar.bottom - geometry.panel.bottom)).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.content.bottom - geometry.panel.bottom)).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.tableRegion.bottom - geometry.panel.bottom)).toBeLessThanOrEqual(1)
      expect(geometry.content.width).toBeGreaterThan(0)
      expect(geometry.table.width).toBeGreaterThanOrEqual(937)
      expect(geometry.headerWidths[0]).toBeGreaterThanOrEqual(365)
      expect(geometry.headerWidths).toHaveLength(5)
      expect(geometry.bodyWidths).toHaveLength(5)
      geometry.headerWidths.forEach((width, index) => {
        expect(Math.abs(width - geometry.bodyWidths[index]!)).toBeLessThanOrEqual(0.5)
        if (index > 0) {
          expect(Math.abs(width - [0, 90, 130, 170, 182][index]!)).toBeLessThanOrEqual(1)
        }
      })
      const columnWidth = geometry.headerWidths.reduce((total, width) => total + width, 0)
      expect(Math.abs(columnWidth + 2 - geometry.table.width)).toBeLessThanOrEqual(1)
      expect(geometry.pageOverflowX).toBe(0)
      expect(geometry.pageOverflowY).toBe(0)
      expect(geometry.layoutOverflowX).toBe(0)
      expect(geometry.layoutOverflowY).toBe(0)
      expect(geometry.categoryOverflowStyle).toBe('auto')
      expect(geometry.tableOverflowStyle).toBe('auto')
      if (geometry.tableRegion.width < 937) {
        expect(geometry.tableOverflowX).toBeGreaterThan(0)
      } else {
        expect(geometry.tableOverflowX).toBeLessThanOrEqual(1)
        expect(Math.abs(geometry.table.right - geometry.tableRegion.right)).toBeLessThanOrEqual(1)
      }

      if (geometry.tableOverflowY > 0) {
        const stickyHeaderOffset = await page.evaluate(() => {
          const region = document.querySelector<HTMLElement>('.knowledge-table-region')
          const header = document.querySelector<HTMLElement>('.knowledge-table thead th')
          if (!region || !header) throw new Error('Missing table scroll elements')
          region.scrollTop = 120
          return header.getBoundingClientRect().top - region.getBoundingClientRect().top
        })
        expect(Math.abs(stickyHeaderOffset)).toBeLessThanOrEqual(1)
        await page.locator('.knowledge-table-region').evaluate((node) => {
          node.scrollTop = 0
        })
      }
    }
    expect(panelHeights[1]).toBeGreaterThan(panelHeights[0]!)
    expect(panelHeights[2]).toBeGreaterThan(panelHeights[1]!)

    await page.getByRole('button', { name: longMaterialName }).click()
    await expect(page).toHaveURL(/#\/knowledge(?:\?|$)/u)
    await expect(page.locator('.attachment-preview-modal')).toBeVisible()
    await expect(page.locator('.attachment-preview-modal .markdown-body')).toContainText(
      '自动化验收正文',
    )
    await expect(page.locator('.arco-drawer')).toHaveCount(0)
    await page.locator('.attachment-preview-modal .arco-modal-close-btn').click()
    await expect(page.locator('.attachment-preview-modal')).toHaveCount(0)

    const previewResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/v1/files/${mainFile.logicalFileId}/preview-session`),
    )
    await page.getByRole('button', { name: fileMaterialName }).click()
    await previewResponse
    await expect(page).toHaveURL(/#\/knowledge(?:\?|$)/u)
    await expect(page.locator('.attachment-preview-modal .file-preview-router')).toBeVisible()
    await expect(page.locator('.attachment-preview-modal .markdown-body')).toContainText(
      'knowledge main file',
    )
    await expect(page.locator('.arco-drawer')).toHaveCount(0)
    await page.locator('.attachment-preview-modal .arco-modal-close-btn').click()

    await page.getByRole('button', { name: '新增' }).click()
    const createModal = page.locator('.arco-modal:visible')
    await expect(createModal).toBeVisible()
    await createModal.locator('.arco-select-view').click()
    await expect(page.locator('.arco-select-dropdown:visible .arco-select-option')).toHaveCount(
      configuredCategoryCount,
    )
    await page.keyboard.press('Escape')
    const uiFileName = `knowledge-ui-create-${Date.now()}.md`
    await createModal.locator('input[placeholder="请输入资料标题"]').fill('新增后弹窗预览验收')
    await createModal.locator('.arco-radio-button').filter({ hasText: '文件' }).click()
    await createModal.locator('input[type="file"]').first().setInputFiles({
      name: uiFileName,
      mimeType: 'text/markdown',
      buffer: Buffer.from('# ui create modal preview'),
    })
    const uiCreateResponse = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/api/v1/knowledge' && response.request().method() === 'POST'
    })
    const uiPreviewResponse = page.waitForResponse((response) =>
      response.url().includes('/preview-session'),
    )
    await createModal.getByRole('button', { name: '保存草稿' }).click()
    const createdEnvelope = (await (await uiCreateResponse).json()) as KnowledgeEnvelope
    uiCreatedItemId = createdEnvelope.data.id
    await uiPreviewResponse
    await expect(page).toHaveURL(/#\/knowledge(?:\?|$)/u)
    await expect(page.locator('.attachment-preview-modal .file-preview-router')).toBeVisible()
    await expect(page.locator('.attachment-preview-modal .markdown-body')).toContainText(
      'ui create modal preview',
    )
    await expect(page.locator('.arco-drawer')).toHaveCount(0)
    await page.locator('.attachment-preview-modal .arco-modal-close-btn').click()

    const keyword = longTitle
    const filteredResponse = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname === '/api/v1/knowledge' &&
        url.searchParams.get('keyword') === keyword &&
        response.status() === 200
      )
    })
    await page.locator('.knowledge-search-input input').fill(keyword)
    await page.getByRole('button', { name: '查询' }).click()
    await filteredResponse
    await expect(table.locator('tbody tr')).toHaveCount(1)
    await expect(table.locator('tbody tr')).toContainText(keyword)
    const fewDataGeometry = await measureKnowledgeLayout(page)
    expect(
      Math.abs(fewDataGeometry.sidebar.bottom - fewDataGeometry.panel.bottom),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(fewDataGeometry.tableRegion.bottom - fewDataGeometry.panel.bottom),
    ).toBeLessThanOrEqual(1)

    await page.locator('.knowledge-search-input input').fill(`无匹配知识-${Date.now()}`)
    await page.getByRole('button', { name: '查询' }).click()
    await expect(page.getByText('没有符合条件的资料')).toBeVisible()
    const emptyGeometry = await measureKnowledgeLayout(page)
    expect(Math.abs(emptyGeometry.sidebar.bottom - emptyGeometry.panel.bottom)).toBeLessThanOrEqual(
      1,
    )
    expect(
      Math.abs(emptyGeometry.tableRegion.bottom - emptyGeometry.panel.bottom),
    ).toBeLessThanOrEqual(1)

    const firstPage = await fetchKnowledge(
      page.request,
      accessToken,
      'page=1&pageSize=1&sortBy=title&sortOrder=asc',
    )
    const secondPage = await fetchKnowledge(
      page.request,
      accessToken,
      'page=2&pageSize=1&sortBy=title&sortOrder=asc',
    )
    expect(firstPage.data.pageSize).toBe(1)
    expect(firstPage.data.total).toBeGreaterThan(1)
    expect(firstPage.data.items[0]?.id).not.toBe(secondPage.data.items[0]?.id)

    await page.setViewportSize({ width: 1366, height: 768 })
    const overflow = await page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>('.knowledge-table-region')
      if (!scroll) throw new Error('Missing knowledge content scroller')
      return {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        table: scroll.scrollWidth - scroll.clientWidth,
      }
    })
    expect(overflow.page).toBe(0)
    expect(overflow.table).toBeGreaterThan(0)
  } finally {
    for (const itemId of [longItemId, fileItemId, uiCreatedItemId].filter(Boolean)) {
      const archiveResponse = await page.request.post(`/api/v1/knowledge/${itemId}/archive`, {
        headers: authHeaders(accessToken),
      })
      expect(archiveResponse.status()).toBe(200)
    }
  }

  expect(browserErrors).toEqual([])
})

test('knowledge library exposes real loading/error recovery to a read-only user', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const accessToken = await login(page, knowledgeReaderUsername, knowledgeReaderPassword)
  await page.goto('/#/knowledge')
  await expect
    .poll(() => page.locator('.knowledge-category').count(), { timeout: 60_000 })
    .toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: '新增' })).toHaveCount(0)
  await expect(page.locator('.knowledge-table__actions button')).toHaveCount(0)

  const list = await fetchKnowledge(page.request, accessToken, 'page=1&pageSize=1')
  const forbiddenCreate = await page.request.post('/api/v1/knowledge', {
    headers: authHeaders(accessToken),
    data: {
      title: '无权限创建',
      categoryId: list.data.items[0]?.categoryId,
      contentType: 'MARKDOWN',
      fileVersionId: null,
      markdownContent: '# forbidden',
      externalUrl: null,
      supportingFileVersionIds: [],
    },
  })
  expect(forbiddenCreate.status()).toBe(403)

  await page.route('**/api/v1/knowledge?**', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('keyword') === '延迟加载验收') {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    await route.continue()
  })
  await page.locator('.knowledge-search-input input').fill('延迟加载验收')
  await page.getByRole('button', { name: '查询' }).click()
  await expect(page.locator('.knowledge-table .arco-spin-loading')).toBeVisible()
  await expect(page.locator('.knowledge-table .arco-spin-loading')).toBeHidden({ timeout: 60_000 })
  await page.unroute('**/api/v1/knowledge?**')

  await page.route('**/api/v1/knowledge?**', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('keyword') === '接口错误验收') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 500, message: 'test-only error' }),
      })
      return
    }
    await route.continue()
  })
  await page.locator('.knowledge-search-input input').fill('接口错误验收')
  await page.getByRole('button', { name: '查询' }).click()
  await expect(page.getByText('知识资料加载失败，请重试。')).toBeVisible({ timeout: 60_000 })
  await page.unroute('**/api/v1/knowledge?**')
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.getByText('没有符合条件的资料')).toBeVisible({ timeout: 60_000 })
})

test('knowledge route and API reject a user without knowledge permission', async ({ page }) => {
  const accessToken = await login(page, limitedUsername, limitedPassword)
  await page.goto('/#/knowledge')
  await expect(page).toHaveURL(/#\/dashboard/u)
  await expect(page.locator('.knowledge-library')).toHaveCount(0)

  const response = await page.request.get('/api/v1/knowledge?page=1&pageSize=1', {
    headers: authHeaders(accessToken),
  })
  expect(response.status()).toBe(403)
})
