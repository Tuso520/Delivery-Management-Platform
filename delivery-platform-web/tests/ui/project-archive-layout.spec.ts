import { expect, test, type Page } from '@playwright/test'

const adminUsername = process.env.E2E_ADMIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD

async function login(page: Page): Promise<void> {
  if (!adminUsername || !adminPassword) throw new Error('UI E2E credentials are required')

  await page.goto('/#/login')
  const fields = page.locator('.login-form input')
  await expect(fields).toHaveCount(2)
  await fields.nth(0).fill(adminUsername)
  await fields.nth(1).fill(adminPassword)
  await page.locator('.login-button').click()
  await page.waitForURL((url) => !url.hash.startsWith('#/login'))
}

test('project archive matches Figma 43:317 and fills three desktop viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  await page.goto('/#/archive')
  await expect(page.locator('.archive-directory__item').first()).toBeVisible({
    timeout: 60_000,
  })

  const viewports = [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ]
  const workspaceHeights: number[] = []
  const headerWidthsByViewport: number[][] = []
  const baselineHeaderWidths = [440, 100, 113, 122, 150]

  for (const [viewportIndex, viewport] of viewports.entries()) {
    await page.setViewportSize(viewport)
    await expect(page.locator('.archive-directory__item').first()).toBeVisible()

    const layout = await page.locator('.archive-page').evaluate((root) => {
      const metrics = root.querySelector<HTMLElement>('.archive-metrics')
      const toolbar = root.querySelector<HTMLElement>('.archive-toolbar')
      const projectSelect = root.querySelector<HTMLElement>('.archive-project-select')
      const workspace = root.querySelector<HTMLElement>('.archive-workspace')
      const directory = root.querySelector<HTMLElement>('.archive-directory')
      const directoryScroll = root.querySelector<HTMLElement>('.archive-directory__scroll')
      const firstDirectoryItem = root.querySelector<HTMLElement>('.archive-directory__item')
      const tableViewport = root.querySelector<HTMLElement>('.business-table__viewport')
      const tableElement = root.querySelector<HTMLElement>('.arco-table-element')
      const headers = [...root.querySelectorAll<HTMLElement>('thead .arco-table-th')]
      const cells = [...root.querySelectorAll<HTMLElement>('tbody tr:first-child .arco-table-td')]
      const firstDataCell = cells.length === 5 ? cells[0] : null
      const layoutMain = root.closest<HTMLElement>('.layout-main')
      if (
        !metrics ||
        !toolbar ||
        !projectSelect ||
        !workspace ||
        !directory ||
        !directoryScroll ||
        !firstDirectoryItem ||
        !tableViewport ||
        !tableElement ||
        !layoutMain ||
        headers.length !== 5
      ) {
        throw new Error('Project archive layout nodes are incomplete')
      }
      const rootRect = root.getBoundingClientRect()
      const selectRect = projectSelect.getBoundingClientRect()
      const directoryRect = directory.getBoundingClientRect()
      return {
        root: rootRect.toJSON(),
        main: layoutMain.getBoundingClientRect().toJSON(),
        metricsHeight: Math.round(metrics.getBoundingClientRect().height),
        toolbarHeight: Math.round(toolbar.getBoundingClientRect().height),
        workspaceHeight: Math.round(workspace.getBoundingClientRect().height),
        selectLeft: Math.round(selectRect.left),
        selectWidth: Math.round(selectRect.width),
        directoryLeft: Math.round(directoryRect.left),
        directoryWidth: Math.round(directoryRect.width),
        directoryRowHeight: Math.round(firstDirectoryItem.getBoundingClientRect().height),
        directoryOverflowY: getComputedStyle(directoryScroll).overflowY,
        tableOverflowY: getComputedStyle(tableViewport).overflowY,
        tableClientWidth: tableViewport.clientWidth,
        tableScrollWidth: tableViewport.scrollWidth,
        tableRowHeight: firstDataCell
          ? Math.round(firstDataCell.getBoundingClientRect().height)
          : null,
        tableElementWidth: Math.round(tableElement.getBoundingClientRect().width),
        headerWidths: headers.map((header) => Math.round(header.getBoundingClientRect().width)),
        headerBorders: headers.map((header) => getComputedStyle(header).borderRightWidth),
        cellBorders:
          cells.length === 5
            ? cells.map((cell) => getComputedStyle(cell).borderRightWidth)
            : [],
        documentScrollHeight: document.documentElement.scrollHeight,
        documentClientHeight: document.documentElement.clientHeight,
      }
    })

    workspaceHeights.push(layout.workspaceHeight)
    headerWidthsByViewport.push(layout.headerWidths)
    expect(layout.root.bottom).toBeCloseTo(layout.main.bottom, 0)
    expect(layout).toMatchObject({
      metricsHeight: 100,
      toolbarHeight: 32,
      selectWidth: 270,
      directoryWidth: 270,
      directoryRowHeight: 44,
      directoryOverflowY: 'auto',
      tableOverflowY: 'auto',
      headerBorders: ['1px', '1px', '1px', '1px', '0px'],
    })
    if (layout.tableRowHeight !== null) {
      expect(layout.tableRowHeight).toBe(44)
      expect(layout.cellBorders).toEqual(['1px', '1px', '1px', '1px', '0px'])
    } else {
      expect(layout.cellBorders).toEqual([])
    }
    if (viewportIndex === 0) {
      expect(layout.headerWidths).toEqual(baselineHeaderWidths)
    } else {
      layout.headerWidths.forEach((width, index) => {
        expect(width).toBeGreaterThanOrEqual(baselineHeaderWidths[index] ?? 0)
      })
    }
    expect(
      Math.abs(
        layout.headerWidths.reduce((total, width) => total + width, 0) -
          layout.tableElementWidth,
      ),
    ).toBeLessThanOrEqual(2)
    expect(layout.tableScrollWidth).toBeLessThanOrEqual(layout.tableClientWidth + 1)
    expect(layout.selectLeft).toBe(layout.directoryLeft)
    expect(layout.documentScrollHeight).toBe(layout.documentClientHeight)
  }

  expect(workspaceHeights[1]).toBeGreaterThan(workspaceHeights[0])
  expect(workspaceHeights[2]).toBeGreaterThan(workspaceHeights[1])
  baselineHeaderWidths.forEach((_, index) => {
    expect(headerWidthsByViewport[1]?.[index]).toBeGreaterThan(headerWidthsByViewport[0]?.[index] ?? 0)
    expect(headerWidthsByViewport[2]?.[index]).toBeGreaterThan(headerWidthsByViewport[1]?.[index] ?? 0)
  })
  await expect(page.getByRole('button', { name: '上传', exact: true })).toBeVisible()
  await expect(
    page.locator('.archive-file-table .arco-table-th').filter({ hasText: '版本号' }),
  ).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: '版本', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '更新', exact: true })).toHaveCount(0)
  await expect(page.getByText('同步模板', { exact: true })).toHaveCount(0)
})
