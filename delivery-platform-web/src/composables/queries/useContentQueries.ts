import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { reviewApi } from '@/platform/approval/review.api'
import { standardApi } from '@/api/standard'
import { queryKeys } from '@/query/keys'
import type { QueryReviewTaskParams } from '@/platform/approval/review.types'
import type { QueryStandardDto, StandardCategoryDimension } from '@/types/standard'

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

export function useStandardCategoryCountsQuery(
  dimension: MaybeRefOrGetter<StandardCategoryDimension>,
  keyword: MaybeRefOrGetter<string>,
) {
  return useQuery({
    queryKey: computed(() =>
      queryKeys.standards.categoryCounts(toValue(dimension), toValue(keyword)),
    ),
    queryFn: () => standardApi.getCategoryCounts(toValue(dimension), toValue(keyword)),
  })
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
