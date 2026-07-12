import request from './request'
import type {
  IntegrationActionResult,
  IntegrationConfig,
  IntegrationProvider,
  IntegrationSyncLog,
  IntegrationSyncLogPage,
  UpdateIntegrationDto,
} from '@/types/settings'

export const integrationApi = {
  getList() {
    return request.get<IntegrationConfig[]>('/integrations')
  },

  update(provider: IntegrationProvider, data: UpdateIntegrationDto) {
    return request.patch<IntegrationConfig>(`/integrations/${provider}`, data)
  },

  test(provider: IntegrationProvider) {
    return request.post<IntegrationActionResult>(`/integrations/${provider}/test`)
  },

  syncContacts(provider: IntegrationProvider) {
    return request.post<IntegrationActionResult>(`/integrations/${provider}/sync-contacts`)
  },

  testNotification(provider: IntegrationProvider) {
    return request.post<IntegrationActionResult>(`/integrations/${provider}/test-notification`)
  },

  getSyncLogs(
    provider: IntegrationProvider,
    params: {
      page: number
      pageSize: number
      action?: IntegrationSyncLog['action']
      status?: string
    },
  ) {
    return request.get<IntegrationSyncLogPage>(`/integrations/${provider}/sync-logs`, { params })
  },
}
