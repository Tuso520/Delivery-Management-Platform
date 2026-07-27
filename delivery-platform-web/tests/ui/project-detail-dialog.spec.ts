import { expect, test, type Locator, type Page } from '@playwright/test'
import { resolve } from 'node:path'

const adminUsername = process.env.E2E_ADMIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const screenshotPath = resolve(
  process.cwd(),
  '../.ai-work/project-detail-dialog-1440x900.png',
)

function requireCredentials(): [string, string] {
  if (!adminUsername || !adminPassword) {
    throw new Error('UI E2E credentials are required')
  }
  return [adminUsername, adminPassword]
}

async function login(page: Page): Promise<void> {
  const [username, password] = requireCredentials()
  await page.goto('/#/login')
  await page.getByPlaceholder('用户名').fill(username)
  await page.getByPlaceholder('密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/u }).click()
  await page.waitForURL((url) => !url.hash.startsWith('#/login'))
}

function dialog(page: Page): Locator {
  return page.locator('.project-detail-dialog .arco-modal')
}

function formItem(scope: Locator, label: string): Locator {
  return scope
    .locator('.arco-form-item')
    .filter({ hasText: new RegExp(`^\\s*${label}`, 'u') })
    .first()
}

async function chooseFirst(scope: Locator, page: Page, label: string): Promise<void> {
  await formItem(scope, label).locator('.arco-select-view').click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
}

async function chooseOption(
  scope: Locator,
  page: Page,
  label: string,
  optionText: string,
): Promise<void> {
  await formItem(scope, label).locator('.arco-select-view').click()
  await page.keyboard.type(optionText)
  await page.keyboard.press('Enter')
}

async function addPayment(
  page: Page,
  name: string,
  amount: string,
  condition: string,
): Promise<void> {
  await dialog(page).getByRole('button', { name: '添加' }).click()
  const editor = page
    .locator('.arco-modal:visible')
    .filter({ hasText: /添加款项计划|编辑款项计划/u })
    .last()
  await expect(editor.getByText('添加款项计划', { exact: true })).toBeVisible()
  await formItem(editor, '付款项').locator('input').fill(name)
  await formItem(editor, '付款金额').locator('input').fill(amount)
  await formItem(editor, '付款条件').locator('textarea').fill(condition)
  await editor.getByRole('button', { name: '保存' }).click()
  await expect(editor).toBeHidden()
}

test('unified project dialog creates, edits and renders a persisted project read-only', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  await page.goto('/#/projects/create')

  const projectDialog = dialog(page)
  await expect(projectDialog).toBeVisible({ timeout: 60_000 })
  await expect(projectDialog.getByRole('heading', { name: '项目详情' })).toBeVisible()
  await expect(projectDialog.getByRole('button', { name: '保存' })).toBeVisible()
  await expect(projectDialog.getByRole('button', { name: '关闭' })).toHaveCSS(
    'border-radius',
    '0px',
  )
  await expect(projectDialog.getByRole('button', { name: '关闭' })).toHaveCSS('width', '32px')
  await expect
    .poll(async () => Math.round((await projectDialog.boundingBox())?.width ?? 0))
    .toBe(944)

  const metrics = await projectDialog.evaluate((element) => {
    const shell = element.querySelector<HTMLElement>('.dialog-shell')
    const header = element.querySelector<HTMLElement>('.dialog-header')
    const body = element.querySelector<HTMLElement>('.dialog-body')
    if (!shell || !header || !body) throw new Error('项目详情弹窗结构不完整')
    return {
      width: Math.round(element.getBoundingClientRect().width),
      height: Math.round(shell.getBoundingClientRect().height),
      headerHeight: Math.round(header.getBoundingClientRect().height),
      bodyOverflowY: getComputedStyle(body).overflowY,
    }
  })
  expect(metrics).toEqual({
    width: 944,
    height: 608,
    headerHeight: 48,
    bodyOverflowY: 'auto',
  })

  const contractName = `项目详情弹窗验收-${Date.now()}`
  await formItem(projectDialog, '合同名称').locator('input').fill(contractName)
  await formItem(projectDialog, '项目简称').locator('input').fill('弹窗验收')
  await formItem(projectDialog, '客户名称').locator('input').fill('真实浏览器验收客户')
  await formItem(projectDialog, '城市').locator('input').fill('河内')
  await chooseFirst(projectDialog, page, '客户类型')
  await chooseFirst(projectDialog, page, '合同类型')
  await chooseFirst(projectDialog, page, '产品类型')
  await chooseOption(projectDialog, page, '合同币种', 'VND')
  await formItem(projectDialog, '合同金额')
    .locator('input')
    .fill('9007199254740991.99')
  await chooseFirst(projectDialog, page, '档案模版')
  const stageSelect = formItem(projectDialog, '当前阶段').locator('.arco-select-view')
  await expect(stageSelect).toHaveClass(/arco-select-view-multiple/u)
  await stageSelect.click()
  const additionalStage = page
    .locator(
      '.arco-select-option:visible:not(.arco-select-option-disabled):not(.arco-select-option-selected)',
    )
    .first()
  await expect(additionalStage).toBeVisible()
  await additionalStage.click()
  await page.keyboard.press('Escape')
  await expect(stageSelect.locator('.arco-tag')).toHaveCount(2)

  await addPayment(
    page,
    '首付款',
    '4007199254740991.99',
    '合同签订并收到合规付款申请后支付，超长条件用于验证单行省略与悬停提示',
  )
  await addPayment(page, '尾款', '5000000000000000.00', '项目验收完成后支付')
  await expect(projectDialog.getByText('44.49%', { exact: true })).toBeVisible()
  await expect(projectDialog.getByText('55.51%', { exact: true })).toBeVisible()
  await expect(projectDialog.locator('.ratio-warning')).toHaveCount(0)

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/projects') &&
      response.request().method() === 'POST',
  )
  await projectDialog.getByRole('button', { name: '保存' }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.status()).toBe(201)
  const createEnvelope = (await createResponse.json()) as {
    data: { id: string; projectCode: string; currentStages: string[] }
  }
  expect(createEnvelope.data.projectCode).toMatch(/-\d{3}$/u)
  expect(createEnvelope.data.currentStages).toHaveLength(2)
  const projectId = createEnvelope.data.id
  await expect(projectDialog).toBeHidden()

  await page.goto(`/#/projects/${projectId}/edit`)
  await expect(projectDialog).toBeVisible({ timeout: 60_000 })
  await expect(formItem(projectDialog, '合同名称').locator('input')).toHaveValue(contractName)
  await expect(formItem(projectDialog, '当前阶段').locator('.arco-tag')).toHaveCount(2)
  await expect(projectDialog.locator('.payment-table-scroll tbody tr')).toHaveCount(2)

  await projectDialog
    .locator('.payment-table-scroll tbody tr')
    .filter({ hasText: '尾款' })
    .locator('.arco-radio')
    .click()
  await projectDialog.getByRole('button', { name: '删除' }).click()
  const deleteConfirmation = page
    .locator('.arco-modal:visible')
    .filter({ hasText: '删除款项计划' })
    .last()
  await expect(deleteConfirmation.getByText('删除款项计划', { exact: true })).toBeVisible()
  await deleteConfirmation.getByRole('button', { name: '删除' }).click()
  await expect(projectDialog.locator('.payment-table-scroll tbody tr')).toHaveCount(1)
  await expect(projectDialog.getByText('首付款', { exact: true })).toBeVisible()
  await addPayment(page, '验收尾款', '5000000000000000.00', '最终验收完成后支付')
  await formItem(projectDialog, '项目简称').locator('input').fill('弹窗验收-已编辑')

  const updateResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/projects/${projectId}`) &&
      response.request().method() === 'PATCH',
  )
  await projectDialog.getByRole('button', { name: '保存' }).click()
  expect((await updateResponsePromise).status()).toBe(200)
  await expect(projectDialog).toBeHidden()

  await page.goto(`/#/projects/${projectId}`)
  await expect(projectDialog).toBeVisible({ timeout: 60_000 })
  await expect(projectDialog.getByRole('button', { name: '保存' })).toHaveCount(0)
  await expect(projectDialog.getByRole('button', { name: /添加|编辑|删除/u })).toHaveCount(0)
  await expect(formItem(projectDialog, '项目简称').locator('input')).toHaveValue('弹窗验收-已编辑')
  await expect(projectDialog.getByText('验收尾款', { exact: true })).toBeVisible()
  await expect(projectDialog.locator('input:not([disabled])')).toHaveCount(0)
  await expect(projectDialog.locator('.payment-table-scroll .arco-checkbox:not(.arco-checkbox-disabled)'))
    .toHaveCount(0)

  await projectDialog.screenshot({ path: screenshotPath, animations: 'disabled' })
})

test('dirty edit requires confirmation and view mode remains safe at a smaller viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await login(page)
  await page.goto('/#/projects')
  await page.locator('.project-link').first().click()
  const projectDialog = dialog(page)
  await expect(projectDialog).toBeVisible({ timeout: 60_000 })
  const detailHash = new URL(page.url()).hash
  await expect(projectDialog.getByRole('button', { name: '保存' })).toHaveCount(0)
  await expect(projectDialog).toHaveCSS('max-width', '992px')
  await projectDialog.getByRole('button', { name: '关闭' }).click()
  await expect(projectDialog).toBeHidden()

  await page.goto(`${detailHash}/edit`)
  await expect(projectDialog).toBeVisible({ timeout: 60_000 })
  const shortNameInput = formItem(projectDialog, '项目简称').locator('input')
  await shortNameInput.fill(`${await shortNameInput.inputValue()}-未保存`)
  await projectDialog.getByRole('button', { name: '关闭' }).click()
  const confirmation = page.locator('.arco-modal:visible').last()
  await expect(confirmation.getByText('未保存修改', { exact: true })).toBeVisible()
  await expect(confirmation).toHaveClass(/business-confirm-dialog/u)
  await expect(confirmation).toHaveCSS('border-radius', '0px')
  await expect(confirmation.locator('.arco-modal-title-icon')).toBeHidden()
  await expect(confirmation.getByRole('button', { name: '放弃修改' })).toHaveCSS(
    'background-color',
    'rgb(22, 93, 255)',
  )
  await expect(confirmation.getByRole('button', { name: '放弃修改' })).toHaveCSS(
    'border-radius',
    '2px',
  )
  await confirmation.getByRole('button', { name: '继续编辑' }).click()
  await expect(projectDialog).toBeVisible()
})
