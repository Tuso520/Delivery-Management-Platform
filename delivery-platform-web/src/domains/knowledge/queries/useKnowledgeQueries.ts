import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { queryKeys } from '@/query/keys'
import { knowledgeApi } from '../api/knowledge.api'
import type { QueryKnowledgeItemDto } from '../types/knowledge'

export function useKnowledgeListQuery(params: MaybeRefOrGetter<QueryKnowledgeItemDto>) {
  return useQuery({
    queryKey: computed(() => queryKeys.knowledge.list(toValue(params))),
    queryFn: () => knowledgeApi.getList({ ...toValue(params) }),
  })
}

export function useKnowledgeSummaryQuery() {
  return useQuery({ queryKey: queryKeys.knowledge.summary(), queryFn: knowledgeApi.getSummary })
}

export function useKnowledgeCategoryCountsQuery(keyword: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.knowledge.categoryCount(toValue(keyword))),
    queryFn: () => knowledgeApi.getCategoryCounts(toValue(keyword)),
  })
}

export function useKnowledgeDetailQuery(itemId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.knowledge.detail(toValue(itemId))),
    queryFn: () => knowledgeApi.getById(toValue(itemId)),
    enabled: computed(() => Boolean(toValue(itemId))),
  })
}
