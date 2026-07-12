import request from './request'
import type { PaginatedData, PaginationParams } from '@/types/api'
import type { OperationLog } from '@/types/system'
import type { SystemSettings, SystemTime, UpdateSystemSettingsDto } from '@/types/settings'

export interface QueryOperationLogParams extends PaginationParams {
  keyword?: string
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
    return request.get<PaginatedData<OperationLog>>('/audit-logs', { params })
  },

  getById(id: string) {
    return request.get<OperationLog>(`/audit-logs/${id}`)
  },
}

export const systemSettingsApi = {
  get() {
    return request.get<SystemSettings>('/system-settings')
  },

  update(data: UpdateSystemSettingsDto) {
    return request.patch<SystemSettings>('/system-settings', data)
  },

  getSystemTime() {
    return request.get<SystemTime>('/system-time')
  },
}

export const systemConfigApi = {
  getPublic() {
    return request.get<Record<string, string | null>>('/system-config/public', { silent: true })
  },
}
