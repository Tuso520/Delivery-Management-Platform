import { expect, test, type Page, type Route } from '@playwright/test'

const adminUsername = process.env.E2E_ADMIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD

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
      allCellsNoWrap: [...panel.querySelectorAll<HTMLElement>('.arco-table-th, .arco-table-td')]
        .every((cell) => getComputedStyle(cell).whiteSpace === 'nowrap'),
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

test('project overview uses wheel loading, large rows and a fixed project-name column', async ({ page }) => {
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
  await expect(page.getByText('VND 987,654,321,012.00', { exact: true })).toBeVisible()
  await expect(page.getByText('CNY 2,888,888.13', { exact: true })).toBeVisible()
  await expect(page.getByText('越南 · 胡志明市', { exact: true })).toBeVisible()

  const metrics = await projectTableMetrics(page)
  expect(metrics).toMatchObject({
    actionsRightAligned: true,
    allCellsNoWrap: true,
    hasHorizontalOverflow: true,
    hasVerticalOverflow: true,
    tableLayout: 'auto',
    tableMinWidthCoversViewport: true,
  })
  expect(metrics.rowHeight).toBeGreaterThanOrEqual(48)
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
