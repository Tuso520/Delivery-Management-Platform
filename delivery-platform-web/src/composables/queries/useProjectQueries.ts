import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQueries, useQuery } from '@tanstack/vue-query'

import { countryApi } from '@/api/country'
import { currencyApi } from '@/api/currency'
import { languageApi } from '@/api/language'
import { archiveTemplateApi } from '@/api/archive-template'
import { projectApi } from '@/api/project'
import { projectPaymentApi } from '@/api/project-payment'
import { queryKeys } from '@/query/keys'
import type { ProjectScope, QueryProjectDto } from '@/types/project'

export function useProjectListQuery(params: MaybeRefOrGetter<QueryProjectDto>) {
  return useQuery({
    queryKey: computed(() => queryKeys.projects.list(toValue(params))),
    queryFn: () => projectApi.getList({ ...toValue(params) }),
  })
}

export function useProjectSummaryQuery(scope: MaybeRefOrGetter<ProjectScope> = 'mine') {
  return useQuery({
    queryKey: computed(() => [...queryKeys.projects.summary(), toValue(scope)]),
    queryFn: () => projectApi.getSummaryByScope(toValue(scope)),
  })
}

export function useArchivedProjectListQuery(params: MaybeRefOrGetter<QueryProjectDto>) {
  return useQuery({
    queryKey: computed(() => [...queryKeys.projects.lists(), 'archived', toValue(params)]),
    queryFn: () => projectApi.getArchived({ ...toValue(params) }),
  })
}

export function useProjectDetailQuery(projectId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.projects.detail(toValue(projectId))),
    queryFn: () => projectApi.getById(toValue(projectId)),
    enabled: computed(() => Boolean(toValue(projectId))),
  })
}

export function useProjectConfigurationQuery() {
  return useQuery({
    queryKey: queryKeys.projects.formOptions(),
    queryFn: () => projectApi.getConfiguration(),
  })
}

export function useProjectPaymentsQuery(
  projectId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.projects.payments(toValue(projectId))),
    queryFn: () =>
      projectPaymentApi.getList({
        page: 1,
        pageSize: 100,
        projectId: toValue(projectId),
      }),
    enabled: computed(() => Boolean(toValue(projectId)) && toValue(enabled)),
  })
}

export function useProjectUserOptionsQuery(
  purpose: 'sales-owner' | 'project-manager' | 'project-member',
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  return useQuery({
    queryKey: queryKeys.projects.userOptions(purpose),
    queryFn: () => projectApi.getUserOptions(purpose),
    enabled: computed(() => toValue(enabled)),
  })
}

export function useProjectFormOptionsQueries(
  includeArchiveTemplates: MaybeRefOrGetter<boolean> = true,
  includeInactiveConfiguration: MaybeRefOrGetter<boolean> = false,
) {
  return useQueries({
    queries: [
      {
        queryKey: [...queryKeys.projects.formOptions(), 'countries'] as const,
        queryFn: () => countryApi.getList({ pageSize: 100, status: 'Active' }),
      },
      {
        queryKey: [...queryKeys.projects.formOptions(), 'currencies'] as const,
        queryFn: currencyApi.getList,
      },
      {
        queryKey: [...queryKeys.projects.formOptions(), 'languages'] as const,
        queryFn: languageApi.getList,
      },
      {
        queryKey: computed(() => [...queryKeys.projects.formOptions(), { includeInactive: toValue(includeInactiveConfiguration) }]),
        queryFn: () => projectApi.getConfiguration(toValue(includeInactiveConfiguration)),
      },
      {
        queryKey: queryKeys.projects.userOptions('sales-owner'),
        queryFn: () => projectApi.getUserOptions('sales-owner'),
      },
      {
        queryKey: queryKeys.projects.userOptions('project-manager'),
        queryFn: () => projectApi.getUserOptions('project-manager'),
      },
      {
        queryKey: queryKeys.projects.userOptions('project-member'),
        queryFn: () => projectApi.getUserOptions('project-member'),
      },
      {
        queryKey: queryKeys.projects.archiveTemplateOptions(),
        queryFn: () => archiveTemplateApi.getList(),
        enabled: computed(() => toValue(includeArchiveTemplates)),
      },
    ],
  })
}
