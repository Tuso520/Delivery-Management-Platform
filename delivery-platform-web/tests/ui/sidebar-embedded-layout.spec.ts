import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test'

const adminUsername = process.env.E2E_ADMIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD

interface LocatorRoot {
  locator(selector: string): Locator
}

interface ShellMetrics {
  aside: { height: number; width: number; x: number; y: number }
  asideClientWidth: number
  asideScrollWidth: number
  body: { width: number; x: number }
  content: { width: number; x: number }
  flexBasis: string
  flexShrink: string
  maxWidth: string
  minWidth: string
  rowHeights: number[]
  rowWhiteSpace: string[]
  iconBoxes: Array<{ height: number; width: number }>
  loadedIcons: boolean[]
}

async function login(page: Page): Promise<void> {
  if (!adminUsername || !adminPassword) throw new Error('UI E2E credentials are required')

  const loginResponse = await page.request.post('/api/v1/auth/login', {
    data: { password: adminPassword, username: adminUsername },
  })
  expect(loginResponse.ok()).toBe(true)
  const sessionBody = await loginResponse.text()
  const session = JSON.parse(sessionBody) as { data?: { accessToken?: string } }
  expect(session.data?.accessToken).toBeTruthy()

  // The full release suite deliberately exercises many isolated browser contexts.
  // Reuse this real login response during bootstrap so this layout-only scenario
  // does not consume the stricter refresh-endpoint budget used by auth tests.
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({ body: sessionBody, contentType: 'application/json', status: 200 }),
  )
  await page.goto('/#/dashboard')
  await expect(page.locator('.layout-aside')).toBeVisible()
}

async function readShellMetrics(root: LocatorRoot): Promise<ShellMetrics> {
  const aside = root.locator('.layout-aside')
  const body = root.locator('.layout-body')
  const content = root.locator('.layout-content')
  await expect(aside).toBeVisible()

  const [asideBox, bodyBox, contentBox] = await Promise.all([
    aside.boundingBox(),
    body.boundingBox(),
    content.boundingBox(),
  ])
  if (!asideBox || !bodyBox || !contentBox) throw new Error('App Shell boxes must be measurable')

  const computed = await aside.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      asideClientWidth: element.clientWidth,
      asideScrollWidth: element.scrollWidth,
      flexBasis: style.flexBasis,
      flexShrink: style.flexShrink,
      maxWidth: style.maxWidth,
      minWidth: style.minWidth,
    }
  })
  const rows = root.locator('.arco-menu-inline-header, .arco-menu-item')
  const rowMetrics = await rows.evaluateAll((elements) =>
    elements.flatMap((element) => {
      const box = element.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return []
      const textContainer =
        element.querySelector('.arco-menu-item-inner, .arco-menu-title') ?? element
      return [{ height: box.height, whiteSpace: getComputedStyle(textContainer).whiteSpace }]
    }),
  )
  const iconBoxes = await root.locator('.menu-icon-box').evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()
      return { height: box.height, width: box.width }
    }),
  )
  const loadedIcons = await root.locator('img.figma-menu-icon').evaluateAll((elements) =>
    elements.map((element) => {
      const image = element as HTMLImageElement
      return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
    }),
  )

  return {
    aside: asideBox,
    body: bodyBox,
    content: contentBox,
    iconBoxes,
    loadedIcons,
    rowHeights: rowMetrics.map((row) => row.height),
    rowWhiteSpace: rowMetrics.map((row) => row.whiteSpace),
    ...computed,
  }
}

function expectExpandedShell(metrics: ShellMetrics, expectedViewportWidth: number): void {
  expect(metrics.aside.width).toBe(180)
  expect(metrics.minWidth).toBe('180px')
  expect(metrics.maxWidth).toBe('180px')
  expect(metrics.flexBasis).toBe('180px')
  expect(metrics.flexShrink).toBe('0')
  expect(metrics.asideScrollWidth).toBeLessThanOrEqual(metrics.asideClientWidth)
  expect(metrics.content.x).toBe(metrics.aside.x + metrics.aside.width)
  expect(metrics.content.width).toBe(expectedViewportWidth - metrics.aside.width)
  expect(metrics.body.width).toBe(expectedViewportWidth)
  expect(metrics.rowHeights.length).toBeGreaterThan(4)
  expect(metrics.rowHeights.every((height) => height === 40)).toBe(true)
  expect(metrics.rowWhiteSpace.every((whiteSpace) => whiteSpace === 'nowrap')).toBe(true)
  expect(metrics.iconBoxes.length).toBeGreaterThanOrEqual(4)
  expect(metrics.iconBoxes.every((box) => box.width === 18 && box.height === 18)).toBe(true)
  expect(metrics.loadedIcons.every(Boolean)).toBe(true)
}

async function createFeishuContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_WEB_BASE_URL,
    deviceScaleFactor: 1.5,
    locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 Lark/7.31.5 Electron/28.2.10 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 720, height: 540 },
  })
  await context.addInitScript(() => {
    window.sessionStorage.setItem('delivery-platform:feishu-auto-login-attempted', '1')
  })
  return context
}

test('match fixed sidebar across desktop viewport sizes and collapse transitions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 720 },
    { width: 760, height: 560 },
    { width: 560, height: 420 },
  ]) {
    await page.setViewportSize(viewport)
    await expect
      .poll(async () => (await page.locator('.layout-aside').boundingBox())?.width)
      .toBe(180)
    expectExpandedShell(await readShellMetrics(page), viewport.width)
  }

  await page.locator('.collapse-button').click()
  await expect.poll(async () => (await page.locator('.layout-aside').boundingBox())?.width).toBe(48)
  const collapsed = await readShellMetrics(page)
  expect(collapsed.aside.width).toBe(48)
  expect(collapsed.minWidth).toBe('48px')
  expect(collapsed.maxWidth).toBe('48px')
  expect(collapsed.flexBasis).toBe('48px')
  expect(collapsed.content.x).toBe(48)
  expect(collapsed.content.width).toBe(512)

  await page.locator('.brand').click()
  await expect
    .poll(async () => (await page.locator('.layout-aside').boundingBox())?.width)
    .toBe(180)
  expectExpandedShell(await readShellMetrics(page), 560)
})

test('match a scaled Feishu desktop webview and a constrained same-origin iframe', async ({
  browser,
}) => {
  const context = await createFeishuContext(browser)
  const page = await context.newPage()
  try {
    await login(page)
    expect(await page.evaluate(() => window.navigator.userAgent)).toContain('Lark/7.31.5')
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1.5)
    expectExpandedShell(await readShellMetrics(page), 720)

    await page.setContent(`
      <style>html, body { margin: 0; overflow: hidden; }</style>
      <iframe
        id="feishu-frame"
        src="/#/settings/system"
        title="飞书内嵌交付管理平台"
        style="display: block; width: 680px; height: 480px; border: 0"
      ></iframe>
    `)
    const embedded = page.frameLocator('#feishu-frame')
    await expect(embedded.locator('.layout-aside')).toBeVisible({ timeout: 30_000 })
    const embeddedMetrics = await readShellMetrics(embedded)
    expectExpandedShell(embeddedMetrics, 680)
    expect(embeddedMetrics.aside.height).toBe(420)
    expect(embeddedMetrics.aside.y).toBe(60)
  } finally {
    await context.close()
  }
})
