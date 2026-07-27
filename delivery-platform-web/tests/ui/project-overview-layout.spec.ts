import { expect, test, type Page, type Route } from '@playwright/test'
import { resolve } from 'node:path'

const adminUsername = process.env.E2E_ADMIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const acceptanceScreenshot = resolve(
  process.cwd(),
  '../.ai-work/acceptance-project-overview-1440x900.png',
)

async function login(page: Page): Promise<void> {
  if (!adminUsername || !adminPassword) throw new Error('UI E2E credentials are required')

  await page.goto('/#/login')
  const fields = page.locator('.login-form input')
  await expect(fields).toHaveCount(2)
  await expect(page.locator('.login-form .password-visibility')).toBeVisible()
  await fields.nth(0).fill(adminUsername)
  await fields.nth(1).fill(adminPassword)
  await page.locator('.login-button').click()
  await page.waitForURL((url) => !url.hash.startsWith('#/login'))
}

function createProjectScenario() {
  let template: Record<string, unknown> | undefined
  let requestCount = 0

  return {
    get requestCount() {
      return requestCount
    },
    async fulfill(route: Route): Promise<void> {
      requestCount += 1
      const response = await route.fetch()
      const envelope = await response.json()
      const sourceItems = envelope?.data?.items
      template = (Array.isArray(sourceItems) && sourceItems[0]) || template
      if (!template) {
        await route.fulfill({ response })
        return
      }

      const url = new URL(route.request().url())
      const page = Number(url.searchParams.get('page') || 1)
      const pageSize = Number(url.searchParams.get('pageSize') || 20)
      const allItems = Array.from({ length: 45 }, (_, index) => ({
        ...template,
        id: `layout-project-${index + 1}`,
        projectCode: `LAYOUT-${String(index + 1).padStart(3, '0')}`,
        projectName: `布局验收项目 ${index + 1}`,
        shortName: `布局验收项目 ${index + 1}`,
        countryCode: index === 0 ? 'VN' : template?.countryCode,
        countryName: index === 0 ? '越南' : template?.countryName,
        city: index === 0 ? '胡志明市' : template?.city,
        cityName: index === 0 ? null : template?.cityName,
        contractCurrency: index === 0 ? 'VND' : template?.contractCurrency,
        contractAmount: index === 0 ? '987654321012' : template?.contractAmount,
        convertedAmount: index === 0 ? '2888888.126' : template?.convertedAmount,
      }))
      const start = (page - 1) * pageSize

      await route.fulfill({
        response,
        json: {
          ...envelope,
          data: {
            ...envelope.data,
            items: allItems.slice(start, start + pageSize),
            page,
            pageSize,
            total: allItems.length,
          },
        },
      })
    },
  }
}

async function projectTableMetrics(page: Page) {
  return page.locator('.project-list-panel').evaluate((panel) => {
    const viewport = panel.querySelector<HTMLElement>('.business-table__viewport')
    const table = panel.querySelector<HTMLElement>('.arco-table-element')
    const actions = panel.querySelector<HTMLElement>('.page-toolbar__actions')
    const firstCell = panel.querySelector<HTMLElement>('.arco-table-td')
    if (!viewport || !table || !actions || !firstCell) {
      throw new Error('Project overview layout nodes are incomplete')
    }
    const panelBox = panel.getBoundingClientRect()
    const actionBox = actions.getBoundingClientRect()
    return {
      actionsRightAligned: panelBox.right - actionBox.right <= 17,
      allCellsNoWrap: [
        ...panel.querySelectorAll<HTMLElement>('.arco-table-th, .arco-table-td'),
      ].every((cell) => getComputedStyle(cell).whiteSpace === 'nowrap'),
      hasHorizontalOverflow: viewport.scrollWidth > viewport.clientWidth,
      hasVerticalOverflow: viewport.scrollHeight > viewport.clientHeight,
      rowHeight: Math.round(firstCell.getBoundingClientRect().height),
      tableLayout: getComputedStyle(table).tableLayout,
      tableMinWidthCoversViewport: table.getBoundingClientRect().width >= viewport.clientWidth,
    }
  })
}

async function firstColumnHorizontalMovement(page: Page): Promise<number> {
  return page.locator('.project-list-panel').evaluate(async (panel) => {
    const firstHeader = panel.querySelector<HTMLElement>('.arco-table-th')
    const viewport = panel.querySelector<HTMLElement>('.business-table__viewport')
    if (!firstHeader || !viewport) throw new Error('Scrollable project table nodes are incomplete')
    const initialLeft = firstHeader.getBoundingClientRect().left
    viewport.scrollLeft = 240
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return Math.round(firstHeader.getBoundingClientRect().left - initialLeft)
  })
}

async function alignmentMetrics(page: Page, zoom: 1 | 2, requireSelect = true) {
  return page.evaluate(
    ({ scale, shouldRequireSelect }) => {
      document.documentElement.style.zoom = String(scale)

      const centerY = (element: Element): number => {
        const box = element.getBoundingClientRect()
        return box.top + box.height / 2
      }
      const delta = (row: Element, child: Element | null): number =>
        child ? Math.abs(centerY(row) - centerY(child)) : Number.POSITIVE_INFINITY

      const primaryRows = [
        ...document.querySelectorAll<HTMLElement>(
          '.sidebar-menu > .arco-menu-inner > .arco-menu-item, .sidebar-menu > .arco-menu-inner > .arco-menu-inline > .arco-menu-inline-header',
        ),
      ]
      const primaryDeltas = primaryRows.map((row) => ({
        icon: delta(row, row.querySelector('.menu-icon-box')),
        label: delta(row, row.querySelector('.menu-title, .arco-menu-item-inner')),
        chevron: row.matches('.arco-menu-inline-header')
          ? delta(row, row.querySelector('.menu-chevron-box'))
          : 0,
      }))
      const secondaryRows = [
        ...document.querySelectorAll<HTMLElement>(
          '.sidebar-menu .arco-menu-inline-content > .arco-menu-item',
        ),
      ]
      const select = document.querySelector<HTMLElement>('.scope-field .arco-select-view-single')
      const selectValue = document.querySelector<HTMLElement>(
        '.scope-field .arco-select-view-value',
      )
      const selectArrow = document.querySelector<HTMLElement>('.scope-field .select-arrow-box')
      if (shouldRequireSelect && (!select || !selectValue || !selectArrow)) {
        throw new Error('Project scope select alignment nodes are incomplete')
      }

      return {
        primaryCount: primaryRows.length,
        primaryMaxDelta: Math.max(
          ...primaryDeltas.flatMap((item) => [item.icon, item.label, item.chevron]),
        ),
        secondaryCount: secondaryRows.length,
        secondaryMaxDelta: Math.max(
          ...secondaryRows.map((row) => delta(row, row.querySelector('.arco-menu-item-inner'))),
        ),
        secondaryLeft: secondaryRows.map((row) =>
          Number.parseFloat(getComputedStyle(row).paddingLeft),
        ),
        selectValueDelta: select && selectValue ? delta(select, selectValue) : 0,
        selectArrowDelta: select && selectArrow ? delta(select, selectArrow) : 0,
        selectArrowCount: document.querySelectorAll('.scope-field .select-arrow-box').length,
        defaultSelectArrowCount: document.querySelectorAll('.scope-field .arco-icon-down').length,
        menuIconDisplay: getComputedStyle(document.querySelector<HTMLElement>('.figma-menu-icon')!)
          .display,
        menuIconBoxDisplay: getComputedStyle(document.querySelector<HTMLElement>('.menu-icon-box')!)
          .display,
        menuChevronBoxDisplay: getComputedStyle(
          document.querySelector<HTMLElement>('.menu-chevron-box')!,
        ).display,
        selectArrowBoxDisplay: selectArrow ? getComputedStyle(selectArrow).display : '',
        zoom: Number.parseFloat(getComputedStyle(document.documentElement).zoom),
      }
    },
    { scale: zoom, shouldRequireSelect: requireSelect },
  )
}

test('project overview matches the Figma shell with real API data at 1440x900', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)

  const listResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/projects?') &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  )
  await page.goto('/#/projects')
  await listResponse
  await expect(page.locator('.summary-band')).toBeVisible()
  await expect(page.locator('.project-link').first()).toBeVisible({ timeout: 60_000 })

  const layout = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.layout-header')
    const sidebar = document.querySelector<HTMLElement>('.layout-aside')
    const content = document.querySelector<HTMLElement>('.layout-content')
    const projectPage = document.querySelector<HTMLElement>('.project-page')
    const summary = document.querySelector<HTMLElement>('.summary-band')
    const toolbar = document.querySelector<HTMLElement>('.project-toolbar')
    const tableFrame = document.querySelector<HTMLElement>('.project-table-frame')
    if (!header || !sidebar || !content || !projectPage || !summary || !toolbar || !tableFrame) {
      throw new Error('Project overview shell nodes are incomplete')
    }
    const pageBox = projectPage.getBoundingClientRect()
    const summaryBox = summary.getBoundingClientRect()
    const toolbarBox = toolbar.getBoundingClientRect()
    const tableBox = tableFrame.getBoundingClientRect()
    const metricIcon = document.querySelector<HTMLElement>('.metric-icon')
    const metricImage = metricIcon?.querySelector<HTMLImageElement>('img')
    if (!metricIcon || !metricImage) throw new Error('Project overview metric icon is missing')
    return {
      headerHeight: Math.round(header.getBoundingClientRect().height),
      sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
      contentPaddingLeft: Math.round(Number.parseFloat(getComputedStyle(content).paddingLeft)),
      pageWidth: Math.round(pageBox.width),
      pageHeight: Math.round(pageBox.height),
      summaryHeight: Math.round(summary.getBoundingClientRect().height),
      summaryTop: Math.round(summaryBox.top - pageBox.top),
      toolbarHeight: Math.round(toolbar.getBoundingClientRect().height),
      toolbarTop: Math.round(toolbarBox.top - pageBox.top),
      tableTop: Math.round(tableBox.top - pageBox.top),
      iconContainerSize: Math.round(metricIcon.getBoundingClientRect().width),
      iconSize: Math.round(metricImage.getBoundingClientRect().width),
      iconBackground: getComputedStyle(metricIcon).backgroundColor,
    }
  })

  expect(layout).toEqual({
    headerHeight: 60,
    sidebarWidth: 180,
    contentPaddingLeft: 13,
    pageWidth: 1234,
    pageHeight: 784,
    summaryHeight: 100,
    summaryTop: 13,
    toolbarHeight: 32,
    toolbarTop: 125,
    tableTop: 169,
    iconContainerSize: 48,
    iconSize: 28,
    iconBackground: 'rgba(0, 0, 0, 0)',
  })

  const expectedSummaryLabels = [
    '项目金额（CNY）',
    '确收金额（CNY）',
    '项目总数',
    '进行中的项目',
    '今年验收项目',
  ]
  await expect(page.locator('.metric-label')).toHaveText(expectedSummaryLabels)
  for (const label of expectedSummaryLabels) {
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(page.locator('.keyword-input input')).toHaveAttribute('placeholder', '搜索项目名称')
  expect(
    await page
      .locator('.search-button')
      .evaluate((button) => getComputedStyle(button).backgroundColor),
  ).toBe('rgb(37, 99, 235)')
  const refreshButton = page.locator('.project-toolbar .page-toolbar__actions .arco-btn').first()
  await expect(refreshButton).toBeEnabled()
  expect(await refreshButton.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe(
    'rgb(242, 243, 245)',
  )

  const tableHeaders = await page
    .locator('.project-list-panel thead .arco-table-th')
    .allTextContents()
  expect(tableHeaders.slice(0, 13).map((value) => value.trim())).toEqual([
    '项目名称',
    '项目经理',
    '项目地点',
    '当前阶段',
    '项目进度',
    '签约时间',
    '验收时间',
    '合同币种',
    '合同金额',
    '折算人民币金额',
    '客户类型',
    '合同类型',
    '销售',
  ])

  const columnWidths = await page
    .locator('.project-list-panel thead .arco-table-th')
    .evaluateAll((headers) =>
      headers.slice(0, 13).map((header) => Math.round(header.getBoundingClientRect().width)),
    )
  expect(columnWidths).toEqual([
    120, 110, 160, 200, 180, 120, 120, 115, 160, 160, 120, 110, 100,
  ])

  const leftAlignedOffsets = await page
    .locator('.project-list-panel tbody .arco-table-tr')
    .first()
    .evaluate((row) => {
      const cells = [...row.querySelectorAll<HTMLElement>('.arco-table-td')]
      const selectors = new Map<number, string>([
        [0, '.project-link'],
        [2, '.cell-left'],
        [3, '.stage-cell'],
        [4, '.progress'],
        [8, '.money-cell'],
      ])
      return [...selectors].map(([index, selector]) => {
        const cell = cells[index]
        const content = cell?.querySelector<HTMLElement>(selector)
        if (!cell || !content) throw new Error(`Missing alignment node for column ${index}`)
        return Math.round(content.getBoundingClientRect().left - cell.getBoundingClientRect().left)
      })
    })
  expect(leftAlignedOffsets).toEqual([12, 12, 12, 12, 12])

  await expect(page.locator('.arco-message')).toHaveCount(0, { timeout: 10_000 })
  await page.screenshot({ path: acceptanceScreenshot, animations: 'disabled' })
})

test('project overview keeps loading, empty and error states inside the Figma table frame', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)

  let responseMode: 'empty' | 'error' = 'empty'
  await page.route('**/api/v1/projects?**', async (route) => {
    if (responseMode === 'error') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        json: {
          code: 500,
          message: '项目列表验收错误',
          data: null,
          timestamp: new Date().toISOString(),
          traceId: 'project-overview-state-test',
        },
      })
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 750))
    const response = await route.fetch()
    const envelope = await response.json()
    await route.fulfill({
      response,
      json: {
        ...envelope,
        data: {
          ...envelope.data,
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
        },
      },
    })
  })

  await page.goto('/#/projects?keyword=project-overview-empty-state')
  await expect(page.locator('.project-list-panel .arco-spin-loading')).toBeVisible()
  await expect(page.locator('.business-empty')).toContainText('暂无符合条件的项目')
  await expect(page.locator('.project-table-frame')).toHaveCSS('height', '602px')

  responseMode = 'error'
  await page.getByPlaceholder('搜索项目名称', { exact: true }).fill('project-overview-error-state')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.locator('.project-table-frame .arco-result')).toBeVisible()
  await expect(page.locator('.project-table-frame')).toContainText(
    'Request failed with status code 500',
  )
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
  await expect(page.locator('.project-table-frame')).toHaveCSS('height', '602px')
})

test('project scope exposes archived projects and project manager sorting cycles both directions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  await page.goto('/#/projects')
  await expect(page.locator('.scope-field .arco-select-view')).toBeVisible()

  await page.locator('.scope-field .arco-select-view').click()
  const archivedOption = page
    .locator('.arco-select-option:visible')
    .filter({ hasText: '归档项目' })
  await expect(archivedOption).toBeVisible()
  const archivedRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname === '/api/v1/projects' && url.searchParams.get('scope') === 'archived'
  })
  await archivedOption.click()
  await archivedRequest
  await expect(page).toHaveURL(/scope=archived/u)

  const sortButton = page.getByRole('button', { name: '切换项目经理排序' })
  const ascendingRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return (
      url.pathname === '/api/v1/projects' &&
      url.searchParams.get('sort') === 'projectManager:asc'
    )
  })
  await sortButton.click()
  await ascendingRequest
  await expect(page).toHaveURL(/sort=projectManager:asc/u)

  const descendingRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return (
      url.pathname === '/api/v1/projects' &&
      url.searchParams.get('sort') === 'projectManager:desc'
    )
  })
  await sortButton.click()
  await descendingRequest
  await expect(page).toHaveURL(/sort=projectManager:desc/u)
})

test('project overview stays inside the App Shell at common desktop widths', async ({ page }) => {
  await login(page)

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/#/projects')
    await expect(page.locator('.project-table-frame')).toBeVisible()
    const metrics = await page.evaluate(() => {
      const root = document.documentElement
      const main = document.querySelector<HTMLElement>('.layout-main')
      const projectPage = document.querySelector<HTMLElement>('.project-page')
      const tableFrame = document.querySelector<HTMLElement>('.project-table-frame')
      if (!main || !projectPage || !tableFrame) {
        throw new Error('Project overview responsive layout nodes are incomplete')
      }
      const mainBox = main.getBoundingClientRect()
      const pageBox = projectPage.getBoundingClientRect()
      const tableBox = tableFrame.getBoundingClientRect()
      return {
        documentOverflow: root.scrollWidth - root.clientWidth,
        pageOverflow: projectPage.scrollWidth - projectPage.clientWidth,
        pageInsideMain:
          pageBox.left >= mainBox.left - 1 &&
          pageBox.right <= mainBox.right + 1 &&
          pageBox.bottom <= mainBox.bottom + 1,
        tableInsidePage:
          tableBox.left >= pageBox.left &&
          tableBox.right <= pageBox.right &&
          tableBox.bottom <= pageBox.bottom,
      }
    })
    expect(metrics).toEqual({
      documentOverflow: 0,
      pageOverflow: 0,
      pageInsideMain: true,
      tableInsidePage: true,
    })
  }
})

test('sidebar and project scope select remain centered at 100% and 200%', async ({ page }) => {
  const consoleErrors: string[] = []
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.goto('/#/projects')
  await expect(page.locator('.scope-field .arco-select-view-single')).toBeVisible()

  for (const zoom of [1, 2] as const) {
    const metrics = await alignmentMetrics(page, zoom)
    expect(metrics).toMatchObject({
      primaryCount: 4,
      selectArrowCount: 1,
      defaultSelectArrowCount: 0,
      menuIconDisplay: 'block',
      menuIconBoxDisplay: 'flex',
      menuChevronBoxDisplay: 'flex',
      selectArrowBoxDisplay: 'flex',
      zoom,
    })
    expect(metrics.secondaryCount).toBeGreaterThan(0)
    expect(metrics.secondaryLeft.every((padding) => padding === 42)).toBe(true)
    expect(metrics.primaryMaxDelta).toBeLessThanOrEqual(1)
    expect(metrics.secondaryMaxDelta).toBeLessThanOrEqual(1)
    expect(metrics.selectValueDelta).toBeLessThanOrEqual(1)
    expect(metrics.selectArrowDelta).toBeLessThanOrEqual(1)
  }
  expect(consoleErrors).toEqual([])
})

test('shared sidebar alignment does not regress representative pages', async ({ page }) => {
  const consoleErrors: string[] = []
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  for (const path of ['/dashboard', '/standards', '/knowledge', '/settings']) {
    await page.goto(`/#${path}`)
    await expect(page.locator('.layout-aside')).toBeVisible()
    const metrics = await alignmentMetrics(page, 1, false)
    expect(metrics.primaryCount).toBe(4)
    expect(metrics.primaryMaxDelta).toBeLessThanOrEqual(1)
    expect(metrics.secondaryMaxDelta).toBeLessThanOrEqual(1)
  }
  expect(consoleErrors).toEqual([])
})

test('project overview uses wheel loading, large rows and a fixed project-name column', async ({
  page,
}) => {
  await login(page)
  const scenario = createProjectScenario()
  await page.route(
    (url) => url.pathname === '/api/v1/projects' && url.searchParams.has('pageSize'),
    (route) => scenario.fulfill(route),
  )

  await page.goto('/#/projects')
  const viewport = page.locator('.project-list-panel .business-table__viewport')
  await expect(page.locator('.project-link')).toHaveCount(20, { timeout: 60_000 })
  await expect(page.locator('.business-table__pagination')).toHaveCount(0)
  await expect(page.locator('.project-list-panel .arco-pagination')).toHaveCount(0)
  await expect(page.getByText('987,654,321,012.00', { exact: true })).toBeVisible()
  await expect(page.getByText('2,888,888.13', { exact: true })).toBeVisible()
  await expect(
    page.locator('.project-list-panel tbody .arco-table-tr').first().locator('.arco-table-td').nth(7),
  ).toContainText('越南盾')
  await expect(page.getByText('越南 · 胡志明市', { exact: true })).toBeVisible()

  const metrics = await projectTableMetrics(page)
  expect(metrics).toMatchObject({
    actionsRightAligned: true,
    allCellsNoWrap: true,
    hasHorizontalOverflow: true,
    hasVerticalOverflow: true,
    tableLayout: 'fixed',
    tableMinWidthCoversViewport: true,
  })
  expect(metrics.rowHeight).toBeGreaterThanOrEqual(42)
  expect(Math.abs(await firstColumnHorizontalMovement(page))).toBeLessThanOrEqual(1)

  await viewport.hover()
  await page.mouse.wheel(0, 2400)
  await expect(page.locator('.project-link')).toHaveCount(40)
  await page.mouse.wheel(0, 2400)
  await expect(page.locator('.project-link')).toHaveCount(45)
  const completedRequestCount = scenario.requestCount
  await page.mouse.wheel(0, 2400)
  await page.waitForTimeout(500)
  expect(scenario.requestCount).toBe(completedRequestCount)
})

test('archive template table keeps its declared column widths stable', async ({ page }) => {
  await login(page)
  await page.goto('/#/archive-template')
  await expect(page.locator('.template-link').first()).toBeVisible({ timeout: 60_000 })

  const metrics = await page.locator('.table-card').evaluate(async (card) => {
    const table = card.querySelector<HTMLElement>('.arco-table-element')
    const viewport = card.querySelector<HTMLElement>('.business-table__viewport')
    if (!table || !viewport) throw new Error('Archive template table nodes are incomplete')

    const snapshots: string[] = []
    for (let frame = 0; frame < 20; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const headerWidths = [...table.querySelectorAll<HTMLElement>('thead .arco-table-th')].map(
        (header) => Math.round(header.getBoundingClientRect().width),
      )
      snapshots.push(`${Math.round(table.getBoundingClientRect().width)}:${headerWidths.join(',')}`)
    }

    return {
      distinctWidthSnapshots: new Set(snapshots).size,
      hasPreservedWidthClass: Boolean(
        card.querySelector('.business-table--preserve-column-widths'),
      ),
      scrollWidth: viewport.scrollWidth,
      tableLayout: getComputedStyle(table).tableLayout,
    }
  })

  expect(metrics).toMatchObject({
    distinctWidthSnapshots: 1,
    hasPreservedWidthClass: true,
    tableLayout: 'fixed',
  })
  expect(metrics.scrollWidth).toBeGreaterThanOrEqual(1080)
})
