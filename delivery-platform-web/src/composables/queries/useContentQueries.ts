import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { knowledgeApi } from '@/api/knowledge'
import { reviewApi } from '@/api/review'
import { standardApi } from '@/api/standard'
import { queryKeys } from '@/query/keys'
import type { QueryKnowledgeItemDto } from '@/types/knowledge'
import type { QueryReviewTaskParams } from '@/types/review'
import type { QueryStandardDto } from '@/types/standard'

export function useReviewListQuery(params: MaybeRefOrGetter<QueryReviewTaskParams>) {
  return useQuery({
    queryKey: computed(() => queryKeys.reviews.list(toValue(params))),
    queryFn: () => reviewApi.getList({ ...toValue(params) }),
  })
}

export function useReviewSummaryQuery() {
  return useQuery({ queryKey: queryKeys.reviews.summary(), queryFn: reviewApi.getSummary })
}

export function useReviewDetailQuery(taskId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.reviews.detail(toValue(taskId))),
    queryFn: () => reviewApi.getById(toValue(taskId)),
    enabled: computed(() => Boolean(toValue(taskId))),
  })
}

export function useReviewHistoryQuery(taskId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.reviews.history(toValue(taskId))),
    queryFn: () => reviewApi.getHistory(toValue(taskId)),
    enabled: computed(() => Boolean(toValue(taskId))),
  })
}

export function useStandardListQuery(params: MaybeRefOrGetter<QueryStandardDto>) {
  return useQuery({
    queryKey: computed(() => queryKeys.standards.list(toValue(params))),
    queryFn: () => standardApi.getList({ ...toValue(params) }),
  })
}

export function useStandardSummaryQuery() {
  return useQuery({ queryKey: queryKeys.standards.summary(), queryFn: standardApi.getSummary })
}

export function useStandardDetailQuery(standardId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.standards.detail(toValue(standardId))),
    queryFn: () => standardApi.getById(toValue(standardId)),
    enabled: computed(() => Boolean(toValue(standardId))),
  })
}

export function useStandardRelationsQuery(standardId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.standards.relations(toValue(standardId))),
    queryFn: () => standardApi.getRelations(toValue(standardId)),
    enabled: computed(() => Boolean(toValue(standardId))),
  })
}

export function useKnowledgeListQuery(params: MaybeRefOrGetter<QueryKnowledgeItemDto>) {
  return useQuery({
    queryKey: computed(() => queryKeys.knowledge.list(toValue(params))),
    queryFn: () => knowledgeApi.getList({ ...toValue(params) }),
  })
}

export function useKnowledgeSummaryQuery() {
  return useQuery({ queryKey: queryKeys.knowledge.summary(), queryFn: knowledgeApi.getSummary })
}

export function useKnowledgeCategoriesQuery() {
  return useQuery({ queryKey: queryKeys.knowledge.categories(), queryFn: knowledgeApi.getCategories })
}

export function useKnowledgeDetailQuery(itemId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.knowledge.detail(toValue(itemId))),
    queryFn: () => knowledgeApi.getById(toValue(itemId)),
    enabled: computed(() => Boolean(toValue(itemId))),
  })
}
