import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  const viewports = [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ]
  const workspaceHeights: number[] = []

  await page.goto('/#/archive')
  await expect(page.locator('.archive-directory__item').first()).toBeVisible({
    timeout: 60_000,
  })

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)

    const layout = await page.locator('.archive-page').evaluate((root) => {
      const metrics = root.querySelector<HTMLElement>('.archive-metrics')
      const toolbar = root.querySelector<HTMLElement>('.archive-toolbar')
      const projectSelect = root.querySelector<HTMLElement>('.archive-project-select')
      const workspace = root.querySelector<HTMLElement>('.archive-workspace')
      const directory = root.querySelector<HTMLElement>('.archive-directory')
      const directoryScroll = root.querySelector<HTMLElement>('.archive-directory__scroll')
      const firstDirectoryItem = root.querySelector<HTMLElement>('.archive-directory__item')
      const tableViewport = root.querySelector<HTMLElement>('.business-table__viewport')
      const firstRow = root.querySelector<HTMLElement>('.arco-table-td')
      const headers = [...root.querySelectorAll<HTMLElement>('thead .arco-table-th')]
      const cells = [...root.querySelectorAll<HTMLElement>('tbody tr:first-child .arco-table-td')]
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
        !firstRow ||
        !layoutMain ||
        headers.length !== 6 ||
        cells.length !== 6
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
        tableRowHeight: Math.round(firstRow.getBoundingClientRect().height),
        headerWidths: headers.map((header) => Math.round(header.getBoundingClientRect().width)),
        headerBorders: headers.map((header) => getComputedStyle(header).borderRightWidth),
        cellBorders: cells.map((cell) => getComputedStyle(cell).borderRightWidth),
        documentScrollHeight: document.documentElement.scrollHeight,
        documentClientHeight: document.documentElement.clientHeight,
      }
    })

    workspaceHeights.push(layout.workspaceHeight)
    expect(layout.root.bottom).toBeCloseTo(layout.main.bottom, 0)
    expect(layout).toMatchObject({
      metricsHeight: 100,
      toolbarHeight: 32,
      selectWidth: 270,
      directoryWidth: 270,
      directoryRowHeight: 44,
      directoryOverflowY: 'auto',
      tableOverflowY: 'auto',
      tableRowHeight: 44,
      headerWidths: [340, 80, 100, 113, 122, 182],
      headerBorders: ['1px', '1px', '1px', '1px', '1px', '0px'],
      cellBorders: ['1px', '1px', '1px', '1px', '1px', '0px'],
    })
    expect(layout.selectLeft).toBe(layout.directoryLeft)
    expect(layout.documentScrollHeight).toBe(layout.documentClientHeight)
    await page.locator('.archive-page').screenshot({
      path: resolve(
        process.cwd(),
        '..',
        '.ai-work',
        'project-archive-43-317',
        `local-${viewport.width}x${viewport.height}.png`,
      ),
    })
  }

  expect(workspaceHeights[1]).toBeGreaterThan(workspaceHeights[0])
  expect(workspaceHeights[2]).toBeGreaterThan(workspaceHeights[1])
  await expect(page.getByRole('button', { name: '上传', exact: true })).toBeVisible()
  await expect(page.getByText('同步模板', { exact: true })).toHaveCount(0)
})

test('project archive preview, update, download and delete use the real local API', async ({
  page,
}) => {
  const pageErrors: string[] = []
  const failedApiResponses: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  await page.goto('/#/archive')
  const firstRow = page.locator('.archive-file-table tbody tr').first()
  await expect(firstRow).toBeVisible({ timeout: 60_000 })
  page.on('response', (response) => {
    if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/api/')) {
      failedApiResponses.push(`${response.status()} ${new URL(response.url()).pathname}`)
    }
  })
  const archiveItemName = (await firstRow.locator('.archive-file-name').textContent())?.trim()
  expect(archiveItemName).toBeTruthy()
  const folderName = (await page.locator('.archive-folder-heading h2').textContent())?.trim()
  expect(folderName).toBeTruthy()
  const uploadedFileName = `${folderName}-V1.0.docx`

  await firstRow.getByRole('button', { name: '更新', exact: true }).click()
  const uploadDialog = page.locator('.arco-modal').filter({ hasText: '上传档案文件' })
  await expect(uploadDialog).toBeVisible()
  const fileInput = uploadDialog.locator('input[type="file"]')
  const acceptedTypes = (await fileInput.getAttribute('accept')) ?? ''
  expect(acceptedTypes).toContain('.docx')
  const fixturePath = resolve(
    process.cwd(),
    '..',
    'delivery-platform-server',
    'prisma',
    'seed-files',
    'knowledge-catalog',
    '项目经理岗位职责.docx',
  )
  await fileInput.setInputFiles({
    name: uploadedFileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: readFileSync(fixturePath),
  })

  const uploadResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/archive-items\/[^/]+\/files$/u.test(new URL(response.url()).pathname),
  )
  await uploadDialog.getByRole('button', { name: '上传', exact: true }).click()
  const uploadResponse = await uploadResponsePromise
  expect(uploadResponse.ok(), await uploadResponse.text()).toBe(true)
  await expect(uploadDialog).toBeHidden()

  const fileLink = firstRow.getByRole('button', { name: uploadedFileName })
  await expect(fileLink).toBeVisible({ timeout: 30_000 })
  await expect(fileLink).toHaveCSS('color', 'rgb(22, 93, 255)')
  await expect(firstRow.getByRole('button', { name: '更新', exact: true })).toBeVisible()
  await expect(firstRow.getByRole('button', { name: '下载', exact: true })).toBeVisible()
  await expect(firstRow.getByRole('button', { name: '删除', exact: true })).toBeVisible()
  await page.locator('.archive-page').screenshot({
    path: resolve(
      process.cwd(),
      '..',
      '.ai-work',
      'project-archive-43-317',
      'local-operations-1440x900.png',
    ),
  })
  await fileLink.click()
  const previewDialog = page.locator('.attachment-preview-modal')
  await expect(previewDialog).toBeVisible({ timeout: 30_000 })
  await previewDialog.locator('.arco-modal-close-btn').click()
  await expect(previewDialog).toBeHidden()

  await page.route(
    '**/api/v1/files/*/download',
    (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 403,
          message: 'permission denied by the error-path assertion',
          data: null,
        }),
      }),
    { times: 1 },
  )
  const rejectedDownloadResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      /\/files\/[^/]+\/download$/u.test(new URL(response.url()).pathname),
  )
  await firstRow.getByRole('button', { name: '下载', exact: true }).click()
  const rejectedDownloadResponse = await rejectedDownloadResponsePromise
  expect(rejectedDownloadResponse.status()).toBe(403)
  await expect(page.getByText('文件下载失败，请检查权限后重试', { exact: true })).toBeVisible()
  failedApiResponses.length = 0

  const downloadPromise = page.waitForEvent('download')
  await firstRow.getByRole('button', { name: '下载', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(uploadedFileName)

  await page.route(
    '**/api/v1/files/*/archive',
    (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 403,
          message: 'permission denied by the error-path assertion',
          data: null,
        }),
      }),
    { times: 1 },
  )
  await firstRow.getByRole('button', { name: '删除', exact: true }).click()
  const rejectedDeleteDialog = page.locator('.arco-modal').filter({ hasText: '删除文件' })
  const rejectedDeleteResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/files\/[^/]+\/archive$/u.test(new URL(response.url()).pathname),
  )
  await rejectedDeleteDialog.getByRole('button', { name: '删除', exact: true }).click()
  const rejectedDeleteResponse = await rejectedDeleteResponsePromise
  expect(rejectedDeleteResponse.status()).toBe(403)
  await expect(page.getByText('文件删除失败，请检查权限后重试', { exact: true })).toBeVisible()
  await expect(firstRow.getByRole('button', { name: '删除', exact: true })).toBeVisible()
  failedApiResponses.length = 0

  await firstRow.getByRole('button', { name: '删除', exact: true }).click()
  const deleteDialog = page.locator('.arco-modal').filter({ hasText: '删除文件' })
  await expect(deleteDialog).toContainText('确认删除当前文件？历史版本记录将保留。')
  const deleteResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/files\/[^/]+\/archive$/u.test(new URL(response.url()).pathname),
  )
  await deleteDialog.getByRole('button', { name: '删除', exact: true }).click()
  const deleteResponse = await deleteResponsePromise
  expect(deleteResponse.ok()).toBe(true)
  await expect(firstRow.getByRole('button', { name: '下载', exact: true })).toHaveCount(0)
  await expect(firstRow.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)

  const projectControl = page.locator('.archive-project-select__control')
  const currentProjectName = (
    await projectControl.locator('.arco-select-view-value').textContent()
  )?.trim()
  await projectControl.click()
  const projectOptions = page.locator('.arco-select-dropdown:visible .arco-select-option')
  await expect(projectOptions.first()).toBeVisible()
  const optionNames = (await projectOptions.allTextContents()).map((name) => name.trim())
  const nextProjectIndex = optionNames.findIndex((name) => name && name !== currentProjectName)
  expect(nextProjectIndex).toBeGreaterThanOrEqual(0)
  const archiveTreeResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      /\/projects\/[^/]+\/archive-tree$/u.test(new URL(response.url()).pathname),
  )
  await projectOptions.nth(nextProjectIndex).click()
  const archiveTreeResponse = await archiveTreeResponsePromise
  expect(archiveTreeResponse.ok(), await archiveTreeResponse.text()).toBe(true)
  await expect(projectControl).toContainText(optionNames[nextProjectIndex] ?? '')
  await expect(page.locator('.archive-directory__item').first()).toBeVisible()

  expect(pageErrors).toEqual([])
  expect(failedApiResponses).toEqual([])
})
