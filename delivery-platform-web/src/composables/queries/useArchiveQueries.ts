import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQueries, useQuery } from '@tanstack/vue-query'

import { archiveApi } from '@/api/archive'
import { archiveTemplateApi } from '@/api/archive-template'
import { countryApi } from '@/api/country'
import { languageApi } from '@/api/language'
import { projectApi } from '@/api/project'
import { queryKeys } from '@/query/keys'

export function useArchiveProjectOptionsQuery() {
  return useQuery({
    queryKey: queryKeys.archive.projectOptions(),
    queryFn: () => projectApi.getList({ page: 1, pageSize: 100, sort: 'updatedAt:desc' }),
  })
}

export function useArchiveTreeQuery(projectId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.archive.tree(toValue(projectId))),
    queryFn: () => archiveApi.getTree(toValue(projectId)),
    enabled: computed(() => Boolean(toValue(projectId))),
  })
}

export function useArchiveTemplateDiffQuery(
  projectId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.archive.templateDiff(toValue(projectId))),
    queryFn: () => archiveApi.getTemplateDiff(toValue(projectId)),
    enabled: computed(() => Boolean(toValue(projectId)) && toValue(enabled)),
  })
}

export function useArchiveTemplateListQuery(
  params: MaybeRefOrGetter<{
    keyword?: string
    projectType?: string
    countryCode?: string
    languageCode?: string
  }>,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.archiveTemplates.list(toValue(params))),
    queryFn: () => archiveTemplateApi.getList({ ...toValue(params) }),
  })
}

export function useArchiveTemplateDetailQuery(
  templateId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.archiveTemplates.detail(toValue(templateId))),
    queryFn: () => archiveTemplateApi.getById(toValue(templateId)),
    enabled: computed(() => Boolean(toValue(templateId)) && toValue(enabled)),
  })
}

export function useArchiveTemplateVersionsQuery(
  templateId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.archiveTemplates.versions(toValue(templateId))),
    queryFn: () => archiveTemplateApi.getVersions(toValue(templateId)),
    enabled: computed(() => Boolean(toValue(templateId)) && toValue(enabled)),
  })
}

export function useArchiveTemplateVersionQuery(
  versionId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.archiveTemplates.version(toValue(versionId))),
    queryFn: () => archiveTemplateApi.getVersion(toValue(versionId)),
    enabled: computed(() => Boolean(toValue(versionId)) && toValue(enabled)),
  })
}

export function useArchiveTemplateFormOptionsQueries() {
  return useQueries({
    queries: [
      {
        queryKey: [...queryKeys.archiveTemplates.formOptions(), 'countries'] as const,
        queryFn: () => countryApi.getList({ page: 1, pageSize: 100 }),
      },
      {
        queryKey: [...queryKeys.archiveTemplates.formOptions(), 'languages'] as const,
        queryFn: languageApi.getList,
      },
      {
        queryKey: queryKeys.projects.formOptions(),
        queryFn: projectApi.getConfiguration,
      },
    ],
  })
}
