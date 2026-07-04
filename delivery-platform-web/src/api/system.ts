import request from './request'
import type { PaginatedData, PaginationParams } from '@/types/api'
import type { OperationLog, SystemConfig, UpsertSystemConfigDto } from '@/types/system'

export interface QueryOperationLogParams extends PaginationParams {
  userId?: string
  module?: string
  action?: string
  targetType?: string
  startDate?: string
  endDate?: string
  result?: string
}

export const operationLogApi = {
  getList(params: QueryOperationLogParams) {
    return request.get<PaginatedData<OperationLog>>('/operation-logs', { params })
  },

  getById(id: string) {
    return request.get<OperationLog>(`/operation-logs/${id}`)
  },
}

export const systemConfigApi = {
  getPublic() {
    return request.get<Record<string, string | null>>('/system-config/public', { silent: true })
  },

  getAll() {
    return request.get<SystemConfig[]>('/system-config')
  },

  getByKey(key: string) {
    return request.get<SystemConfig>(`/system-config/${key}`)
  },

  upsert(key: string, data: UpsertSystemConfigDto) {
    return request.put<SystemConfig>(`/system-config/${key}`, data)
  },

  delete(key: string) {
    return request.delete<void>(`/system-config/${key}`)
  },

  getMany(keys: string[]) {
    return request.get<Record<string, string | null>>('/system-config/batch', {
      params: { keys: keys.join(',') },
    })
  },
}
