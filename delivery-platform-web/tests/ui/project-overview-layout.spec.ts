import { expect, test, type Page, type Route } from '@playwright/test'

const adminUsername = process.env.E2E_ADMIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD

async function login(page: Page): Promise<void> {
  if (!adminUsername || !adminPassword) throw new Error('UI E2E credentials are required')

  await page.goto('/#/login')
  const fields = page.locator('.login-form input')
  await fields.nth(0).fill(adminUsername)
  await fields.nth(1).fill(adminPassword)
  await page.locator('.login-button').click()
  await page.waitForURL((url) => !url.hash.startsWith('#/login'))
}

async function fulfillTwelveProjectScenario(route: Route): Promise<void> {
  const response = await route.fetch()
  const envelope = await response.json()
  const sourceItems = envelope?.data?.items
  if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
    await route.fulfill({ response })
    return
  }

  const url = new URL(route.request().url())
  const pageSize = Number(url.searchParams.get('pageSize') || 20)
  const items = Array.from({ length: 12 }, (_, index) => ({
    ...sourceItems[index % sourceItems.length],
    id: `layout-project-${index + 1}`,
    projectCode: `LAYOUT-${String(index + 1).padStart(3, '0')}`,
    projectName: `布局验收项目 ${index + 1}`,
    shortName: `布局验收项目 ${index + 1}`,
    countryCode: index === 0 ? 'VN' : sourceItems[index % sourceItems.length].countryCode,
    countryName: index === 0 ? '越南' : sourceItems[index % sourceItems.length].countryName,
    city: index === 0 ? '胡志明市' : sourceItems[index % sourceItems.length].city,
    cityName: index === 0 ? null : sourceItems[index % sourceItems.length].cityName,
    contractCurrency: index === 0 ? 'VND' : sourceItems[index % sourceItems.length].contractCurrency,
    contractAmount: index === 0 ? '987654321012' : sourceItems[index % sourceItems.length].contractAmount,
    convertedAmount: index === 0 ? '2888888.126' : sourceItems[index % sourceItems.length].convertedAmount,
  }))

  await route.fulfill({
    response,
    json: {
      ...envelope,
      data: {
        ...envelope.data,
        items: items.slice(0, pageSize),
        page: 1,
        pageSize,
        total: 12,
      },
    },
  })
}

async function paginationMetrics(page: Page) {
  return page.locator('.project-list-panel').evaluate((panel) => {
    const pagination = panel.querySelector<HTMLElement>('.business-table__pagination')
    const paginationContent = panel.querySelector<HTMLElement>('.arco-pagination')
    const tableContainer = panel.querySelector<HTMLElement>('.arco-table-container')
    const table = panel.querySelector<HTMLElement>('.arco-table-element')
    const actions = panel.querySelector<HTMLElement>('.page-toolbar__actions')
    if (!pagination || !paginationContent || !tableContainer || !table || !actions) {
      throw new Error('Project overview layout nodes are incomplete')
    }

    const paginationBox = pagination.getBoundingClientRect()
    const panelBox = panel.getBoundingClientRect()
    const actionBox = actions.getBoundingClientRect()
    const childRows = [...paginationContent.children]
      .map((child) => Math.round(child.getBoundingClientRect().top))
      .filter((top) => Number.isFinite(top))
    const scrollCandidates = [
      tableContainer,
      ...panel.querySelectorAll<HTMLElement>(
        '.arco-table-content, .arco-table-body, .arco-scrollbar-container',
      ),
    ]

    return {
      actionsRightAligned: panelBox.right - actionBox.right <= 17,
      paginationHeight: Math.round(paginationBox.height),
      paginationTop: Math.round(paginationBox.top),
      paginationWrapped: new Set(childRows).size > 1,
      tableLayout: getComputedStyle(table).tableLayout,
      tableHasHorizontalOverflow: scrollCandidates.some(
        (element) => element.scrollWidth > element.clientWidth,
      ),
      tableWiderThanPanel: table.getBoundingClientRect().width > panelBox.width,
      allCellsNoWrap: [...panel.querySelectorAll<HTMLElement>('.arco-table-th, .arco-table-td')]
        .every((cell) => getComputedStyle(cell).whiteSpace === 'nowrap'),
    }
  })
}

async function firstColumnHorizontalMovement(page: Page): Promise<number> {
  return page.locator('.project-list-panel').evaluate(async (panel) => {
    const firstHeader = panel.querySelector<HTMLElement>('.arco-table-th')
    const candidates = [
      ...panel.querySelectorAll<HTMLElement>(
        '.arco-table-container, .arco-table-content, .arco-table-body, .arco-scrollbar-container',
      ),
    ]
    const scrollContainer = candidates.find(
      (element) => element.scrollWidth > element.clientWidth,
    )
    if (!firstHeader || !scrollContainer) {
      throw new Error('Scrollable project table nodes are incomplete')
    }

    const initialLeft = firstHeader.getBoundingClientRect().left
    scrollContainer.scrollLeft = 240
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return Math.round(firstHeader.getBoundingClientRect().left - initialLeft)
  })
}

test('project overview remains stable for 12 records at page sizes 10 and 20', async ({ page }) => {
  await login(page)
  await page.route(
    (url) => url.pathname === '/api/v1/projects' && url.searchParams.has('pageSize'),
    fulfillTwelveProjectScenario,
  )

  await page.goto('/#/projects?pageSize=10')
  await expect(page.locator('.project-link')).toHaveCount(10, { timeout: 60_000 })
  await expect(page.getByText('VND 987,654,321,012', { exact: true })).toBeVisible()
  await expect(page.getByText('CNY 2,888,888.13', { exact: true })).toBeVisible()
  await expect(page.getByText('越南 · 胡志明市', { exact: true })).toBeVisible()

  const vndCell = page.getByText('VND 987,654,321,012', { exact: true })
  expect(await vndCell.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(Math.abs(await firstColumnHorizontalMovement(page))).toBeLessThanOrEqual(1)
  const size10 = await paginationMetrics(page)

  await page.locator('.business-table__pagination .arco-select-view').click()
  await page.locator('.arco-select-option').filter({ hasText: /^20/ }).click()
  await expect(page.locator('.project-link')).toHaveCount(12)
  const size20 = await paginationMetrics(page)

  expect(size10).toMatchObject({
    actionsRightAligned: true,
    allCellsNoWrap: true,
    paginationHeight: 57,
    paginationWrapped: false,
    tableHasHorizontalOverflow: true,
    tableLayout: 'auto',
    tableWiderThanPanel: true,
  })
  expect(size20).toMatchObject({
    actionsRightAligned: true,
    allCellsNoWrap: true,
    paginationHeight: 57,
    paginationWrapped: false,
    tableHasHorizontalOverflow: true,
    tableLayout: 'auto',
    tableWiderThanPanel: true,
  })
  expect(size20.paginationTop).toBe(size10.paginationTop)
})
