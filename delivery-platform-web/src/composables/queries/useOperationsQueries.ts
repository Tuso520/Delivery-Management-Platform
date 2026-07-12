import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import type { QueryApprovalTemplateParams } from '@/api/approval'
import { approvalTemplateApi } from '@/api/approval'
import { integrationApi } from '@/api/integration'
import { notificationApi } from '@/api/notification'
import type { QueryOperationLogParams } from '@/api/system'
import { operationLogApi, systemSettingsApi } from '@/api/system'
import { toolApi } from '@/api/tools'
import { queryKeys } from '@/query/keys'
import type { IntegrationProvider, IntegrationSyncLog } from '@/types/settings'

export function useToolsQuery(includeDisabled: MaybeRefOrGetter<boolean> = false) {
  return useQuery({
    queryKey: computed(() => queryKeys.tools.list(toValue(includeDisabled))),
    queryFn: () =>
      toolApi.getList(toValue(includeDisabled) ? { includeDisabled: true } : undefined),
  })
}

export function useSystemSettingsQuery() {
  return useQuery({ queryKey: queryKeys.settings.system(), queryFn: systemSettingsApi.get })
}

export function useSystemTimeQuery() {
  return useQuery({
    queryKey: queryKeys.settings.systemTime(),
    queryFn: systemSettingsApi.getSystemTime,
  })
}

export function useApprovalTemplatesQuery(params: MaybeRefOrGetter<QueryApprovalTemplateParams>) {
  return useQuery({
    queryKey: computed(() => queryKeys.settings.approvalTemplates(toValue(params))),
    queryFn: () => approvalTemplateApi.getList({ ...toValue(params) }),
  })
}

export function useIntegrationsQuery() {
  return useQuery({ queryKey: queryKeys.settings.integrations(), queryFn: integrationApi.getList })
}

export function useIntegrationLogsQuery(
  provider: MaybeRefOrGetter<IntegrationProvider | ''>,
  params: MaybeRefOrGetter<{
    page: number
    pageSize: number
    action?: IntegrationSyncLog['action']
    status?: string
  }>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery({
    queryKey: computed(() =>
      queryKeys.settings.integrationLogs(toValue(provider), toValue(params)),
    ),
    queryFn: () =>
      integrationApi.getSyncLogs(toValue(provider) as IntegrationProvider, { ...toValue(params) }),
    enabled: computed(() => Boolean(toValue(provider)) && toValue(enabled)),
  })
}

export function useAuditLogsQuery(params: MaybeRefOrGetter<QueryOperationLogParams>) {
  return useQuery({
    queryKey: computed(() => queryKeys.settings.auditLogs(toValue(params))),
    queryFn: () => operationLogApi.getList({ ...toValue(params) }),
  })
}

export function useAuditLogQuery(logId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.settings.auditLog(toValue(logId))),
    queryFn: () => operationLogApi.getById(toValue(logId)),
    enabled: computed(() => Boolean(toValue(logId))),
  })
}

export function useNotificationRulesQuery() {
  return useQuery({
    queryKey: queryKeys.settings.notificationRules(),
    queryFn: notificationApi.getRules,
  })
}
