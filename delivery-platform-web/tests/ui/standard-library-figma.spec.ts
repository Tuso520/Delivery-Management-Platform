import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'

const adminUsername = process.env.E2E_ADMIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const limitedUsername = process.env.E2E_LIMITED_USERNAME
const limitedPassword = process.env.E2E_LIMITED_PASSWORD
const acceptanceScreenshot = resolve(
  process.cwd(),
  '../.ai-work/acceptance-standard-library-1440x900.png',
)
const deliveryStageDirectories = [
  ['项目启动', '完成项目交接、团队组建、目标确认、计划编制、风险识别及启动会组织。'],
  ['深化设计', '完成需求澄清、技术方案、系统架构、点位、图纸及软硬件配置等深化设计工作。'],
  ['采购与生产', '完成设备材料选型、采购下单、生产跟踪、质量检查、交期控制及发货准备。'],
  ['施工与安装', '完成现场进场、施工组织、设备安装、布线接线、质量检查及施工问题闭环。'],
  ['硬件调试', '完成控制柜、PLC、仪表、执行器、通讯网络及现场设备的检查、上电和联调。'],
  ['软件测试', '完成控制程序、软件平台、通讯接口、数据点位及控制逻辑调试。'],
  ['内部验收', '完成项目内部功能、质量、资料及问题项检查，确认达到客户验收条件。'],
  ['客户验收', '完成客户功能验证、现场测试、问题整改、验收资料提交及验收确认。'],
  ['收尾与移交', '完成遗留问题关闭、竣工资料整理、培训、备件及系统资料正式移交。'],
  ['维保与复盘', '完成质保运维、故障支持、问题跟踪、项目复盘、经验总结及标准沉淀。'],
] as const
const managementDomainLabels = [
  '进度与计划管理',
  '质量管理',
  '安全管理',
  '成本与预算管理',
  '合同、付款与商务管理',
  '采购与供应链管理',
  '风险、问题与待办管理',
  '变更与增项管理',
  '沟通、会议与汇报管理',
  '文件、档案与成果物管理',
  '阶段评审与审批管理',
  '分包商与相关方管理',
] as const
const managementDomainDescriptions = [
  '项目总体计划、阶段计划、周计划、里程碑、进度跟踪、延期预警及纠偏管理。',
  '项目质量标准、检查机制、质量问题、不合格项、整改验证及质量闭环管理。',
  '施工及项目实施过程中的安全要求、风险识别、检查、培训、事故及隐患管理。',
  '项目预算、成本计划、实际成本、偏差分析、费用控制及项目成本复盘管理。',
  '合同执行、付款节点、回款、商务条件、索赔及相关商务事项管理。',
  '供应商、询价采购、交期、物流、到货、供应风险及供应链全过程管理。',
  '项目风险、问题、行动项和待办事项的识别、分级、责任、跟踪及关闭管理。',
  '项目范围、技术、商务及现场变更的申请、评估、审批、实施和费用确认管理。',
  '项目会议、沟通机制、会议纪要、周报月报、客户汇报及关键事项沟通管理。',
  '项目文件、图纸、资料、版本、成果物、归档、权限及交付记录管理。',
  '项目关键阶段、重大方案、成果物和重要事项的评审、审批及放行管理。',
  '分包商、供应商、客户及其他相关方的职责、接口、协同、评价及履约管理。',
] as const

interface SessionEnvelope {
  data: { accessToken: string }
}

interface FieldOption {
  enabled: boolean
  value: string
}

interface FieldConfiguration {
  defaultValue: unknown
  fieldCode: string
  options: FieldOption[]
}

interface FieldConfigurationEnvelope {
  data: FieldConfiguration[]
}

interface StandardListEnvelope {
  data: {
    items: Array<{ id: string; name: string }>
    page: number
    pageSize: number
    total: number
  }
}

interface DraftUploadEnvelope {
  data: {
    fileVersionId: string
    logicalFileId: string
  }
}

interface StandardEnvelope {
  data: { id: string }
}

async function login(
  page: Page,
  username = adminUsername,
  password = adminPassword,
): Promise<string> {
  if (!username || !password) throw new Error('UI E2E credentials are required')

  await page.goto('/#/login')
  const fields = page.locator('.login-form input')
  await expect(fields).toHaveCount(2)
  await fields.nth(0).fill(username)
  await fields.nth(1).fill(password)
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
    const rowHeights = Array.from(document.querySelectorAll<HTMLElement>('.standard-table tr')).map(
      (node) => node.getBoundingClientRect().height,
    )

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
  expect(geometry.libraryPanel.height).toBeGreaterThanOrEqual(625)
  expect(geometry.sidebar.width).toBe(270)
  expect(geometry.tabs.height).toBe(44)
  expect(geometry.categoryRow.height).toBe(44)
  expect(geometry.categoryDescription.height).toBe(80)
  expect(geometry.contentPanel.width).toBeGreaterThanOrEqual(937)
  expect(geometry.headerWidths.slice(1)).toEqual([90, 130, 170, 182])
  expect(geometry.headerWidths[0]).toBeGreaterThanOrEqual(365)
  expect(geometry.headerWidths.reduce((total, width) => total + width, 0)).toBeCloseTo(
    geometry.contentPanel.width,
    0,
  )
  expect(geometry.bodyWidths).toEqual(geometry.headerWidths)
  expect(geometry.rowHeights[0]).toBe(33)
  expect(geometry.rowHeights.slice(1).every((height) => Math.abs(height - 35) <= 0.5)).toBe(true)

  await expect(page.locator('.category-description h1')).not.toHaveText('-')
  await expect(page.locator('.category-description p')).not.toHaveText('')
  await expect(page.locator('.category-list button span')).toHaveText(
    deliveryStageDirectories.map(([label]) => label),
  )
  for (const [index, [label, description]] of deliveryStageDirectories.entries()) {
    await page.locator('.category-list button').nth(index).click()
    await expect(page.locator('.category-description h1')).toHaveText(label)
    await expect(page.locator('.category-description p')).toHaveText(description)
  }
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
  await expect(table.locator('tbody tr').first()).toContainText('DC-TPL-KICKOFF-V1.0.md')

  await page.locator('.keyword-input input').clear()
  await page.getByRole('button', { name: '查询' }).click()
  await expect(table.locator('tbody tr').first()).toBeVisible()
  await page.locator('.category-tabs button').nth(1).click()
  await expect(page.locator('.category-tabs button').nth(1)).toHaveClass(/active/u)
  await expect(page.locator('.category-list button span')).toHaveText([...managementDomainLabels])
  for (const [index, label] of managementDomainLabels.entries()) {
    await page.locator('.category-list button').nth(index).click()
    await expect(page.locator('.category-description h1')).toHaveText(label)
    await expect(page.locator('.category-description p')).toHaveText(
      managementDomainDescriptions[index],
    )
  }
  await page.locator('.category-tabs button').nth(0).click()
  await expect(page.locator('.category-tabs button').nth(0)).toHaveClass(/active/u)

  await table.locator('.standard-table__title-button').first().click()
  await expect(page.locator('.attachment-preview-modal')).toBeVisible()
  await expect(page.locator('.arco-drawer')).toHaveCount(0)
  await page.locator('.attachment-preview-modal .arco-modal-close-btn').click()
  await page.getByRole('button', { name: '新增', exact: true }).click()
  const createModal = page.locator('.arco-modal:visible')
  await expect(createModal).toBeVisible()
  const managementDomainField = createModal
    .locator('.arco-form-item')
    .filter({ hasText: '管理领域' })
  await managementDomainField.locator('.arco-select').click()
  await expect(page.locator('.arco-select-dropdown:visible .arco-select-option')).toHaveText([
    ...managementDomainLabels,
  ])
  await page.keyboard.press('Escape')
  await createModal.locator('.arco-modal-close-btn').click()

  const panelHeights: number[] = []
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/#/standards')
    await expect(page.locator('.standard-table tbody tr').first()).toBeVisible()
    const adaptiveLayout = await page.locator('.standard-library').evaluate((standardRoot) => {
      const panel = standardRoot.querySelector<HTMLElement>('.library-panel')
      const sidebar = standardRoot.querySelector<HTMLElement>('.category-sidebar')
      const content = standardRoot.querySelector<HTMLElement>('.content-panel')
      const categoryList = standardRoot.querySelector<HTMLElement>('.category-list')
      const tableRegion = standardRoot.querySelector<HTMLElement>('.table-region')
      if (!panel || !sidebar || !content || !categoryList || !tableRegion) {
        throw new Error('Standard library adaptive layout nodes are incomplete')
      }
      const rootBox = standardRoot.getBoundingClientRect()
      const panelBox = panel.getBoundingClientRect()
      const sidebarBox = sidebar.getBoundingClientRect()
      const contentBox = content.getBoundingClientRect()
      return {
        panelHeight: Math.round(panelBox.height),
        panelBottomInset: Math.round(rootBox.bottom - panelBox.bottom),
        sideContentBottomDelta: Math.abs(sidebarBox.bottom - contentBox.bottom),
        rootOverflowY: getComputedStyle(standardRoot).overflowY,
        categoryOverflowY: getComputedStyle(categoryList).overflowY,
        tableOverflowY: getComputedStyle(tableRegion).overflowY,
      }
    })
    panelHeights.push(adaptiveLayout.panelHeight)
    expect(adaptiveLayout).toMatchObject({
      panelBottomInset: 13,
      sideContentBottomDelta: 0,
      rootOverflowY: 'hidden',
      categoryOverflowY: 'auto',
      tableOverflowY: 'auto',
    })
    await page.locator('.standard-library').screenshot({
      path: resolve(
        process.cwd(),
        `../.ai-work/acceptance-standard-library-${viewport.width}x${viewport.height}.png`,
      ),
    })
  }
  expect(panelHeights[1]).toBeGreaterThan(panelHeights[0])
  expect(panelHeights[2]).toBeGreaterThan(panelHeights[1])
  expect(browserErrors).toEqual([])
})

test('standard library keeps real loading, empty and validation errors inside the Figma frame', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const accessToken = await login(page)
  const authorization = { authorization: `Bearer ${accessToken}` }
  let delayedRealList = false

  await page.route('**/api/v1/standards?**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/api/v1/standards') {
      await route.continue()
      return
    }

    const response = await route.fetch()
    if (!delayedRealList) {
      delayedRealList = true
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 750))
    }
    await route.fulfill({ response })
  })

  const emptyKeyword = `standard-library-empty-${Date.now()}`
  await page.goto(`/#/standards?keyword=${emptyKeyword}`)
  await expect(page.locator('.standard-table .arco-spin-loading')).toBeVisible()
  await expect(page.locator('.standard-table').getByText('暂无标准', { exact: true })).toBeVisible()
  await expect(page.locator('.library-panel')).toBeVisible()

  const firstPageResponse = await page.request.get(
    '/api/v1/standards?page=1&pageSize=3&sortBy=name&sortOrder=asc',
    { headers: authorization },
  )
  const secondPageResponse = await page.request.get(
    '/api/v1/standards?page=2&pageSize=3&sortBy=name&sortOrder=asc',
    { headers: authorization },
  )
  const ascendingResponse = await page.request.get(
    '/api/v1/standards?page=1&pageSize=100&sortBy=name&sortOrder=asc',
    { headers: authorization },
  )
  const descendingResponse = await page.request.get(
    '/api/v1/standards?page=1&pageSize=100&sortBy=name&sortOrder=desc',
    { headers: authorization },
  )
  expect(firstPageResponse.status()).toBe(200)
  expect(secondPageResponse.status()).toBe(200)
  expect(ascendingResponse.status()).toBe(200)
  expect(descendingResponse.status()).toBe(200)
  const firstPage = (await firstPageResponse.json()) as StandardListEnvelope
  const secondPage = (await secondPageResponse.json()) as StandardListEnvelope
  const ascending = (await ascendingResponse.json()) as StandardListEnvelope
  const descending = (await descendingResponse.json()) as StandardListEnvelope
  expect(firstPage.data).toMatchObject({ page: 1, pageSize: 3 })
  expect(secondPage.data).toMatchObject({ page: 2, pageSize: 3 })
  expect(firstPage.data.total).toBeGreaterThan(3)
  expect(
    firstPage.data.items.every(
      (firstItem) => !secondPage.data.items.some((secondItem) => secondItem.id === firstItem.id),
    ),
  ).toBe(true)
  expect(descending.data.items.map((item) => item.id)).toEqual(
    [...ascending.data.items].reverse().map((item) => item.id),
  )

  const invalidKeyword = 'x'.repeat(101)
  const validationResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/v1/standards' && response.status() === 400
  })
  await page.locator('.keyword-input input').fill(invalidKeyword)
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await validationResponse
  const validationMessage = page.locator('.arco-message-error').first()
  await expect(validationMessage).toBeVisible()
  await expect(validationMessage).not.toContainText('Request failed with status code 400')
  await expect(page.locator('.library-panel')).toBeVisible()
})

test('standard library renders a real long draft, actions and minimum-width scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const accessToken = await login(page)
  const authorization = { authorization: `Bearer ${accessToken}` }
  const marker = Date.now().toString(36).toUpperCase()
  const standardCode = `UI-LONG-${marker}`
  const longName = `标准库长文本视觉验收-${'超长标准名称'.repeat(28)}-${marker}`.slice(0, 190)
  const longFileName = `${`标准库超长文件名-${'项目交付标准资料'.repeat(18)}-${marker}`.slice(
    0,
    180,
  )}.md`
  let standardId = ''

  try {
    const fieldsResponse = await page.request.get('/api/v1/field-options/module/standard', {
      headers: authorization,
    })
    expect(fieldsResponse.status()).toBe(200)
    const fields = (await fieldsResponse.json()) as FieldConfigurationEnvelope
    const field = (code: string) => {
      const configuration = fields.data.find((candidate) => candidate.fieldCode === code)
      if (!configuration) throw new Error(`Missing standard field configuration ${code}`)
      return configuration
    }
    const activeValue = (code: string): string => {
      const configuration = field(code)
      const configuredDefault = String(configuration.defaultValue ?? '')
      return (
        configuration.options.find((option) => option.enabled && option.value === configuredDefault)
          ?.value ??
        configuration.options.find((option) => option.enabled)?.value ??
        ''
      )
    }
    const type = activeValue('STANDARD_TYPE')
    const deliveryStageCode = activeValue('STANDARD_DELIVERY_STAGE')
    const businessTypeCode = activeValue('STANDARD_BUSINESS_TYPE')
    const countryCode = activeValue('COUNTRY')
    expect([type, deliveryStageCode, businessTypeCode, countryCode].every(Boolean)).toBe(true)

    const uploadResponse = await page.request.post('/api/v1/files/drafts', {
      headers: {
        ...authorization,
        'idempotency-key': `standard-long-upload-${marker}`,
      },
      multipart: {
        ownerType: 'STANDARD',
        changeDescription: 'standard library long-text visual acceptance',
        file: {
          name: longFileName,
          mimeType: 'text/markdown',
          buffer: Buffer.from('# Standard library long-text visual acceptance\n', 'utf8'),
        },
      },
    })
    expect(uploadResponse.status()).toBe(201)
    const upload = (await uploadResponse.json()) as DraftUploadEnvelope

    const createResponse = await page.request.post('/api/v1/standards', {
      headers: authorization,
      data: {
        code: standardCode,
        name: longName,
        type,
        deliveryStageCode,
        businessTypeCode,
        countryCodes: [countryCode],
        isEnabled: true,
        effectiveAt: '2026-12-12T00:00:00.000Z',
        version: 'V9.9',
        fileVersionId: upload.data.fileVersionId,
        changeDescription: 'standard library long-text visual acceptance',
      },
    })
    expect(createResponse.status()).toBe(201)
    const created = (await createResponse.json()) as StandardEnvelope
    standardId = created.data.id

    await page.goto(`/#/standards?keyword=${encodeURIComponent(standardCode)}`)
    const row = page.locator('.standard-table tbody tr').filter({ hasText: longFileName })
    await expect(row).toHaveCount(1)
    const titleButton = row.locator('.standard-table__title-button')
    await expect(titleButton).toHaveAttribute('title', longFileName)
    const titleMetrics = await titleButton
      .locator('.standard-table__title-text')
      .evaluate((element) => ({
        clientWidth: element.clientWidth,
        overflow: getComputedStyle(element).overflow,
        scrollWidth: element.scrollWidth,
        textOverflow: getComputedStyle(element).textOverflow,
        whiteSpace: getComputedStyle(element).whiteSpace,
      }))
    expect(titleMetrics.clientWidth).toBeGreaterThan(0)
    expect(titleMetrics.scrollWidth).toBeGreaterThanOrEqual(titleMetrics.clientWidth)
    expect(titleMetrics.overflow).toBe('hidden')
    expect(titleMetrics.textOverflow).toBe('ellipsis')
    expect(titleMetrics.whiteSpace).toBe('nowrap')
    await expect(row.locator('td').nth(1)).toHaveText('-')
    await expect(row.locator('td').nth(2)).toHaveText('-')
    await expect(row.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
    await expect(row.getByRole('button', { name: '归档', exact: true })).toBeVisible()

    await page.setViewportSize({ width: 1280, height: 800 })
    const horizontalScroll = page.locator('.table-region .business-table__viewport')
    const dimensions = await horizontalScroll.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth)
    await horizontalScroll.evaluate((element) => {
      element.scrollTo({ left: element.scrollWidth, behavior: 'instant' })
    })
    await expect
      .poll(() => horizontalScroll.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0)
    const archiveButton = row.getByRole('button', { name: '归档', exact: true })
    const horizontalBounds = await archiveButton.evaluate((element) => {
      const viewport = element
        .closest('.business-table')
        ?.querySelector('.business-table__viewport')
      if (!(viewport instanceof HTMLElement)) throw new Error('Missing BusinessTable viewport')
      const buttonRect = element.getBoundingClientRect()
      const viewportRect = viewport.getBoundingClientRect()
      return {
        buttonLeft: buttonRect.left,
        buttonRight: buttonRect.right,
        viewportLeft: viewportRect.left,
        viewportRight: viewportRect.right,
      }
    })
    expect(horizontalBounds.buttonLeft).toBeGreaterThanOrEqual(horizontalBounds.viewportLeft - 1)
    expect(horizontalBounds.buttonRight).toBeLessThanOrEqual(horizontalBounds.viewportRight + 1)
  } finally {
    if (standardId) {
      const archiveResponse = await page.request.post(`/api/v1/standards/${standardId}/archive`, {
        headers: authorization,
      })
      expect(archiveResponse.status()).toBe(200)
    }
  }
})

test('a real limited account cannot enter the standard library', async ({ page }) => {
  await login(page, limitedUsername, limitedPassword)
  await page.goto('/#/standards')
  await page.waitForURL((url) => url.hash === '#/dashboard')
  await expect(page.locator('.standard-library')).toHaveCount(0)
  await expect(
    page.locator('.arco-message-error').filter({ hasText: '没有权限访问此页面' }),
  ).toBeVisible()
})
