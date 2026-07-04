import request from './request'
import type { PaginatedData } from '@/types/api'
import type {
  ProjectPayment,
  ProjectPaymentPayload,
} from '@/types/project-payment'

export const projectPaymentApi = {
  getList(params: { page: number; pageSize: number; projectId?: string }) {
    return request.get<PaginatedData<ProjectPayment>>('/project-payments', {
      params,
    })
  },
  create(data: ProjectPaymentPayload) {
    return request.post<ProjectPayment>('/project-payments', data)
  },
  update(id: string, data: Partial<ProjectPaymentPayload>) {
    return request.put<ProjectPayment>(`/project-payments/${id}`, data)
  },
  delete(id: string) {
    return request.delete<void>(`/project-payments/${id}`)
  },
}
