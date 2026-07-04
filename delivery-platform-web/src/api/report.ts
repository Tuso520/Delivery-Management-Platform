import request from './request'
import type { PaginatedData } from '@/types/api'
import type { DailyReport, CreateReportDto, UpdateReportDto, QueryReportDto } from '@/types/report'

export const reportApi = {
  getList(params: QueryReportDto) {
    const normalizedParams = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== '' && value != null),
    )
    return request.get<PaginatedData<DailyReport>>('/reports', {
      params: normalizedParams,
    })
  },

  getById(id: string) {
    return request.get<DailyReport>(`/reports/${id}`)
  },

  create(data: CreateReportDto) {
    return request.post<DailyReport>('/reports', data)
  },

  update(id: string, data: UpdateReportDto) {
    return request.put<DailyReport>(`/reports/${id}`, data)
  },

  delete(id: string) {
    return request.delete<void>(`/reports/${id}`)
  },

  submit(id: string) {
    return request.post<DailyReport>(`/reports/${id}/submit`)
  },

  review(id: string) {
    return request.post<DailyReport>(`/reports/${id}/review`)
  },

  getMyReports(params: QueryReportDto) {
    return request.get<PaginatedData<DailyReport>>('/reports/my-reports', { params })
  },

  getProjectSummary(projectId: string) {
    return request.get<{
      reports: DailyReport[]
      weeklyCount: number
      latestProgress: Array<{
        reportDate: string
        projectProgress: string | null
        paymentProgress: string | null
        riskNotes: string | null
      }>
      summary: string
    }>(`/reports/summary/project/${projectId}`)
  },
}
