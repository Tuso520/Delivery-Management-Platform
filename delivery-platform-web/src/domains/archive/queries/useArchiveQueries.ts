import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQueries, useQuery } from '@tanstack/vue-query'

import { archiveApi } from '@/domains/archive/api/archive.api'
import {
  archiveTemplateApi,
  type ArchiveTemplateListParams,
} from '@/domains/archive/api/archive-template.api'
import { languageApi } from '@/api/language'
import { projectApi } from '@/domains/project/api/project.api'
import { queryKeys } from '@/query/keys'

export function useArchiveProjectOptionsQuery(
  keyword: MaybeRefOrGetter<string> = '',
  includeAllProjects: MaybeRefOrGetter<boolean> = false,
) {
  return useQuery({
    queryKey: computed(() => [
      ...queryKeys.archive.projectOptions(),
      toValue(keyword).trim(),
      toValue(includeAllProjects) ? 'all' : 'mine',
    ]),
    queryFn: () =>
      projectApi.getList({
        page: 1,
        pageSize: 100,
        keyword: toValue(keyword).trim() || undefined,
        sort: 'updatedAt:desc',
        scope: toValue(includeAllProjects) ? 'all' : 'mine',
        archiveReady: true,
      }),
  })
}

export function useArchiveTreeQuery(projectId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.archive.tree(toValue(projectId))),
    queryFn: () => archiveApi.getTree(toValue(projectId)),
    enabled: computed(() => Boolean(toValue(projectId))),
  })
}

export function useArchiveTemplateListQuery(params: MaybeRefOrGetter<ArchiveTemplateListParams>) {
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
        queryKey: [...queryKeys.archiveTemplates.formOptions(), 'languages'] as const,
        queryFn: languageApi.getList,
      },
    ],
  })
}
