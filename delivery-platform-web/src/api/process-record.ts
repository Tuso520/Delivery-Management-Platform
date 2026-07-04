import request from './request'
import type { PaginatedData } from '@/types/api'
import type {
  ProcessRecordPayload,
  ProjectProcessRecord,
} from '@/types/process-record'

export const processRecordApi = {
  getList(params: {
    page: number
    pageSize: number
    projectId?: string
    recordType?: string
    keyword?: string
  }) {
    return request.get<PaginatedData<ProjectProcessRecord>>('/process-records', {
      params,
    })
  },
  getById(id: string) {
    return request.get<ProjectProcessRecord>(`/process-records/${id}`)
  },
  create(data: ProcessRecordPayload) {
    return request.post<ProjectProcessRecord>('/process-records', data)
  },
  update(id: string, data: Partial<ProcessRecordPayload>) {
    return request.put<ProjectProcessRecord>(`/process-records/${id}`, data)
  },
  delete(id: string) {
    return request.delete<void>(`/process-records/${id}`)
  },
}
