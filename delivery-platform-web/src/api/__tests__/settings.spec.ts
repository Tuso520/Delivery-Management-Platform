import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/api/request', () => ({ default: mocks }))

import { approvalTemplateApi } from '@/api/approval'
import { currencyApi } from '@/api/currency'
import { fieldConfigurationApi, fieldOptionsApi } from '@/api/field-configuration'
import { integrationApi } from '@/api/integration'
import { notificationApi } from '@/api/notification'
import { operationLogApi, systemSettingsApi } from '@/api/system'

describe('target settings API contracts', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('uses code-based currency commands and the target rate sync endpoint', () => {
    currencyApi.updateByCode('USD', { cnyRate: 7.2 })
    currencyApi.syncRates()
    currencyApi.lockRate('USD')
    currencyApi.unlockRate('USD')
    currencyApi.disable('USD')

    expect(mocks.patch).toHaveBeenCalledWith('/currencies/USD', { cnyRate: 7.2 })
    expect(mocks.post).toHaveBeenNthCalledWith(1, '/currencies/sync-rates')
    expect(mocks.post).toHaveBeenNthCalledWith(2, '/currencies/USD/lock')
    expect(mocks.post).toHaveBeenNthCalledWith(3, '/currencies/USD/unlock')
    expect(mocks.post).toHaveBeenNthCalledWith(4, '/currencies/USD/disable')
  })

  it('uses the standalone notification rule resource with PATCH and toggle', () => {
    const payload = {
      name: '档案待审核',
      eventType: 'PROJECT_ARCHIVE_FILE_SUBMITTED',
      channels: ['IN_APP'] as const,
      recipientPolicy: { type: 'BUSINESS_OWNER' as const, values: [] },
      enabled: true,
    }

    notificationApi.getRules()
    notificationApi.createRule({ ...payload, channels: [...payload.channels] })
    notificationApi.updateRule('rule-1', { name: '档案审核提醒' })
    notificationApi.toggleRule('rule-1')
    notificationApi.deleteRule('rule-1')

    expect(mocks.get).toHaveBeenCalledWith('/notification-rules')
    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
      '/notification-rules',
      { ...payload, channels: ['IN_APP'] },
    )
    expect(mocks.patch).toHaveBeenCalledWith('/notification-rules/rule-1', {
      name: '档案审核提醒',
    })
    expect(mocks.post).toHaveBeenNthCalledWith(2, '/notification-rules/rule-1/toggle')
    expect(mocks.delete).toHaveBeenCalledWith('/notification-rules/rule-1')
  })

  it('uses approval template CRUD without mixing in approval task actions', () => {
    const params = { page: 1, pageSize: 20, keyword: '档案' }
    approvalTemplateApi.getList(params)
    approvalTemplateApi.update('template-1', { enabled: false })
    approvalTemplateApi.toggle('template-1')
    approvalTemplateApi.delete('template-1')

    expect(mocks.get).toHaveBeenCalledWith('/approval-templates', { params })
    expect(mocks.patch).toHaveBeenCalledWith('/approval-templates/template-1', {
      enabled: false,
    })
    expect(mocks.post).toHaveBeenCalledWith('/approval-templates/template-1/toggle')
    expect(mocks.delete).toHaveBeenCalledWith('/approval-templates/template-1')
  })

  it('uses structured system settings, server time and audit log endpoints', () => {
    systemSettingsApi.get()
    systemSettingsApi.update({ security: { loginMaxAttempts: 6 } })
    systemSettingsApi.getSystemTime()
    operationLogApi.getList({ page: 1, pageSize: 20, keyword: 'trace-1' })
    operationLogApi.getById('log-1')

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/system-settings')
    expect(mocks.patch).toHaveBeenCalledWith('/system-settings', {
      security: { loginMaxAttempts: 6 },
    })
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/system-time')
    expect(mocks.get).toHaveBeenNthCalledWith(3, '/audit-logs', {
      params: { page: 1, pageSize: 20, keyword: 'trace-1' },
    })
    expect(mocks.get).toHaveBeenNthCalledWith(4, '/audit-logs/log-1')
  })

  it('limits target integration calls to provider-addressed resources', () => {
    integrationApi.getList()
    integrationApi.update('FEISHU', { appId: 'cli_app', isEnabled: false })
    integrationApi.test('FEISHU')
    integrationApi.syncContacts('FEISHU')
    integrationApi.testNotification('FEISHU')
    integrationApi.getSyncLogs('FEISHU', { page: 1, pageSize: 20 })

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/integrations')
    expect(mocks.patch).toHaveBeenCalledWith('/integrations/FEISHU', {
      appId: 'cli_app',
      isEnabled: false,
    })
    expect(mocks.post).toHaveBeenNthCalledWith(1, '/integrations/FEISHU/test')
    expect(mocks.post).toHaveBeenNthCalledWith(2, '/integrations/FEISHU/sync-contacts')
    expect(mocks.post).toHaveBeenNthCalledWith(3, '/integrations/FEISHU/test-notification')
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/integrations/FEISHU/sync-logs', {
      params: { page: 1, pageSize: 20 },
    })
  })

  it('uses the unified field configuration and business option endpoints', () => {
    fieldConfigurationApi.getCategories()
    fieldConfigurationApi.getValues('category-1', '中国')
    fieldConfigurationApi.create('category-1', { name: '日本', code: 'JP', sortOrder: 80 })
    fieldConfigurationApi.update('value-1', { name: '日本国', code: 'JP', sortOrder: 90 })
    fieldConfigurationApi.changeStatus('value-1', 'Inactive')
    fieldConfigurationApi.sort('category-1', [{ id: 'value-1', sortOrder: 10 }])
    fieldConfigurationApi.getReferenceStatus('value-1')
    fieldConfigurationApi.remove('value-1')
    fieldOptionsApi.getByCode('COUNTRY')

    expect(mocks.get).toHaveBeenCalledWith('/field-config/categories')
    expect(mocks.get).toHaveBeenCalledWith('/field-config/categories/category-1/values', { params: { keyword: '中国' } })
    expect(mocks.post).toHaveBeenCalledWith('/field-config/categories/category-1/values', { name: '日本', code: 'JP', sortOrder: 80 })
    expect(mocks.patch).toHaveBeenCalledWith('/field-config/values/value-1/status', { status: 'Inactive' })
    expect(mocks.put).toHaveBeenCalledWith('/field-config/categories/category-1/sort', { items: [{ id: 'value-1', sortOrder: 10 }] })
    expect(mocks.get).toHaveBeenCalledWith('/field-options/COUNTRY')
    expect(mocks.delete).toHaveBeenCalledWith('/field-config/values/value-1')
  })
})
