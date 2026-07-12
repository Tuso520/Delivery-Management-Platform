import request from './request'
import type {
  ApproveReviewTaskDto,
  QueryReviewTaskParams,
  RejectReviewTaskDto,
  ReviewHistoryEvent,
  ReviewSummary,
  ReviewSummaryResponse,
  ReviewTask,
  ReviewTaskPage,
} from '@/types/review'

export function normalizeReviewSummary(summary: ReviewSummaryResponse): ReviewSummary {
  const pending = summary.pending ?? 0
  return {
    myPending: summary.myPending ?? pending,
    allPending: summary.allPending ?? pending,
    todayAdded: summary.todayAdded ?? 0,
    overdue: summary.overdue ?? 0,
  }
}

export const reviewApi = {
  async getSummary(): Promise<ReviewSummary> {
    const summary = await request.get<ReviewSummaryResponse>('/file-reviews/summary')
    return normalizeReviewSummary(summary)
  },

  getList(params: QueryReviewTaskParams) {
    return request.get<ReviewTaskPage>('/file-reviews', { params })
  },

  getById(taskId: string) {
    return request.get<ReviewTask>(`/file-reviews/${taskId}`)
  },

  approve(taskId: string, data: ApproveReviewTaskDto = {}) {
    return request.post<ReviewTask>(`/file-reviews/${taskId}/approve`, data)
  },

  reject(taskId: string, data: RejectReviewTaskDto) {
    return request.post<ReviewTask>(`/file-reviews/${taskId}/reject`, data)
  },

  getHistory(taskId: string) {
    return request.get<ReviewHistoryEvent[]>(`/file-reviews/${taskId}/history`)
  },
}
